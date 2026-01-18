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
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });

    console.log("✅ تم الاتصال بـ Firebase بنجاح.");
} catch (error) {
    console.error("❌ فشل في تشغيل Firebase:", error.message);
    process.exit(1);
}

const db = admin.database();
let isProcessing = false;

/**
 * 2. المحرك المطور لمعالجة التحويلات المالية (البحث بالرقم المكون من 6 أرقام)
 */
async function processSecureTransfers() {
    const transfersRef = db.ref('requests/transfers');
    
    // جلب الطلبات التي تنتظر المعالجة
    const snap = await transfersRef.orderByChild('status').equalTo('pending').limitToFirst(10).once('value');
    
    if (!snap.exists()) return;

    const tasks = snap.val();
    
    for (const id in tasks) {
        const { from, toId, amount, fromName } = tasks[id];
        
        try {
            console.log(`[PROCESS] طلب تحويل: من ${fromName} إلى الرقم (${toId}) بمبلغ ${amount} SDM`);

            // أ- البحث عن المستلم بواسطة الـ numericId (الـ 6 أرقام)
            const userQuery = await db.ref('users').orderByChild('numericId').equalTo(toId).once('value');
            
            if (!userQuery.exists()) {
                await transfersRef.child(id).update({ status: 'failed', reason: 'الرقم غير مسجل' });
                sendAlert(from, `❌ فشل التحويل: الرقم (${toId}) غير موجود في النظام.`, 'error');
                continue;
            }

            const receiverUid = Object.keys(userQuery.val())[0];
            const receiverData = userQuery.val()[receiverUid];

            // ب- جلب بيانات المرسل للتأكد من الرصيد
            const senderSnap = await db.ref(`users/${from}`).once('value');
            const senderData = senderSnap.val();

            if (!senderData) {
                await transfersRef.child(id).update({ status: 'failed', reason: 'المرسل غير موجود' });
                continue;
            }

            // ج- الفحوصات الأمنية
            if (from === receiverUid) {
                await transfersRef.child(id).update({ status: 'failed', reason: 'تحويل ذاتي' });
                sendAlert(from, `⚠️ لا يمكنك التحويل لنفسك!`, 'warning');
                continue;
            }

            if (Number(senderData.sdmBalance) < Number(amount)) {
                await transfersRef.child(id).update({ status: 'failed', reason: 'رصيد غير كافٍ' });
                sendAlert(from, `❌ رصيدك الحالي (${senderData.sdmBalance}) لا يكفي لتحويل ${amount}.`, 'error');
                continue;
            }

            // د- تنفيذ عملية التحويل بنظام التحديث الموحد (Atomic Update)
            const now = Date.now();
            const updates = {};

            // خصم من المرسل
            updates[`users/${from}/sdmBalance`] = Number(senderData.sdmBalance) - Number(amount);
            // إضافة للمستلم
            updates[`users/${receiverUid}/sdmBalance`] = (Number(receiverData.sdmBalance) || 0) + Number(amount);
            // تحديث حالة الطلب
            updates[`requests/transfers/${id}/status`] = 'completed';
            updates[`requests/transfers/${id}/processedAt`] = now;
            updates[`requests/transfers/${id}/toUID`] = receiverUid; 
            
            // تسجيل المعاملة في السجل العام
            updates[`transactions/${id}`] = {
                from, 
                to: receiverUid, 
                fromName: senderData.n, 
                toName: receiverData.n,
                amount, 
                type: 'transfer', 
                date: now
            };

            await db.ref().update(updates);

            console.log(`[SUCCESS] اكتمل التحويل: ${amount} من ${senderData.n} إلى ${receiverData.n}`);

            // هـ- إرسال التنبيهات (ستظهر كتنبيهات Toast في التطبيق)
            sendAlert(from, `✅ تم تحويل ${amount} SDM بنجاح إلى ${receiverData.n}.`, 'success');
            sendAlert(receiverUid, `💰 استلمت ${amount} SDM من ${senderData.n}.`, 'success');

        } catch (err) {
            console.error(`[ERROR] فشل في معالجة الطلب ${id}:`, err.message);
        }
    }
}

/**
 * 3. معالجة طابور التقييمات (تحديث النجوم تلقائياً)
 */
async function processRatings() {
    const queueRef = db.ref('rating_queue');
    const snap = await queueRef.limitToFirst(10).once('value');
    
    if (!snap.exists()) return;

    for (const id in snap.val()) {
        const { target, stars } = snap.val()[id];
        try {
            await db.ref(`users/${target}`).transaction((user) => {
                if (user) {
                    const currentRating = user.rating || 5;
                    const count = user.ratingCount || 0;
                    user.rating = ((currentRating * count) + stars) / (count + 1);
                    user.ratingCount = count + 1;
                }
                return user;
            });
            await queueRef.child(id).remove();
        } catch (e) {
            console.error("Rating Error:", e.message);
        }
    }
}

/**
 * 4. وظيفة الصيانة الدورية (VIP والمنشورات القديمة)
 */
async function maintenanceTask() {
    console.log("🧹 جاري فحص النظام (صيانة دورية)...");
    const now = Date.now();

    try {
        // فحص اشتراكات VIP المنتهية
        const usersSnap = await db.ref('users').orderByChild('vipStatus').equalTo('active').once('value');
        if (usersSnap.exists()) {
            usersSnap.forEach(uSnap => {
                const u = uSnap.val();
                if (u.vipExpiry && u.vipExpiry < now) {
                    uSnap.ref.update({ vipStatus: 'expired' });
                    sendAlert(uSnap.key, "💔 انتهى اشتراك VIP الخاص بك. قم بالتجديد للتمتع بالمزايا.", "info");
                }
            });
        }

        // حذف المنشورات التي مضى عليها أكثر من 48 ساعة (للحفاظ على سرعة قاعدة البيانات)
        const cutoff = now - (48 * 60 * 60 * 1000);
        const postsRef = db.ref('posts');
        const oldPostsSnap = await postsRef.orderByChild('date').endAt(cutoff).once('value');
        if (oldPostsSnap.exists()) {
            const updates = {};
            oldPostsSnap.forEach(p => {
                updates[`posts/${p.key}`] = null;
                updates[`comments/posts/${p.key}`] = null;
            });
            await db.ref().update(updates);
            console.log("✅ تم تنظيف المنشورات القديمة.");
        }
    } catch (e) {
        console.error("Maintenance Error:", e.message);
    }
}

/**
 * دالة مساعدة لإرسال التنبيهات للمستخدمين
 */
function sendAlert(uid, msg, type) {
    db.ref(`alerts/${uid}`).push({ 
        msg, 
        type, 
        date: Date.now() 
    });
}

/**
 * 5. تشغيل المحركات والمؤقتات
 */

// تشغيل محرك التحويلات والتقييم كل 5 ثوانٍ
setInterval(async () => {
    if (isProcessing) return;
    isProcessing = true;
    try {
        await processSecureTransfers();
        await processRatings();
    } catch (err) { console.error("Engine Error:", err.message); }
    isProcessing = false;
}, 5000);

// تشغيل الصيانة كل ساعة
setInterval(maintenanceTask, 3600000);

// تشغيل أولي للصيانة عند بدء تشغيل البوت
maintenanceTask();

console.log("🚀 SDM Secure Bot Engine is Running...");

/**
 * 6. خادم الويب (Health Check) لمنصة Render
 */
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.write('سيرفر البوت يعمل بنجاح! ✅ الحالة: نشط');
    res.end();
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`📡 Health-check server is active on port ${PORT}`);
});
