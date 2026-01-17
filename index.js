const admin = require('firebase-admin');

// 1. إعداد الاتصال (تأكد من وجود ملف المفتاح)
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
});

const db = admin.database();
let isBusy = false;

/**
 * المحرك الأساسي لمعالجة التحويلات بأمان عالي
 */
async function processSecureTransfers() {
    const transfersRef = db.ref('requests/transfers');
    // جلب أول 5 طلبات تنتظر المعالجة
    const snap = await transfersRef.orderByChild('status').equalTo('pending').limitToFirst(5).once('value');
    
    if (!snap.exists()) return;

    const tasks = snap.val();
    for (const id in tasks) {
        const { from, to, amount, fromName } = tasks[id];
        
        try {
            console.log(`⏳ جاري معالجة تحويل: ${amount} SDM من ${fromName}...`);

            // العمل داخل Transaction لضمان دقة الرصيد
            const senderRef = db.ref(`users/${from}/sdmBalance`);
            const receiverRef = db.ref(`users/${to}/sdmBalance`);

            await senderRef.transaction((currentBalance) => {
                if (currentBalance === null) return 0;
                if (currentBalance < amount) {
                    console.log("❌ رصيد غير كافٍ للمرسل");
                    return; // إلغاء العملية
                }
                return currentBalance - amount;
            }, async (error, committed, snapshot) => {
                if (committed) {
                    // إذا نجح الخصم من المرسل، نقوم بالإضافة للمستلم وتحديث الحالة فوراً
                    const updates = {};
                    const now = Date.now();
                    
                    // إضافة للمستلم
                    await receiverRef.transaction(b => (b || 0) + amount);
                    
                    // تحديث حالة الطلب وسجل العمليات في خطوة واحدة (Atomic Update)
                    updates[`requests/transfers/${id}/status`] = 'completed';
                    updates[`requests/transfers/${id}/processedAt`] = now;
                    updates[`transactions/${id}`] = { from, to, amount, type: 'transfer', date: now };
                    
                    await db.ref().update(updates);

                    // إرسال تنبيهات فورية
                    sendAlert(from, `✅ تم تحويل ${amount} SDM بنجاح إلى المستلم.`, 'success');
                    sendAlert(to, `💰 استلمت تحويل بقيمة ${amount} SDM من ${fromName}.`, 'success');
                    
                    console.log(`✅ تمت العملية بنجاح: ${id}`);
                } else {
                    // إذا فشل الخصم بسبب الرصيد
                    await transfersRef.child(id).update({ status: 'failed', reason: 'رصيدك غير كافٍ' });
                    sendAlert(from, `❌ فشل التحويل: رصيدك الحالي لا يكفي.`, 'error');
                }
            });

        } catch (err) {
            console.error("Critical Transfer Error:", err.message);
        }
    }
}

/**
 * دالة إرسال التنبيهات
 */
function sendAlert(uid, msg, type) {
    db.ref(`alerts/${uid}`).push({
        msg,
        type,
        date: Date.now()
    });
}

/**
 * دالة تنظيف وصيانة النظام (تلقائية)
 */
async function maintenanceTask() {
    console.log("🧹 جاري فحص الاشتراكات والمنشورات القديمة...");
    const now = Date.now();
    
    // 1. إنهاء اشتراكات VIP المنتهية
    const vipSnap = await db.ref('users').orderByChild('vipStatus').equalTo('active').once('value');
    if (vipSnap.exists()) {
        vipSnap.forEach(uSnap => {
            const u = uSnap.val();
            if (u.vipExpiry && u.vipExpiry < now) {
                uSnap.ref.update({ vipStatus: 'expired' });
                sendAlert(uSnap.key, "💔 انتهى اشتراك VIP الخاص بك. قم بالتجديد للتمتع بالمميزات.", "info");
            }
        });
    }

    // 2. حذف التقييمات المعلقة ومعالجتها
    processRatings();
}

/**
 * معالجة التقييمات
 */
async function processRatings() {
    const queueRef = db.ref('rating_queue');
    const snap = await queueRef.limitToFirst(10).once('value');
    if (!snap.exists()) return;

    for (const id in snap.val()) {
        const { target, stars } = snap.val()[id];
        await db.ref(`users/${target}`).transaction((u) => {
            if (u) {
                const currentRating = u.rating || 5;
                const count = u.ratingCount || 0;
                u.rating = ((currentRating * count) + stars) / (count + 1);
                u.ratingCount = count + 1;
            }
            return u;
        });
        await queueRef.child(id).remove();
    }
}

// تشغيل المحرك الأساسي كل 5 ثوانٍ
setInterval(async () => {
    if (isBusy) return;
    isBusy = true;
    await processSecureTransfers();
    isBusy = false;
}, 5000);

// تشغيل الصيانة كل ساعة
setInterval(maintenanceTask, 3600000);

// البدء الفوري عند التشغيل
console.log("🤖 SDM Secure Bot is now Active...");
maintenanceTask();
