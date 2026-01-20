const admin = require('firebase-admin');
const express = require('express');
const app = express();

/**
 * 1. إعداد الاتصال بـ Firebase
 */
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
}
const db = admin.database();

/**
 * دالة إرسال التنبيهات (Alerts) للمستخدمين في التطبيق
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
 * يعالج الحجز (Phase 1) والتحرير (Phase 2)
 */
async function processEscrow() {
    const escRef = db.ref('requests/escrow_deals');
    
    try {
        // --- المرحلة أ: حجز الأموال (Securing Funds) ---
        const lockSnap = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
        if (lockSnap.exists()) {
            console.log(`[الوسيط] وجد ${lockSnap.numChildren()} طلبات حجز جديدة.`);
            const deals = lockSnap.val();
            for (const id in deals) {
                const d = deals[id];
                const amount = parseFloat(d.amount);

                // تنفيذ عملية الخصم من المشتري
                const result = await db.ref(`users/${d.buyerId}`).transaction(userData => {
                    if (!userData) return userData;
                    const bal = parseFloat(userData.sdmBalance || 0);
                    if (bal < amount) return undefined; // إلغاء العملية لو الرصيد قليل
                    userData.sdmBalance = Number((bal - amount).toFixed(2));
                    return userData;
                });

                if (result.committed) {
                    // تحديث الحالة لـ "محجوز" وتجميد المنشور
                    await escRef.child(id).update({ status: 'secured', updatedAt: admin.database.ServerValue.TIMESTAMP });
                    await db.ref(`${d.path}/${d.postId}`).update({ pending: true, buyerId: d.buyerId });
                    
                    sendAlert(d.buyerId, `🔒 تم حجز ${amount} SDM عند الوسيط بنجاح.`, 'info');
                    sendAlert(d.sellerId, `🔔 قام شخص بحجز منتجك [${d.itemTitle}]، سلمه الآن لتلقي المال.`, 'success');
                    console.log(`✅ [حجز] تمت العملية بنجاح للصفقة: ${id}`);
                } else {
                    await escRef.child(id).update({ status: 'failed_balance' });
                    sendAlert(d.buyerId, `❌ فشل الحجز: رصيدك الحالي لا يكفي لشراء [${d.itemTitle}].`, 'error');
                }
            }
        }

        // --- المرحلة ب: تحرير الأموال (Releasing Funds) ---
        // يبحث عن الصفقات التي أكد المشتري استلامها (confirmed_by_buyer)
        const releaseSnap = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
        if (releaseSnap.exists()) {
            console.log(`[الوسيط] وجد ${releaseSnap.numChildren()} صفقة مؤكدة بانتظار التحرير.`);
            const deals = releaseSnap.val();
            for (const id in deals) {
                const d = deals[id];
                const amount = parseFloat(d.amount);

                console.log(`[تحرير] جاري نقل المال للبائع في الصفقة: ${id}`);

                // 1. إضافة المال للبائع
                await db.ref(`users/${d.sellerId}/sdmBalance`).transaction(curr => {
                    return Number(((curr || 0) + amount).toFixed(2));
                });

                // 2. تحديث حالة المنشور (تم البيع) نهائياً
                if (d.path && d.postId) {
                    await db.ref(`${d.path}/${d.postId}`).update({
                        sold: true,
                        pending: false,
                        soldDate: admin.database.ServerValue.TIMESTAMP
                    });
                }

                // 3. إغلاق الصفقة
                await escRef.child(id).update({
                    status: 'completed',
                    completedAt: admin.database.ServerValue.TIMESTAMP
                });

                // 4. تسجيل العملية في الأرشيف
                await db.ref('transactions').push({
                    type: 'escrow_completed', from: d.buyerId, to: d.sellerId, amount: amount, item: d.itemTitle, date: Date.now()
                });

                sendAlert(d.sellerId, `💰 وصلك ${amount} SDM! تم تأكيد بيع منتجك [${d.itemTitle}].`, 'success');
                sendAlert(d.buyerId, `✅ تم تحويل المال للبائع بنجاح. شكراً لتعاملك مع الوسيط الآمن.`, 'success');
                console.log(`✅ [اكتمال] تم إتمام الصفقة ${id} بالكامل.`);
            }
        }
    } catch (e) {
        console.error("❌ خطأ في محرك الوسيط:", e.message);
    }
}

/**
 * 3. محرك التحويل المباشر (Direct Transfers)
 */
async function processTransfers() {
    try {
        const snap = await db.ref('requests/transfers').orderByChild('status').equalTo('pending').once('value');
        if (!snap.exists()) return;

        const reqs = snap.val();
        for (const id in reqs) {
            const req = reqs[id];
            const amt = parseFloat(req.amount);

            // البحث عن المستلم برقم الـ 6 أرقام
            const targetSnap = await db.ref('users').orderByChild('numericId').equalTo(req.toId).once('value');
            if (!targetSnap.exists()) {
                await db.ref(`requests/transfers/${id}`).update({ status: 'failed_not_found' });
                sendAlert(req.from, `❌ الرقم ${req.toId} غير صحيح.`, 'error');
                continue;
            }

            const targetUid = Object.keys(targetSnap.val())[0];
            const tx = await db.ref(`users/${req.from}`).transaction(u => {
                if (!u) return u;
                if ((u.sdmBalance || 0) < amt) return undefined;
                u.sdmBalance = Number((u.sdmBalance - amt).toFixed(2));
                return u;
            });

            if (tx.committed) {
                await db.ref(`users/${targetUid}/sdmBalance`).transaction(b => Number(((b || 0) + amt).toFixed(2)));
                await db.ref(`requests/transfers/${id}`).update({ status: 'completed', toUid: targetUid });
                await db.ref('transactions').push({ type: 'transfer', from: req.from, to: targetUid, amount: amt, date: Date.now() });
                
                sendAlert(req.from, `✅ تم تحويل ${amt} SDM إلى ${req.toId} بنجاح.`, 'success');
                sendAlert(targetUid, `💰 استلمت ${amt} SDM من المرسل ${req.fromName}.`, 'success');
                console.log(`✅ [تحويل] من ${req.from} إلى ${targetUid}`);
            } else {
                await db.ref(`requests/transfers/${id}`).update({ status: 'failed_balance' });
                sendAlert(req.from, `❌ فشل التحويل: رصيدك غير كافٍ.`, 'error');
            }
        }
    } catch (e) { console.error("❌ خطأ في محرك التحويلات:", e.message); }
}

/**
 * 4. محرك اشتراكات VIP
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
                sendAlert(req.userId, `👑 مبروك! تم تفعيل اشتراك VIP لمدة ${req.days} يوم.`, 'success');
                console.log(`✅ [VIP] تم تفعيل الاشتراك للمستخدم: ${req.userId}`);
            } else {
                await db.ref(`requests/vip_subscriptions/${id}`).update({ status: 'failed_balance' });
                sendAlert(req.userId, `❌ فشل تفعيل VIP: الرصيد غير كافٍ.`, 'error');
            }
        }
    } catch (e) { console.error("❌ خطأ في محرك VIP:", e.message); }
}

/**
 * دالة التشغيل الدورية
 */
setInterval(async () => {
    // console.log("--- فحص المحركات ---");
    await processEscrow();
    await processTransfers();
    await processVIP();
}, 10000); // يعمل كل 10 ثواني

// سيرفر Keep-Alive لخدمة Render
app.get('/', (req, res) => res.send('SDM Safe Bot is Fully Active! 🚀'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Bot Server started on port ${PORT}`));
