const admin = require('firebase-admin');
const http = require('http');

/**
 * 1. إعداد الاتصال بقاعدة البيانات Firebase
 */
try {
    const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;

    if (!serviceAccountRaw) {
        console.error("❌ خطأ: لم يتم العثور على متغير البيئة FIREBASE_SERVICE_ACCOUNT");
        process.exit(1);
    }

    const serviceAccount = JSON.parse(serviceAccountRaw);

    if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com" // تأكد من رابط قاعدة بياناتك
    });

    console.log("✅ تم الاتصال بـ Firebase بنجاح - البوت يعمل الآن.");
} catch (error) {
    console.error("❌ فشل في تشغيل Firebase:", error.message);
    process.exit(1);
}

const db = admin.database();
let isProcessing = false;

/**
 * 2. معالج اشتراكات VIP (جديد)
 */
async function processVipSubscriptions() {
    const vipRef = db.ref('requests/vip_subscriptions');
    const snap = await vipRef.orderByChild('status').equalTo('pending').limitToFirst(5).once('value');
    
    if (!snap.exists()) return;

    const tasks = snap.val();
    for (const id in tasks) {
        const { userId, days, cost, userName } = tasks[id];
        try {
            console.log(`[VIP] معالجة طلب لـ ${userName} (${days} يوم)`);
            const userRef = db.ref(`users/${userId}`);
            const userSnap = await userRef.once('value');
            const userData = userSnap.val();

            if (userData && Number(userData.sdmBalance) >= Number(cost)) {
                const now = Date.now();
                // حساب تاريخ الانتهاء (يوم * 24 ساعة * 60 دقيقة * 60 ثانية * 1000 ملي ثانية)
                const expiryDate = now + (days * 24 * 60 * 60 * 1000);
                
                const updates = {};
                // خصم الرصيد وتحديث الحالة
                updates[`users/${userId}/sdmBalance`] = Number(userData.sdmBalance) - Number(cost);
                updates[`users/${userId}/vipStatus`] = 'active';
                updates[`users/${userId}/vipExpiry`] = expiryDate;
                updates[`users/${userId}/vipSince`] = now;
                
                // إضافة سجل معاملة
                updates[`transactions/${id}`] = {
                    from: userId, to: 'SYSTEM', amount: cost, 
                    type: 'vip_purchase', details: `VIP ${days} Days`, date: now
                };

                // تحديث حالة الطلب
                updates[`requests/vip_subscriptions/${id}/status`] = 'completed';

                // إرسال تنبيه للمستخدم
                const alertKey = db.ref(`alerts/${userId}`).push().key;
                updates[`alerts/${userId}/${alertKey}`] = {
                    msg: `✨ مبروك! تم تفعيل اشتراك VIP لمدة ${days} يوم بنجاح.`,
                    type: 'success', date: now
                };

                await db.ref().update(updates);
                console.log(`[VIP SUCCESS] تم تفعيل الاشتراك لـ ${userName}`);
            } else {
                await vipRef.child(id).update({ status: 'failed', reason: 'رصيد غير كافٍ' });
                sendAlert(userId, `❌ فشل تفعيل VIP: رصيدك غير كافٍ.`, 'error');
            }
        } catch (e) { console.error("VIP Process Error:", e.message); }
    }
}

/**
 * 3. معالج التحويلات المالية
 */
async function processSecureTransfers() {
    const transfersRef = db.ref('requests/transfers');
    const snap = await transfersRef.orderByChild('status').equalTo('pending').limitToFirst(10).once('value');
    
    if (!snap.exists()) return;

    const tasks = snap.val();
    for (const id in tasks) {
        const { from, toId, amount, fromName } = tasks[id];
        try {
            const userQuery = await db.ref('users').orderByChild('numericId').equalTo(toId).once('value');
            if (!userQuery.exists()) {
                await transfersRef.child(id).update({ status: 'failed', reason: 'الرقم غير موجود' });
                sendAlert(from, `❌ الرقم (${toId}) غير مسجل في النظام.`, 'error');
                continue;
            }

            const receiverUid = Object.keys(userQuery.val())[0];
            const receiverData = userQuery.val()[receiverUid];
            const senderSnap = await db.ref(`users/${from}`).once('value');
            const senderData = senderSnap.val();

            if (from === receiverUid) {
                await transfersRef.child(id).update({ status: 'failed', reason: 'تحويل ذاتي' });
                continue;
            }

            if (Number(senderData.sdmBalance) >= Number(amount)) {
                const now = Date.now();
                const updates = {};
                updates[`users/${from}/sdmBalance`] = Number(senderData.sdmBalance) - Number(amount);
                updates[`users/${receiverUid}/sdmBalance`] = (Number(receiverData.sdmBalance) || 0) + Number(amount);
                updates[`requests/transfers/${id}/status`] = 'completed';
                updates[`transactions/${id}`] = {
                    from, to: receiverUid, fromName: senderData.n, toName: receiverData.n,
                    amount, type: 'transfer', date: now
                };

                const a1 = db.ref(`alerts/${receiverUid}`).push().key;
                updates[`alerts/${receiverUid}/${a1}`] = { msg: `💰 استلمت ${amount} SDM من ${senderData.n}.`, type: 'success', date: now };
                const a2 = db.ref(`alerts/${from}`).push().key;
                updates[`alerts/${from}/${a2}`] = { msg: `✅ تم تحويل ${amount} SDM إلى ${receiverData.n}.`, type: 'success', date: now };

                await db.ref().update(updates);
            } else {
                await transfersRef.child(id).update({ status: 'failed', reason: 'رصيد غير كافٍ' });
                sendAlert(from, `❌ رصيدك لا يكفي للتحويل.`, 'error');
            }
        } catch (err) { console.error("Transfer Error:", err.message); }
    }
}

/**
 * 4. نظام الصيانة (إيقاف VIP المنتهي)
 */
async function maintenanceTask() {
    const now = Date.now();
    try {
        const usersSnap = await db.ref('users').orderByChild('vipStatus').equalTo('active').once('value');
        if (usersSnap.exists()) {
            usersSnap.forEach(uSnap => {
                const u = uSnap.val();
                if (u.vipExpiry && u.vipExpiry < now) {
                    uSnap.ref.update({ vipStatus: 'expired' });
                    sendAlert(uSnap.key, "💔 انتهى اشتراك VIP الخاص بك. شكراً لاستخدامك خدمتنا.", "info");
                    console.log(`[MAINTENANCE] تم إنهاء اشتراك VIP لـ ${u.n}`);
                }
            });
        }
    } catch (e) { console.error("Maintenance Error:", e.message); }
}

function sendAlert(uid, msg, type) {
    db.ref(`alerts/${uid}`).push({ msg, type, date: Date.now() });
}

/**
 * 5. تشغيل المحركات
 */
setInterval(async () => {
    if (isProcessing) return;
    isProcessing = true;
    try {
        await processVipSubscriptions(); // فحص طلبات الـ VIP
        await processSecureTransfers();   // فحص طلبات التحويل
        // يمكنك إضافة معالج التقييمات هنا أيضاً إذا أردت
    } catch (err) { console.error("Engine Error:", err.message); }
    isProcessing = false;
}, 5000); // يعمل كل 5 ثوانٍ

setInterval(maintenanceTask, 3600000); // صيانة كل ساعة

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Sudan Market Bot is Running ✅');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`📡 Server on port ${PORT}`));
