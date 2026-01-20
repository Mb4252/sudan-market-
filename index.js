const admin = require('firebase-admin');
const express = require('express');
const app = express();

/** 
 * 1. إعداد الاتصال بـ Firebase
 */
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error("❌ خطأ: لم يتم العثور على متغير البيئة FIREBASE_SERVICE_ACCOUNT");
    process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// تأكد من وضع رابط قاعدة البيانات الخاص بك هنا
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
});

const db = admin.database();

/** 
 * دالة مساعدة لإرسال التنبيهات
 */
function sendAlert(uid, msg, type = 'success') {
    db.ref(`alerts/${uid}`).push({
        msg: msg,
        type: type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}

/** 
 * 2. محرك نظام الوسيط (Escrow Engine)
 * يعالج (الحجز) و (تحرير الأموال)
 */
async function processEscrow() {
    const escRef = db.ref('requests/escrow_deals');

    try {
        // --- أولاً: حجز الأموال (عندما يطلب المشتري الشراء) ---
        const pendingLock = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
        if (pendingLock.exists()) {
            for (const [id, deal] of Object.entries(pendingLock.val())) {
                const amount = parseFloat(deal.amount);
                console.log(`[وسيط - حجز] جاري حجز مبلغ لصفقة: ${id}`);

                const result = await db.ref(`users/${deal.buyerId}`).transaction(u => {
                    if (!u) return u;
                    if ((u.sdmBalance || 0) < amount) return undefined;
                    u.sdmBalance = Number((u.sdmBalance - amount).toFixed(2));
                    return u;
                });

                if (result.committed) {
                    await escRef.child(id).update({ status: 'secured', updatedAt: admin.database.ServerValue.TIMESTAMP });
                    await db.ref(`${deal.path}/${deal.postId}`).update({ pending: true, buyerId: deal.buyerId });
                    sendAlert(deal.buyerId, `🔒 تم حجز ${amount} SDM عند الوسيط بنجاح.`, 'info');
                    sendAlert(deal.sellerId, `🔔 قام شخص بحجز منتجك [${deal.itemTitle}]، يرجى تسليمه لتلقي المال.`, 'success');
                } else {
                    await escRef.child(id).update({ status: 'failed_balance' });
                    sendAlert(deal.buyerId, `❌ فشل الحجز: رصيدك الحالي لا يكفي.`, 'error');
                }
            }
        }

        // --- ثانياً: تحرير الأموال (عندما يؤكد المشتري الاستلام) ---
        const pendingRelease = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
        if (pendingRelease.exists()) {
            for (const [id, deal] of Object.entries(pendingRelease.val())) {
                const amount = parseFloat(deal.amount);
                console.log(`[وسيط - تحرير] جاري تحويل المال للبائع في الصفقة: ${id}`);

                if (!deal.path || !deal.postId) {
                    console.error(`❌ خطأ: المسار (path) أو (postId) مفقود في الصفقة ${id}`);
                    continue;
                }

                // 1. إضافة المال للبائع
                await db.ref(`users/${deal.sellerId}/sdmBalance`).transaction(curr => Number(((curr || 0) + amount).toFixed(2)));

                // 2. تحديث حالة المنشور (تم البيع)
                await db.ref(`${deal.path}/${deal.postId}`).update({
                    sold: true,
                    pending: false,
                    soldDate: admin.database.ServerValue.TIMESTAMP
                });

                // 3. إغلاق الطلب
                await escRef.child(id).update({ status: 'completed', completedAt: admin.database.ServerValue.TIMESTAMP });

                // 4. إرسال تنبيهات وتسجيل معاملة
                await db.ref('transactions').push({
                    type: 'escrow_payout', from: deal.buyerId, to: deal.sellerId, amount: amount, item: deal.itemTitle, date: Date.now()
                });

                sendAlert(deal.sellerId, `💰 مبروك! استلمت ${amount} SDM مقابل بيع [${deal.itemTitle}].`, 'success');
                sendAlert(deal.buyerId, `✅ تم تحويل المال للبائع بنجاح. شكراً لثقتك بالوسيط.`, 'success');
                console.log(`✅ تمت الصفقة ${id} بنجاح وتم البيع.`);
            }
        }
    } catch (e) { console.error("Escrow Engine Error:", e.message); }
}

/** 
 * 3. محرك التحويل المباشر بين المستخدمين
 */
async function processTransfers() {
    try {
        const snap = await db.ref('requests/transfers').orderByChild('status').equalTo('pending').once('value');
        if (!snap.exists()) return;

        for (const [id, req] of Object.entries(snap.val())) {
            const amount = parseFloat(req.amount);

            // البحث عن المستلم برقم الـ 6 أرقام
            const targetSnap = await db.ref('users').orderByChild('numericId').equalTo(req.toId).once('value');
            if (!targetSnap.exists()) {
                await db.ref(`requests/transfers/${id}`).update({ status: 'failed_not_found' });
                sendAlert(req.from, `❌ الرقم ${req.toId} غير صحيح أو غير مسجل.`, 'error');
                continue;
            }

            const targetUid = Object.keys(targetSnap.val())[0];

            const tx = await db.ref(`users/${req.from}`).transaction(u => {
                if (!u) return u;
                if ((u.sdmBalance || 0) < amount) return undefined;
                u.sdmBalance = Number((u.sdmBalance - amount).toFixed(2));
                return u;
            });

            if (tx.committed) {
                await db.ref(`users/${targetUid}/sdmBalance`).transaction(b => Number(((b || 0) + amount).toFixed(2)));
                await db.ref(`requests/transfers/${id}`).update({ status: 'completed', toUid: targetUid });
                await db.ref('transactions').push({ type: 'transfer', from: req.from, to: targetUid, amount: amount, date: Date.now() });

                sendAlert(req.from, `✅ تم تحويل ${amount} SDM إلى ${req.toId} بنجاح.`, 'success');
                sendAlert(targetUid, `💰 استلمت ${amount} SDM من المستخدم ${req.fromName}.`, 'success');
            } else {
                await db.ref(`requests/transfers/${id}`).update({ status: 'failed_balance' });
                sendAlert(req.from, `❌ فشل التحويل: رصيدك لا يكفي.`, 'error');
            }
        }
    } catch (e) { console.error("Transfer Engine Error:", e.message); }
}

/** 
 * 4. محرك تفعيل الـ VIP
 */
async function processVIP() {
    try {
        const snap = await db.ref('requests/vip_subscriptions').orderByChild('status').equalTo('pending').once('value');
        if (!snap.exists()) return;

        for (const [id, req] of Object.entries(snap.val())) {
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
                sendAlert(req.userId, `👑 تم تفعيل اشتراك VIP لمدة ${req.days} يوم بنجاح.`, 'success');
            } else {
                await db.ref(`requests/vip_subscriptions/${id}`).update({ status: 'failed_balance' });
                sendAlert(req.userId, `❌ فشل تفعيل VIP: رصيدك غير كافٍ.`, 'error');
            }
        }
    } catch (e) { console.error("VIP Engine Error:", e.message); }
}

/** 
 * تشغيل المحركات بشكل دوري
 */
setInterval(() => {
    processEscrow();
    processTransfers();
    processVIP();
}, 7000); // يعمل كل 7 ثواني

// سيرفر Keep-Alive
app.get('/', (req, res) => res.send('SDM Market Safe Bot is Running... 🚀'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Bot Server started on port ${PORT}`));
