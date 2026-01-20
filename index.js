const admin = require('firebase-admin');
const express = require('express');
const app = express();

// --- 1. إعداد Firebase ---
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
});

const db = admin.database();

// دالة مساعدة لإرسال التنبيهات الفورية للمستخدم
function sendAlert(uid, msg, type = 'success') {
    db.ref(`alerts/${uid}`).push({
        msg: msg,
        type: type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}

// --- 2. محرك العمليات المالية (التحويلات والوسيط والـ VIP) ---
async function processEverything() {
    try {
        // [أ] معالجة تحويل الرصيد (عبر ID الـ 6 أرقام)
        const transRef = db.ref('requests/transfers');
        const transSnap = await transRef.orderByChild('status').equalTo('pending').once('value');
        if (transSnap.exists()) {
            for (const [id, t] of Object.entries(transSnap.val())) {
                const amount = parseFloat(t.amount);
                const userQuery = await db.ref('users').orderByChild('numericId').equalTo(String(t.toId)).once('value');
                
                if (userQuery.exists()) {
                    const targetUid = Object.keys(userQuery.val())[0];
                    const senderRef = db.ref(`users/${t.from}/sdmBalance`);
                    
                    const senderTx = await senderRef.transaction(currentBal => {
                        if (currentBal === null) return currentBal;
                        if (currentBal < amount) return undefined; 
                        return parseFloat((currentBal - amount).toFixed(2));
                    });

                    if (senderTx.committed) {
                        await db.ref(`users/${targetUid}/sdmBalance`).transaction(b => (b || 0) + amount);
                        await transRef.child(id).update({ status: 'completed' });
                        sendAlert(targetUid, `💰 استلمت ${amount} SDM من ${t.fromName}`, 'success');
                        sendAlert(t.from, `✅ تم تحويل ${amount} SDM للرقم ${t.toId}`, 'success');
                    } else {
                        await transRef.child(id).update({ status: 'failed_no_balance' });
                        sendAlert(t.from, `❌ فشل التحويل: رصيدك غير كافٍ`, 'error');
                    }
                } else {
                    await transRef.child(id).update({ status: 'failed_invalid_id' });
                    sendAlert(t.from, `❌ الرقم ${t.toId} غير موجود`, 'error');
                }
            }
        }

        // [ب] نظام الوسيط: المرحلة 1 (حجز المال عند الشراء)
        const escRef = db.ref('requests/escrow_deals');
        const pendingLock = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
        if (pendingLock.exists()) {
            for (const [id, d] of Object.entries(pendingLock.val())) {
                const buyerRef = db.ref(`users/${d.buyerId}/sdmBalance`);
                const amount = parseFloat(d.amount);

                const lockTx = await buyerRef.transaction(bal => {
                    if (bal === null) return bal;
                    if (bal < amount) return undefined;
                    return parseFloat((bal - amount).toFixed(2));
                });

                if (lockTx.committed) {
                    await escRef.child(id).update({ status: 'secured' });
                    // تحديث المنشور ليتفاعل مع دالة loadPosts (إخفاء زر الشراء وإظهار زر التأكيد)
                    await db.ref(`${d.path}/${d.postId}`).update({ pending: true, buyerId: d.buyerId });
                    sendAlert(d.buyerId, `🔒 تم حجز المبلغ. يرجى تأكيد الاستلام بعد وصول الغرض.`, 'info');
                    sendAlert(d.sellerId, `🔔 قام مشترٍ بحجز سلعتك: ${d.itemTitle}. سلمها له الآن.`, 'success');
                } else {
                    await escRef.child(id).update({ status: 'failed_no_balance' });
                    sendAlert(d.buyerId, `❌ رصيدك غير كافٍ للحجز.`, 'error');
                }
            }
        }

        // [ج] نظام الوسيط: المرحلة 2 (تحرير المال عند تأكيد المشتري)
        const pendingRelease = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
        if (pendingRelease.exists()) {
            for (const [id, d] of Object.entries(pendingRelease.val())) {
                const amount = parseFloat(d.amount);
                await db.ref(`users/${d.sellerId}/sdmBalance`).transaction(b => (b || 0) + amount);
                await escRef.child(id).update({ status: 'completed', completedAt: Date.now() });
                
                // تحديث المنشور: تم البيع (إخفاء جميع الأزرار)
                await db.ref(`${d.path}/${d.postId}`).update({ 
                    sold: true, 
                    pending: false, 
                    soldDate: admin.database.ServerValue.TIMESTAMP 
                });

                sendAlert(d.sellerId, `💰 استلمت ${amount} SDM مقابل بيع: ${d.itemTitle}`, 'success');
                sendAlert(d.buyerId, `✅ تم إنهاء الصفقة وتحويل المال للبائع.`, 'success');
            }
        }

        // [د] معالجة اشتراكات VIP
        const vipSnap = await db.ref('requests/vip_subscriptions').orderByChild('status').equalTo('pending').once('value');
        if (vipSnap.exists()) {
            for (const [id, v] of Object.entries(vipSnap.val())) {
                const cost = parseFloat(v.cost);
                const userRef = db.ref(`users/${v.userId}`);
                
                const tx = await userRef.transaction(u => {
                    if (u === null) return u;
                    if ((u.sdmBalance || 0) >= cost) {
                        const now = Date.now();
                        u.sdmBalance = parseFloat((u.sdmBalance - cost).toFixed(2));
                        u.vipStatus = 'active';
                        u.vipExpiry = ((u.vipExpiry > now) ? u.vipExpiry : now) + (v.days * 86400000);
                        return u;
                    }
                    return undefined;
                });

                if (tx.committed) {
                    await db.ref(`requests/vip_subscriptions/${id}`).update({ status: 'completed' });
                    sendAlert(v.userId, `👑 مبروك! تم تفعيل اشتراك VIP بنجاح.`, 'success');
                } else {
                    await db.ref(`requests/vip_subscriptions/${id}`).update({ status: 'failed' });
                    sendAlert(v.userId, `❌ رصيدك لا يكفي للاشتراك.`, 'error');
                }
            }
        }

    } catch (err) { console.error("Error:", err.message); }
}

// --- 3. محرك تنظيف السوق (حذف المنشورات بعد 24 ساعة) ---
async function cleanupMarket() {
    const paths = ['posts', 'vip_posts'];
    const now = Date.now();
    for (const path of paths) {
        const snap = await db.ref(path).orderByChild('sold').equalTo(true).once('value');
        if (snap.exists()) {
            for (const [id, post] of Object.entries(snap.val())) {
                if (post.soldDate && (now - post.soldDate) > (24 * 60 * 60 * 1000)) {
                    await db.ref(`${path}/${id}`).remove();
                    await db.ref(`comments/${path}/${id}`).remove();
                }
            }
        }
    }
}

// --- 4. تشغيل المجدول ---
setInterval(processEverything, 5000); // كل 5 ثوانٍ للعمليات المالية
setInterval(cleanupMarket, 3600000);  // كل ساعة للتنظيف

const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('SDM Market Core Bot is Active 🚀'));
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
