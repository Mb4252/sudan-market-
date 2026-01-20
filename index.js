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
    console.log("🚀 SDM Bot Started | Escrow & Finance Optimized");
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

// --- 2. محرك العمليات المالية (المحسن) ---
async function processFinance() {
    try {
        const escRef = db.ref('requests/escrow_deals');

        // [أ] معالجة الحجز (منع سحب الرصيد مرتين)
        const pendingSnap = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
        if (pendingSnap.exists()) {
            for (const [id, d] of Object.entries(pendingSnap.val())) {
                const amount = parseFloat(d.amount);
                const buyerRef = db.ref(`users/${d.buyerId}/sdmBalance`);

                await buyerRef.transaction(currentBal => {
                    if (currentBal === null) return 0;
                    if (parseFloat(currentBal) >= amount) {
                        return parseFloat((parseFloat(currentBal) - amount).toFixed(2));
                    }
                    return; // رصيد غير كافٍ
                }, async (error, committed) => {
                    if (committed) {
                        await escRef.child(id).update({ status: 'secured' });
                        sendAlert(d.buyerId, `✅ تم حجز مبلغ ${amount} SDM لشراء: ${d.itemTitle}`, 'success');
                        sendAlert(d.sellerId, `🔔 قام أحد المستخدمين بحجز سلعتك (${d.itemTitle}). يمكنك تسليمها الآن.`, 'info');
                    } else {
                        await escRef.child(id).update({ status: 'failed_insufficient_funds' });
                        // إعادة المنتج للسوق
                        db.ref(`posts/${d.postId}`).update({ pending: false });
                        db.ref(`vip_posts/${d.postId}`).update({ pending: false });
                        sendAlert(d.buyerId, `❌ فشل الحجز: رصيدك غير كافٍ لشراء ${d.itemTitle}`, 'error');
                    }
                });
            }
        }

        // [ب] معالجة الاستلام النهائي (تحويل المال للبائع)
        const confirmSnap = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
        if (confirmSnap.exists()) {
            for (const [id, d] of Object.entries(confirmSnap.val())) {
                const amount = parseFloat(d.amount);
                
                // إضافة الرصيد للبائع
                await db.ref(`users/${d.sellerId}/sdmBalance`).transaction(b => parseFloat(((b || 0) + amount).toFixed(2)));
                
                // إغلاق الصفقة وتحديث المنشور
                await escRef.child(id).update({ status: 'completed', completedDate: Date.now() });
                
                const postUpdate = { pending: false, sold: true, soldDate: Date.now() };
                db.ref(`posts/${d.postId}`).update(postUpdate).catch(() => {});
                db.ref(`vip_posts/${d.postId}`).update(postUpdate).catch(() => {});

                sendAlert(d.sellerId, `💰 تم إيداع ${amount} SDM في حسابك لبيع: ${d.itemTitle}`, 'success');
                sendAlert(d.buyerId, `📦 تم إغلاق صفقة ${d.itemTitle} بنجاح. شكراً لك!`, 'success');
            }
        }

        // [ج] معالجة تحويل الرصيد المباشر (عبر Numeric ID)
        const transRef = db.ref('requests/transfers');
        const transSnap = await transRef.orderByChild('status').equalTo('pending').once('value');
        if (transSnap.exists()) {
            for (const [id, t] of Object.entries(transSnap.val())) {
                const amount = parseFloat(t.amount);
                // البحث عن المستلم بواسطة الرقم التعريفي
                const userQuery = await db.ref('users').orderByChild('numericId').equalTo(String(t.toId)).once('value');
                
                if (userQuery.exists()) {
                    const targetUid = Object.keys(userQuery.val())[0];
                    
                    const senderTx = await db.ref(`users/${t.from}/sdmBalance`).transaction(bal => {
                        if (bal >= amount) return parseFloat((bal - amount).toFixed(2));
                        return;
                    });

                    if (senderTx.committed) {
                        await db.ref(`users/${targetUid}/sdmBalance`).transaction(b => parseFloat(((b || 0) + amount).toFixed(2)));
                        await transRef.child(id).update({ status: 'completed' });
                        sendAlert(targetUid, `💰 استلمت ${amount} SDM من ${t.fromName}`, 'success');
                        sendAlert(t.from, `✅ تم تحويل ${amount} SDM للرقم ${t.toId} بنجاح`, 'success');
                    }
                } else {
                    await transRef.child(id).update({ status: 'failed_invalid_id' });
                    sendAlert(t.from, `❌ الرقم التعريفي ${t.toId} غير موجود`, 'error');
                }
            }
        }

    } catch (err) {
        console.error("Finance Engine Error:", err);
    }
}

// --- 3. معالجة VIP والتقييمات ---
async function processOthers() {
    // 1. تفعيل VIP
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

    // 2. تحديث التقييمات
    const rateSnap = await db.ref('rating_queue').orderByChild('status').equalTo('pending').once('value');
    if (rateSnap.exists()) {
        for (const [id, r] of Object.entries(rateSnap.val())) {
            await db.ref(`users/${r.target}`).transaction(u => {
                if (u) {
                    const currentRating = parseFloat(u.rating || 5);
                    const count = parseInt(u.ratingCount || 1);
                    u.rating = ((currentRating * count) + parseFloat(r.stars)) / (count + 1);
                    u.ratingCount = count + 1;
                    return u;
                }
            });
            await db.ref(`rating_queue/${id}`).update({ status: 'completed' });
        }
    }
}

// --- 4. تشغيل المجدول ---
setInterval(processFinance, 6000); // كل 6 ثوانٍ للعمليات المالية
setInterval(processOthers, 20000); // كل 20 ثانية للـ VIP والتقييمات

// --- 5. واجهة السيرفر ---
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('SDM Market Bot is Running... 🚀'));
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
