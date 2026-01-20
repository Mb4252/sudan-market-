const admin = require('firebase-admin');
const express = require('express');
const app = express();

// --- 1. إعداد Firebase ---
// تأكد من ضبط متغير البيئة FIREBASE_SERVICE_ACCOUNT بمحتوى ملف الـ JSON
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error("❌ خطأ: لم يتم ضبط متغير FIREBASE_SERVICE_ACCOUNT.");
    process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com" 
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
 * 2. محرك نظام الوسيط (Escrow Engine)
 * المرحلة الأولى: حجز الأموال (تتم عند طلب الشراء)
 */
async function processEscrowLock() {
    const escRef = db.ref('requests/escrow_deals');
    try {
        const snap = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
        if (!snap.exists()) return;

        const deals = snap.val();
        for (const id in deals) {
            const deal = deals[id];
            const amount = parseFloat(deal.amount);

            console.log(`[Escrow] Locking funds for: ${deal.itemTitle}`);

            const buyerRef = db.ref(`users/${deal.buyerId}`);
            const result = await buyerRef.transaction(userData => {
                if (!userData) return userData;
                const balance = parseFloat(userData.sdmBalance || 0);
                if (balance < amount) return undefined; // إلغاء الترانزاكشن لو الرصيد قليل
                userData.sdmBalance = Number((balance - amount).toFixed(2));
                return userData;
            });

            if (result.committed) {
                // تحديث حالة الصفقة وتحديث المنشور ليصبح "قيد الشراء"
                await escRef.child(id).update({ status: 'secured', updatedAt: admin.database.ServerValue.TIMESTAMP });
                await db.ref(`${deal.path}/${deal.postId}`).update({ 
                    pending: true,
                    buyerId: deal.buyerId 
                });

                sendAlert(deal.buyerId, `🔒 تم حجز مبلغ ${amount} SDM عند الوسيط بنجاح.`, 'info');
                sendAlert(deal.sellerId, `🔔 خبر سار! قام شخص بحجز منتجك [${deal.itemTitle}]. سلم البضاعة لتستلم رصيدك.`, 'success');
            } else {
                await escRef.child(id).update({ status: 'failed_insufficient_funds' });
                sendAlert(deal.buyerId, `❌ فشل شراء [${deal.itemTitle}] بسبب نقص الرصيد.`, 'error');
            }
        }
    } catch (e) { console.error("Escrow Lock Error:", e.message); }
}

/**
 * المرحلة الثانية: تحرير الأموال (تتم عند تأكيد المشتري الاستلام)
 */
async function processEscrowRelease() {
    const escRef = db.ref('requests/escrow_deals');
    try {
        const snap = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
        if (!snap.exists()) return;

        const deals = snap.val();
        for (const id in deals) {
            const deal = deals[id];
            const amount = parseFloat(deal.amount);

            console.log(`[Escrow] Releasing funds for: ${deal.itemTitle}`);

            // 1. إضافة المال للبائع
            await db.ref(`users/${deal.sellerId}/sdmBalance`).transaction(current => {
                return Number(((current || 0) + amount).toFixed(2));
            });

            // 2. تحديث حالة المنشور ليكون "تم البيع" نهائياً
            await db.ref(`${deal.path}/${deal.postId}`).update({ 
                sold: true, 
                pending: false, 
                buyerId: deal.buyerId,
                soldDate: admin.database.ServerValue.TIMESTAMP 
            });

            // 3. إغلاق الصفقة
            await escRef.child(id).update({ 
                status: 'completed', 
                completedAt: admin.database.ServerValue.TIMESTAMP 
            });

            // 4. تسجيل العملية في الأرشيف
            await db.ref('transactions').push({
                type: 'escrow_completed',
                from: deal.buyerId,
                to: deal.sellerId,
                amount: amount,
                item: deal.itemTitle,
                date: admin.database.ServerValue.TIMESTAMP
            });

            sendAlert(deal.sellerId, `💰 تم تحرير المبلغ! وصلك ${amount} SDM مقابل بيع [${deal.itemTitle}].`, 'success');
            sendAlert(deal.buyerId, `✅ شكراً لك! تم تحويل المبلغ للبائع وإتمام العملية بنجاح.`, 'success');
        }
    } catch (e) { console.error("Escrow Release Error:", e.message); }
}

/**
 * 3. محرك التحويل المباشر (Direct Transfer)
 */
async function processTransfers() {
    try {
        const transRef = db.ref('requests/transfers');
        const snap = await transRef.orderByChild('status').equalTo('pending').once('value');
        if (!snap.exists()) return;

        const reqs = snap.val();
        for (const id in reqs) {
            const req = reqs[id];
            const amount = parseFloat(req.amount);

            // البحث عن المستلم برقم الـ 6 أرقام
            const targetSnap = await db.ref('users').orderByChild('numericId').equalTo(req.toId).once('value');
            if (!targetSnap.exists()) {
                await transRef.child(id).update({ status: 'failed_not_found' });
                sendAlert(req.from, `❌ الرقم ${req.toId} غير صحيح.`, 'error');
                continue;
            }

            const targetUid = Object.keys(targetSnap.val())[0];
            const targetName = targetSnap.val()[targetUid].n;

            // خصم الرصيد من المرسل
            const tx = await db.ref(`users/${req.from}`).transaction(u => {
                if (!u) return u;
                if ((u.sdmBalance || 0) < amount) return undefined;
                u.sdmBalance = Number((u.sdmBalance - amount).toFixed(2));
                return u;
            });

            if (tx.committed) {
                // إضافة الرصيد للمستلم
                await db.ref(`users/${targetUid}/sdmBalance`).transaction(b => Number(((b || 0) + amount).toFixed(2)));
                
                await transRef.child(id).update({ status: 'completed', toUid: targetUid });
                
                await db.ref('transactions').push({
                    type: 'transfer', from: req.from, to: targetUid, amount: amount, date: Date.now()
                });

                sendAlert(req.from, `✅ تم تحويل ${amount} SDM إلى ${targetName} بنجاح.`, 'success');
                sendAlert(targetUid, `💰 استلمت ${amount} SDM من ${req.fromName}.`, 'success');
            } else {
                await transRef.child(id).update({ status: 'failed_balance' });
                sendAlert(req.from, `❌ فشل التحويل: رصيدك غير كافٍ.`, 'error');
            }
        }
    } catch (e) { console.error("Transfer Error:", e.message); }
}

/**
 * 4. محرك اشتراكات VIP
 */
async function processVIP() {
    try {
        const snap = await db.ref('requests/vip_subscriptions').orderByChild('status').equalTo('pending').once('value');
        if (!snap.exists()) return;

        const reqs = snap.val();
        for (const id in reqs) {
            const req = reqs[id];
            const cost = parseFloat(req.cost);

            const tx = await db.ref(`users/${req.userId}`).transaction(u => {
                if (!u) return u;
                if ((u.sdmBalance || 0) < cost) return undefined;
                
                const now = Date.now();
                u.sdmBalance = Number((u.sdmBalance - cost).toFixed(2));
                u.vipStatus = 'active';
                u.vipExpiry = (u.vipExpiry > now ? u.vipExpiry : now) + (req.days * 86400000);
                return u;
            });

            if (tx.committed) {
                await db.ref(`requests/vip_subscriptions/${id}`).update({ status: 'completed' });
                sendAlert(req.userId, `👑 مبروك! تم تفعيل VIP لمدة ${req.days} يوم.`, 'success');
            } else {
                await db.ref(`requests/vip_subscriptions/${id}`).update({ status: 'failed_balance' });
                sendAlert(req.userId, `❌ فشل تفعيل VIP: الرصيد غير كافٍ.`, 'error');
            }
        }
    } catch (e) { console.error("VIP Error:", e.message); }
}

// --- التشغيل الدوري المحسن ---
setInterval(processEscrowLock, 5000);    // كل 5 ثوانٍ
setInterval(processEscrowRelease, 6000); // كل 6 ثوانٍ
setInterval(processTransfers, 8000);    // كل 8 ثوانٍ
setInterval(processVIP, 10000);          // كل 10 ثوانٍ

// سيرفر Keep Alive
app.get('/', (req, res) => res.send('SDM Safe Bot is Running... 🚀'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Bot Server Active on Port ${PORT}`));
