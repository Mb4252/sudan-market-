const admin = require('firebase-admin');
const express = require('express');
const app = express();

// --- 1. إعداد Firebase ---
// ملاحظة: تأكد من وضع محتوى ملف الـ JSON الخاص بـ Service Account في متغير بيئة باسم FIREBASE_SERVICE_ACCOUNT
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error("❌ خطأ: لم يتم ضبط ملف الخدمة (FIREBASE_SERVICE_ACCOUNT) في إعدادات السيرفر.");
    process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com" // تأكد من صحة الرابط
});

const db = admin.database();

// دالة مساعدة لإرسال التنبيهات الفورية للمستخدمين
function sendAlert(uid, msg, type = 'success') {
    if (!uid) return;
    db.ref(`alerts/${uid}`).push({
        msg: msg,
        type: type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}

/**
 * 1. محرك نظام الوسيط (Escrow Engine)
 * يعالج حجز الأموال ثم تحويلها عند استلام البضاعة
 */
async function processEscrow() {
    const escRef = db.ref('requests/escrow_deals');

    // --- المرحلة أ: حجز المبلغ (Buyer -> System) ---
    try {
        const pendingLock = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
        if (pendingLock.exists()) {
            for (const [id, deal] of Object.entries(pendingLock.val())) {
                const amount = parseFloat(deal.amount);
                const buyerRef = db.ref(`users/${deal.buyerId}`);

                const lockTx = await buyerRef.transaction(userData => {
                    if (!userData) return userData;
                    const balance = parseFloat(userData.sdmBalance || 0);
                    if (balance < amount) return undefined; // الرصيد لا يكفي
                    userData.sdmBalance = Number((balance - amount).toFixed(2));
                    return userData;
                });

                if (lockTx.committed) {
                    // تحديث حالة الصفقة إلى "محجوزة" وتحديث المنشور
                    await escRef.child(id).update({ status: 'secured', updatedAt: admin.database.ServerValue.TIMESTAMP });
                    await db.ref(`${deal.path}/${deal.postId}`).update({ 
                        pending: true,
                        buyerId: deal.buyerId 
                    });

                    sendAlert(deal.buyerId, `🔒 تم حجز ${amount} SDM بنجاح. المبلغ الآن عند الوسيط.`, 'info');
                    sendAlert(deal.sellerId, `🔔 طلب شراء جديد لـ "${deal.itemTitle}". المبلغ محجوز، سلم السلعة الآن.`, 'success');
                    console.log(`[Escrow] Funds locked for deal: ${id}`);
                } else {
                    await escRef.child(id).update({ status: 'failed_insufficient_funds' });
                    sendAlert(deal.buyerId, `❌ فشل الحجز: رصيدك الحالي أقل من ${amount} SDM`, 'error');
                }
            }
        }
    } catch (e) { console.error("Escrow Phase 1 Error:", e.message); }

    // --- المرحلة ب: تحرير المبلغ للبائع (System -> Seller) ---
    try {
        const pendingRelease = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
        if (pendingRelease.exists()) {
            for (const [id, deal] of Object.entries(pendingRelease.val())) {
                const amount = parseFloat(deal.amount);
                
                // 1. إضافة المال للبائع
                const sellerRef = db.ref(`users/${deal.sellerId}/sdmBalance`);
                await sellerRef.transaction(currentBal => {
                    return Number(((currentBal || 0) + amount).toFixed(2));
                });

                // 2. تحديث المنشور ليكون "تم البيع" نهائياً
                await db.ref(`${deal.path}/${deal.postId}`).update({ 
                    sold: true, 
                    pending: false, 
                    soldDate: admin.database.ServerValue.TIMESTAMP 
                });

                // 3. إغلاق الصفقة بنجاح
                await escRef.child(id).update({ 
                    status: 'completed', 
                    completedAt: admin.database.ServerValue.TIMESTAMP 
                });

                // 4. تسجيل العملية في الأرشيف
                await db.ref('transactions').push({
                    type: 'escrow_payout',
                    from: deal.buyerId,
                    to: deal.sellerId,
                    amount: amount,
                    item: deal.itemTitle,
                    date: admin.database.ServerValue.TIMESTAMP
                });

                sendAlert(deal.sellerId, `💰 تم استلام ${amount} SDM في محفظتك مقابل بيع: ${deal.itemTitle}`, 'success');
                sendAlert(deal.buyerId, `✅ تم تحويل المال للبائع بنجاح. شكراً لثقتك بالوسيط.`, 'success');
                console.log(`[Escrow] Deal ${id} COMPLETED successfully.`);
            }
        }
    } catch (e) { console.error("Escrow Phase 2 Error:", e.message); }
}

/**
 * 2. محرك التحويل المباشر (Direct Transfer)
 * يبحث عن المستخدم بالرقم المكون من 6 أرقام ويحول له
 */
async function processTransfers() {
    try {
        const transRef = db.ref('requests/transfers');
        const snap = await transRef.orderByChild('status').equalTo('pending').once('value');

        if (snap.exists()) {
            for (const [id, req] of Object.entries(snap.val())) {
                const amount = parseFloat(req.amount);
                
                // البحث عن UID المستلم بواسطة NumericID
                const targetSnap = await db.ref('users').orderByChild('numericId').equalTo(req.toId).once('value');
                if (!targetSnap.exists()) {
                    await transRef.child(id).update({ status: 'failed_invalid_recipient' });
                    sendAlert(req.from, `❌ الرقم ${req.toId} غير مسجل في النظام.`, 'error');
                    continue;
                }

                const targetUid = Object.keys(targetSnap.val())[0];
                const senderRef = db.ref(`users/${req.from}`);

                const tx = await senderRef.transaction(senderData => {
                    if (!senderData) return senderData;
                    const bal = parseFloat(senderData.sdmBalance || 0);
                    if (bal < amount) return undefined;
                    senderData.sdmBalance = Number((bal - amount).toFixed(2));
                    return senderData;
                });

                if (tx.committed) {
                    // إضافة الرصيد للمستلم
                    await db.ref(`users/${targetUid}/sdmBalance`).transaction(b => Number(((b || 0) + amount).toFixed(2)));
                    await transRef.child(id).update({ status: 'completed', toUid: targetUid });

                    // تسجيل العملية
                    await db.ref('transactions').push({
                        type: 'transfer', from: req.from, to: targetUid, amount: amount, date: Date.now()
                    });

                    sendAlert(req.from, `✅ تم تحويل ${amount} SDM إلى ${req.toId} بنجاح.`, 'success');
                    sendAlert(targetUid, `💰 استلمت ${amount} SDM من المستخدم ${req.fromName}`, 'success');
                } else {
                    await transRef.child(id).update({ status: 'insufficient_funds' });
                    sendAlert(req.from, `❌ فشل التحويل: رصيدك لا يكفي.`, 'error');
                }
            }
        }
    } catch (e) { console.error("Transfer Engine Error:", e.message); }
}

/**
 * 3. محرك اشتراكات VIP
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
                        u.sdmBalance = Number((u.sdmBalance - cost).toFixed(2));
                        u.vipStatus = 'active';
                        u.vipExpiry = ((u.vipExpiry > now) ? u.vipExpiry : now) + (req.days * 86400000);
                        return u;
                    }
                    return undefined;
                });

                if (tx.committed) {
                    await db.ref(`requests/vip_subscriptions/${id}`).update({ status: 'completed' });
                    sendAlert(req.userId, `👑 مبروك! تم تفعيل اشتراك VIP لمدة ${req.days} يوم.`, 'success');
                } else {
                    await db.ref(`requests/vip_subscriptions/${id}`).update({ status: 'failed_insufficient_funds' });
                    sendAlert(req.userId, `❌ فشل تفعيل VIP: رصيدك غير كافٍ.`, 'error');
                }
            }
        }
    } catch (e) { console.error("VIP Engine Error:", e.message); }
}

// تشغيل المحركات بشكل دوري ومنفصل لضمان استقرار البوت
setInterval(processEscrow, 5000);   // كل 5 ثوانٍ
setInterval(processTransfers, 7000); // كل 7 ثوانٍ
setInterval(processVIP, 10000);      // كل 10 ثوانٍ

// سيرفر بسيط للبقاء حياً (Keep Alive)
app.get('/', (req, res) => res.send('SDM Market Safe Bot is Active! 🚀'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Bot Server started on port ${PORT}`));
