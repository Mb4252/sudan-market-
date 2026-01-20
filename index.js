const admin = require('firebase-admin');
const express = require('express');
const app = express();

// --- 1. إعداد Firebase ---
// تأكد من وضع ملف الخدمة في متغيرات البيئة في Render باسم FIREBASE_SERVICE_ACCOUNT
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error("❌ خطأ: لم يتم ضبط ملف الخدمة في إعدادات Render.");
    process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
});

const db = admin.database();

// دالة إرسال تنبيهات للمستخدمين داخل التطبيق
function sendAlert(uid, msg, type = 'success') {
    if (!uid) return;
    db.ref(`alerts/${uid}`).push({
        msg: msg,
        type: type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}

/**
 * محرك نظام الوسيط (Escrow Engine)
 */
async function processEscrow() {
    try {
        const escRef = db.ref('requests/escrow_deals');

        // --- المرحلة 1: حجز المبلغ (من المشتري إلى الوسيط) ---
        const pendingLock = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
        if (pendingLock.exists()) {
            for (const [id, deal] of Object.entries(pendingLock.val())) {
                const amount = parseFloat(deal.amount);
                const buyerRef = db.ref(`users/${deal.buyerId}`);

                const lockTx = await buyerRef.transaction(userData => {
                    if (!userData) return userData;
                    const balance = parseFloat(userData.sdmBalance || 0);
                    if (balance < amount) return undefined; 
                    userData.sdmBalance = parseFloat((balance - amount).toFixed(2));
                    return userData;
                });

                if (lockTx.committed) {
                    await escRef.child(id).update({ status: 'secured' });
                    // تحديث المنشور ليصبح "قيد الشراء"
                    await db.ref(`${deal.path}/${deal.postId}`).update({ 
                        pending: true,
                        buyerId: deal.buyerId 
                    });

                    sendAlert(deal.buyerId, `🔒 تم حجز ${amount} SDM. المبلغ الآن في عهدة الوسيط.`, 'info');
                    sendAlert(deal.sellerId, `🔔 طلب شراء لـ "${deal.itemTitle}". المبلغ محجوز، قم بتسليم السلعة الآن.`, 'success');
                    console.log(`[Escrow] Funds secured for deal: ${id}`);
                } else {
                    await escRef.child(id).update({ status: 'failed_insufficient_funds' });
                    sendAlert(deal.buyerId, `❌ فشل الحجز: رصيدك أقل من ${amount} SDM`, 'error');
                }
            }
        }

        // --- المرحلة 2: تحويل المال (من الوسيط إلى البائع) عند تأكيد المشتري ---
        const pendingRelease = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
        if (pendingRelease.exists()) {
            for (const [id, deal] of Object.entries(pendingRelease.val())) {
                const amount = parseFloat(deal.amount);
                
                try {
                    console.log(`[Escrow] Releasing funds for deal ${id}...`);

                    // 1. إضافة المال للبائع
                    const sellerRef = db.ref(`users/${deal.sellerId}/sdmBalance`);
                    await sellerRef.transaction(currentBal => {
                        return parseFloat(((currentBal || 0) + amount).toFixed(2));
                    });

                    // 2. تحديث حالة المنشور إلى "تم البيع" نهائياً
                    const postRef = db.ref(`${deal.path}/${deal.postId}`);
                    await postRef.update({ 
                        sold: true, 
                        pending: false, // إزالة علامة قيد الشراء
                        soldDate: admin.database.ServerValue.TIMESTAMP 
                    });

                    // 3. إغلاق الصفقة بنجاح
                    await escRef.child(id).update({ 
                        status: 'completed', 
                        completedAt: admin.database.ServerValue.TIMESTAMP 
                    });

                    // 4. تسجيل العملية في السجلات العامة
                    await db.ref('transactions').push({
                        type: 'escrow_payout',
                        from: deal.buyerId,
                        to: deal.sellerId,
                        amount: amount,
                        item: deal.itemTitle,
                        date: admin.database.ServerValue.TIMESTAMP
                    });

                    sendAlert(deal.sellerId, `💰 تم استلام ${amount} SDM مقابل: ${deal.itemTitle}`, 'success');
                    sendAlert(deal.buyerId, `✅ تم اكتمال العملية وتحويل المال للبائع.`, 'success');
                    console.log(`[Escrow] Deal ${id} completed successfully.`);
                } catch (err) {
                    console.error(`❌ Error in release stage for ${id}:`, err.message);
                }
            }
        }
    } catch (err) {
        console.error("❌ Escrow Engine Error:", err.message);
    }
}

/**
 * محرك التحويل المباشر (Direct Transfer)
 */
async function processTransfers() {
    try {
        const transRef = db.ref('requests/transfers');
        const snap = await transRef.orderByChild('status').equalTo('pending').once('value');

        if (snap.exists()) {
            for (const [id, req] of Object.entries(snap.val())) {
                const amount = parseFloat(req.amount);
                
                const targetSnap = await db.ref('users').orderByChild('numericId').equalTo(req.toId).once('value');
                if (!targetSnap.exists()) {
                    await transRef.child(id).update({ status: 'failed_invalid_recipient' });
                    sendAlert(req.from, `❌ الرقم ${req.toId} غير موجود.`, 'error');
                    continue;
                }

                const targetUid = Object.keys(targetSnap.val())[0];
                const senderRef = db.ref(`users/${req.from}`);

                const tx = await senderRef.transaction(senderData => {
                    if (!senderData) return senderData;
                    const bal = parseFloat(senderData.sdmBalance || 0);
                    if (bal < amount) return undefined;
                    senderData.sdmBalance = parseFloat((bal - amount).toFixed(2));
                    return senderData;
                });

                if (tx.committed) {
                    await db.ref(`users/${targetUid}/sdmBalance`).transaction(b => parseFloat(((b || 0) + amount).toFixed(2)));
                    await transRef.child(id).update({ status: 'completed', toUid: targetUid });

                    await db.ref('transactions').push({
                        type: 'transfer', from: req.from, to: targetUid, amount: amount, date: Date.now()
                    });

                    sendAlert(req.from, `✅ تم تحويل ${amount} SDM إلى ${req.toId}`, 'success');
                    sendAlert(targetUid, `💰 استلمت ${amount} SDM من ${req.fromName}`, 'success');
                } else {
                    await transRef.child(id).update({ status: 'insufficient_funds' });
                    sendAlert(req.from, `❌ رصيدك لا يكفي للتحويل.`, 'error');
                }
            }
        }
    } catch (e) { console.error("Transfer Error:", e.message); }
}

/**
 * محرك اشتراكات VIP
 */
async function processVIP() {
    try {
        const vipSnap = await db.ref('requests/vip_subscriptions').orderByChild('status').equalTo('pending').once('value');
        if (vipSnap.exists()) {
            for (const [id, req] of Object.entries(vipSnap.val())) {
                const userRef = db.ref(`users/${req.userId}`);
                const cost = parseFloat(req.cost);

                const tx = await userRef.transaction(u => {
                    if (!u) return u;
                    if ((u.sdmBalance || 0) >= cost) {
                        const now = Date.now();
                        u.sdmBalance = parseFloat((u.sdmBalance - cost).toFixed(2));
                        u.vipStatus = 'active';
                        u.vipExpiry = ((u.vipExpiry > now) ? u.vipExpiry : now) + (req.days * 86400000);
                        return u;
                    }
                    return undefined;
                });

                if (tx.committed) {
                    await db.ref(`requests/vip_subscriptions/${id}`).update({ status: 'completed' });
                    sendAlert(req.userId, `👑 تم تفعيل VIP لمدة ${req.days} يوم.`, 'success');
                } else {
                    await db.ref(`requests/vip_subscriptions/${id}`).update({ status: 'failed' });
                }
            }
        }
    } catch (e) { console.error("VIP Error:", e.message); }
}

// تشغيل المحركات بشكل دوري
setInterval(processEscrow, 5000);   // كل 5 ثوانٍ
setInterval(processTransfers, 6000); // كل 6 ثوانٍ
setInterval(processVIP, 10000);      // كل 10 ثوانٍ

// سيرفر بسيط للبقاء حياً
app.get('/', (req, res) => res.send('SDM Bot is Running... 🚀'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Bot Server running on port ${PORT}`));
