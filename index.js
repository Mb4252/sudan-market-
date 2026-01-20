const admin = require('firebase-admin');
const express = require('express');
const app = express();

// --- 1. إعداد Firebase ---
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
    console.log("🚀 SDM Market Bot Started | Escrow & Auto-Cleanup Enabled");
} catch (error) {
    console.error("❌ Initialization Error:", error.message);
    process.exit(1);
}

const db = admin.database();

// دالة إرسال تنبيه للمستخدم
function sendAlert(uid, msg, type = 'success') {
    db.ref(`alerts/${uid}`).push({
        msg,
        type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}

// --- 2. محرك العمليات المالية (التحويل + الوسيط) ---
async function processFinance() {
    try {
        // [أ] معالجة تحويل الرصيد المباشر (Numeric ID)
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
                        if (currentBal >= amount) return parseFloat((currentBal - amount).toFixed(2));
                        return undefined;
                    });

                    if (senderTx.committed) {
                        await db.ref(`users/${targetUid}/sdmBalance`).transaction(b => parseFloat(((b || 0) + amount).toFixed(2)));
                        await transRef.child(id).update({ status: 'completed' });
                        sendAlert(targetUid, `💰 استلمت ${amount} SDM من ${t.fromName}`, 'success');
                        sendAlert(t.from, `✅ تم تحويل ${amount} SDM بنجاح`, 'success');
                    }
                } else {
                    await transRef.child(id).update({ status: 'failed_invalid_id' });
                    sendAlert(t.from, `❌ الرقم التعريفي ${t.toId} غير موجود`, 'error');
                }
            }
        }

        // [ب] نظام الوسيط: المرحلة 1 (حجز المال من المشتري)
        const escRef = db.ref('requests/escrow_deals');
        const pendingLock = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
        if (pendingLock.exists()) {
            for (const [id, d] of Object.entries(pendingLock.val())) {
                const amount = parseFloat(d.amount);
                const buyerRef = db.ref(`users/${d.buyerId}/sdmBalance`);

                const lockTx = await buyerRef.transaction(bal => {
                    if (bal >= amount) return parseFloat((bal - amount).toFixed(2));
                    return undefined;
                });

                if (lockTx.committed) {
                    await escRef.child(id).update({ status: 'secured' });
                    // تحديث المنشور ليصبح "قيد الشراء" في السوق
                    await db.ref(`${d.path}/${d.postId}`).update({ pending: true });
                    
                    sendAlert(d.buyerId, `🔒 تم حجز ${amount} SDM لصفقة: ${d.itemTitle}`, 'success');
                    sendAlert(d.sellerId, `🔔 قام مشترٍ بحجز سلعتك (${d.itemTitle}). يرجى التسليم الآن.`, 'info');
                } else {
                    await escRef.child(id).update({ status: 'failed_insufficient_funds' });
                    await db.ref(`${d.path}/${d.postId}`).update({ pending: false });
                    sendAlert(d.buyerId, `❌ رصيدك لا يكفي لإتمام هذه الصفقة`, 'error');
                }
            }
        }

        // [ج] نظام الوسيط: المرحلة 2 (تسليم المال للبائع عند التأكيد)
        const pendingRelease = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
        if (pendingRelease.exists()) {
            for (const [id, d] of Object.entries(pendingRelease.val())) {
                const amount = parseFloat(d.amount);
                const sellerRef = db.ref(`users/${d.sellerId}/sdmBalance`);

                // تحويل المبلغ للبائع
                await sellerRef.transaction(b => parseFloat(((b || 0) + amount).toFixed(2)));
                
                // تحديث حالة الصفقة والمنشور
                await escRef.child(id).update({ status: 'completed', completedAt: Date.now() });
                await db.ref(`${d.path}/${d.postId}`).update({ 
                    sold: true, 
                    pending: false, 
                    soldDate: admin.database.ServerValue.TIMESTAMP 
                });

                sendAlert(d.sellerId, `💰 مبروك! استلمت ${amount} SDM مقابل بيع ${d.itemTitle}`, 'success');
                sendAlert(d.buyerId, `📦 تم إتمام صفقة ${d.itemTitle} بنجاح.`, 'success');
                console.log(`✅ Completed Escrow: ${d.itemTitle}`);
            }
        }

    } catch (err) {
        console.error("Finance Engine Error:", err.message);
    }
}

// --- 3. محرك التنظيف التلقائي (حذف المنشورات بعد 24 ساعة) ---
async function cleanupSoldPosts() {
    try {
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        const paths = ['posts', 'vip_posts'];

        for (const path of paths) {
            const snap = await db.ref(path).orderByChild('sold').equalTo(true).once('value');
            if (snap.exists()) {
                for (const [id, post] of Object.entries(snap.val())) {
                    if (post.soldDate && (now - post.soldDate) > oneDay) {
                        await db.ref(`${path}/${id}`).remove();
                        await db.ref(`comments/${path}/${id}`).remove();
                        console.log(`🗑️ Deleted expired sold post: ${id}`);
                    }
                }
            }
        }
    } catch (err) {
        console.error("Cleanup Engine Error:", err.message);
    }
}

// --- 4. معالجة VIP ---
async function processOthers() {
    try {
        const vipSnap = await db.ref('requests/vip_subscriptions').orderByChild('status').equalTo('pending').once('value');
        if (vipSnap.exists()) {
            for (const [id, v] of Object.entries(vipSnap.val())) {
                const cost = parseFloat(v.cost);
                const userRef = db.ref(`users/${v.userId}`);
                const tx = await userRef.transaction(u => {
                    if (u && (u.sdmBalance || 0) >= cost) {
                        const now = Date.now();
                        u.sdmBalance = parseFloat((u.sdmBalance - cost).toFixed(2));
                        u.vipStatus = 'active';
                        u.vipExpiry = ((u.vipExpiry > now) ? u.vipExpiry : now) + (v.days * 86400000);
                        return u;
                    }
                });
                if (tx.committed) {
                    await db.ref(`requests/vip_subscriptions/${id}`).update({ status: 'completed' });
                    sendAlert(v.userId, `👑 تم تفعيل اشتراك VIP بنجاح!`, 'success');
                }
            }
        }
    } catch (err) {
        console.error("Others Engine Error:", err.message);
    }
}

// --- 5. المجدول (Running Loops) ---
setInterval(processFinance, 6000);    // كل 6 ثوانٍ للعمليات المالية
setInterval(cleanupSoldPosts, 3600000); // كل ساعة لفحص المنشورات القديمة
setInterval(processOthers, 15000);    // كل 15 ثانية للـ VIP

// --- 6. واجهة السيرفر ---
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('SDM Market Bot is Running... 🚀'));
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
