const admin = require('firebase-admin');
const express = require('express');
const app = express();

// --- 1. التحقق من متغيرات البيئة ---
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error("❌ خطأ: لم يتم ضبط متغير FIREBASE_SERVICE_ACCOUNT في إعدادات Render.");
    process.exit(1);
}

// --- 2. إعداد Firebase ---
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
    console.log("🚀 SDM Secure Bot Started | المحرك يعمل بنجاح وبانتظار العمليات...");
} catch (error) {
    console.error("❌ خطأ في تنسيق JSON لملف Firebase:", error.message);
    process.exit(1);
}

const db = admin.database();

// دالة مساعدة لإرسال تنبيهات فورية للمستخدم داخل التطبيق
function sendAlert(uid, msg, type = 'success') {
    if (!uid) return;
    db.ref(`alerts/${uid}`).push({
        msg: msg,
        type: type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}

/**
 * [أ] محرك نظام الوسيط (Escrow Engine)
 * المسؤول عن حجز الأموال وتحويلها للبائع بعد تأكيد الاستلام
 */
async function processEscrow() {
    try {
        const escRef = db.ref('requests/escrow_deals');

        // 1. مرحلة حجز المبلغ (Pending Delivery -> Secured)
        const pendingLock = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
        if (pendingLock.exists()) {
            for (const [id, deal] of Object.entries(pendingLock.val())) {
                const amount = parseFloat(deal.amount);
                const buyerRef = db.ref(`users/${deal.buyerId}`);

                const lockTx = await buyerRef.transaction(userData => {
                    if (!userData) return userData;
                    const balance = parseFloat(userData.sdmBalance || 0);
                    if (balance < amount) return undefined; // إلغاء إذا الرصيد غير كافٍ
                    userData.sdmBalance = parseFloat((balance - amount).toFixed(2));
                    return userData;
                });

                if (lockTx.committed) {
                    // تحديث حالة الصفقة والمنشور
                    await escRef.child(id).update({ status: 'secured' });
                    await db.ref(`${deal.path}/${deal.postId}`).update({ 
                        pending: true,
                        buyerId: deal.buyerId 
                    });

                    sendAlert(deal.buyerId, `🔒 تم حجز ${amount} SDM. المبلغ الآن في عهدة الوسيط.`, 'info');
                    sendAlert(deal.sellerId, `🔔 طلب شراء جديد لـ "${deal.itemTitle}". المبلغ محجوز لدى الوسيط، يمكنك تسليم السلعة الآن.`, 'success');
                    console.log(`[Escrow] Funds locked for deal: ${id}`);
                } else {
                    await escRef.child(id).update({ status: 'failed_insufficient_funds' });
                    sendAlert(deal.buyerId, `❌ فشل الحجز: رصيدك الحالي أقل من ${amount} SDM`, 'error');
                }
            }
        }

        // 2. مرحلة تحويل المال للبائع (Confirmed by Buyer -> Completed)
        const pendingRelease = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
        if (pendingRelease.exists()) {
            for (const [id, deal] of Object.entries(pendingRelease.val())) {
                const amount = parseFloat(deal.amount);
                const sellerRef = db.ref(`users/${deal.sellerId}/sdmBalance`);

                // إضافة المال للبائع
                await sellerRef.transaction(currentBal => {
                    return parseFloat(((currentBal || 0) + amount).toFixed(2));
                });

                // إغلاق الصفقة وتحديث المنشور
                await escRef.child(id).update({ 
                    status: 'completed', 
                    completedAt: admin.database.ServerValue.TIMESTAMP 
                });

                await db.ref(`${deal.path}/${deal.postId}`).update({ 
                    sold: true, 
                    pending: false,
                    soldDate: admin.database.ServerValue.TIMESTAMP 
                });

                // تسجيل المعاملة
                await db.ref('transactions').push({
                    type: 'escrow_payout',
                    from: deal.buyerId,
                    to: deal.sellerId,
                    amount: amount,
                    item: deal.itemTitle,
                    date: admin.database.ServerValue.TIMESTAMP
                });

                sendAlert(deal.sellerId, `💰 تم استلام ${amount} SDM في محفظتك مقابل: ${deal.itemTitle}`, 'success');
                sendAlert(deal.buyerId, `✅ تم تحويل المال للبائع. شكراً لاستخدامك الوسيط الآمن.`, 'success');
                console.log(`[Escrow] Deal completed: ${id}`);
            }
        }
    } catch (err) {
        console.error("❌ Escrow Engine Error:", err.message);
    }
}

/**
 * [ب] محرك تحويل العملات (Transfer Engine)
 * يعالج طلبات التحويل المباشر بين المستخدمين باستخدام المعرف الرقمي (Numeric ID)
 */
async function processTransfers() {
    try {
        const transRef = db.ref('requests/transfers');
        const snap = await transRef.orderByChild('status').equalTo('pending').once('value');

        if (snap.exists()) {
            for (const [id, req] of Object.entries(snap.val())) {
                const amount = parseFloat(req.amount);
                
                // البحث عن المستلم عبر معرفه الرقمي (6 أرقام)
                const targetSnap = await db.ref('users').orderByChild('numericId').equalTo(req.toId).once('value');
                
                if (!targetSnap.exists()) {
                    await transRef.child(id).update({ status: 'failed_invalid_recipient' });
                    sendAlert(req.from, `❌ فشل التحويل: الرقم ${req.toId} غير موجود.`, 'error');
                    continue;
                }

                const targetUid = Object.keys(targetSnap.val())[0];
                const senderRef = db.ref(`users/${req.from}`);

                // تنفيذ عملية التحويل
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
                    sendAlert(req.from, `❌ رصيدك لا يكفي لتحويل ${amount} SDM`, 'error');
                }
            }
        }
    } catch (e) { console.error("Transfer Error:", e.message); }
}

/**
 * [ج] محرك اشتراكات VIP
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
                    sendAlert(req.userId, `👑 مبروك! تم تفعيل VIP لمدة ${req.days} يوم.`, 'success');
                } else {
                    await db.ref(`requests/vip_subscriptions/${id}`).update({ status: 'failed' });
                    sendAlert(req.userId, `❌ فشل تفعيل VIP: رصيدك غير كافٍ.`, 'error');
                }
            }
        }
    } catch (e) { console.error("VIP Error:", e.message); }
}

// المجدولات الزمنية
setInterval(processEscrow, 5000);   // كل 5 ثوانٍ
setInterval(processTransfers, 7000); // كل 7 ثوانٍ
setInterval(processVIP, 10000);      // كل 10 ثوانٍ

// سيرفر للبقاء حياً على Render
app.get('/', (req, res) => res.send('SDM Secure Bot Status: Active 🚀'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Monitor Server running on port ${PORT}`));
