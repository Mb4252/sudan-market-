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
 * 2. المحرك المطور لمعالجة التحويلات المالية
 * يعتمد على التحديث الذري (Atomic Update) لضمان عدم ضياع الرصيد
 */
async function processSecureTransfers() {
    const transfersRef = db.ref('requests/transfers');
    
    // جلب الطلبات التي تنتظر المعالجة فقط
    const snap = await transfersRef.orderByChild('status').equalTo('pending').limitToFirst(10).once('value');
    
    if (!snap.exists()) return;

    const tasks = snap.val();
    
    for (const id in tasks) {
        const { from, toId, amount, fromName } = tasks[id];
        
        try {
            console.log(`[PROCESS] جاري معالجة تحويل: ${amount} SDM من ${fromName} إلى الرقم (${toId})`);

            // أ- البحث عن المستلم بواسطة الرقم التعريفي (numericId)
            const userQuery = await db.ref('users').orderByChild('numericId').equalTo(toId).once('value');
            
            if (!userQuery.exists()) {
                await transfersRef.child(id).update({ status: 'failed', reason: 'الرقم غير مسجل' });
                sendAlert(from, `❌ فشل التحويل: الرقم (${toId}) غير موجود.`, 'error');
                continue;
            }

            const receiverUid = Object.keys(userQuery.val())[0];
            const receiverData = userQuery.val()[receiverUid];

            // ب- جلب بيانات المرسل للتأكد من الرصيد الحالي
            const senderSnap = await db.ref(`users/${from}`).once('value');
            const senderData = senderSnap.val();

            if (!senderData) {
                await transfersRef.child(id).update({ status: 'failed', reason: 'المرسل غير موجود' });
                continue;
            }

            // ج- الفحوصات الأمنية (تحويل ذاتي أو رصيد غير كافٍ)
            if (from === receiverUid) {
                await transfersRef.child(id).update({ status: 'failed', reason: 'تحويل ذاتي' });
                sendAlert(from, `⚠️ لا يمكنك التحويل لنفسك!`, 'warning');
                continue;
            }

            if (Number(senderData.sdmBalance) < Number(amount)) {
                await transfersRef.child(id).update({ status: 'failed', reason: 'رصيد غير كافٍ' });
                sendAlert(from, `❌ رصيدك لا يكفي لتحويل ${amount} SDM.`, 'error');
                continue;
            }

            // د- تنفيذ عملية التحويل بنظام الكتلة الواحدة (Atomic)
            const now = Date.now();
            const updates = {};

            // 1. تحديث الأرصدة
            updates[`users/${from}/sdmBalance`] = Number(senderData.sdmBalance) - Number(amount);
            updates[`users/${receiverUid}/sdmBalance`] = (Number(receiverData.sdmBalance) || 0) + Number(amount);
            
            // 2. تحديث حالة الطلب وسجل المعاملات
            updates[`requests/transfers/${id}/status`] = 'completed';
            updates[`requests/transfers/${id}/processedAt`] = now;
            updates[`transactions/${id}`] = {
                from, to: receiverUid, fromName: senderData.n, toName: receiverData.n,
                amount, type: 'transfer', date: now
            };

            // 3. إضافة التنبيهات (ستظهر في التطبيق فوراً)
            const alertKeyReceiver = db.ref(`alerts/${receiverUid}`).push().key;
            updates[`alerts/${receiverUid}/${alertKeyReceiver}`] = {
                msg: `💰 استلمت ${amount} SDM من ${senderData.n}.`,
                type: 'success', date: now
            };

            const alertKeySender = db.ref(`alerts/${from}`).push().key;
            updates[`alerts/${from}/${alertKeySender}`] = {
                msg: `✅ تم تحويل ${amount} SDM بنجاح إلى ${receiverData.n}.`,
                type: 'success', date: now
            };

            // تنفيذ كل ما سبق في أمر واحد لضمان التزامن
            await db.ref().update(updates);
            console.log(`[SUCCESS] اكتمل التحويل من ${senderData.n} إلى ${receiverData.n}`);

        } catch (err) {
            console.error(`[ERROR] فشل في معالجة الطلب ${id}:`, err.message);
        }
    }
}

/**
 * 3. تحديث تقييمات المستخدمين تلقائياً من الطابور
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
        } catch (e) { console.error("Rating Error:", e.message); }
    }
}

/**
 * 4. وظيفة الصيانة (VIP والمنشورات القديمة)
 */
async function maintenanceTask() {
    console.log("🧹 جاري تشغيل صيانة النظام...");
    const now = Date.now();

    try {
        // فحص الـ VIP المنتهي
        const usersSnap = await db.ref('users').orderByChild('vipStatus').equalTo('active').once('value');
        if (usersSnap.exists()) {
            usersSnap.forEach(uSnap => {
                const u = uSnap.val();
                if (u.vipExpiry && u.vipExpiry < now) {
                    uSnap.ref.update({ vipStatus: 'expired' });
                    sendAlert(uSnap.key, "💔 انتهى اشتراك VIP الخاص بك.", "info");
                }
            });
        }

        // حذف المنشورات القديمة (أكبر من 48 ساعة) لتوفير المساحة
        const cutoff = now - (48 * 60 * 60 * 1000);
        const oldPostsSnap = await db.ref('posts').orderByChild('date').endAt(cutoff).once('value');
        if (oldPostsSnap.exists()) {
            const updates = {};
            oldPostsSnap.forEach(p => {
                updates[`posts/${p.key}`] = null;
                updates[`comments/posts/${p.key}`] = null;
            });
            await db.ref().update(updates);
            console.log("✅ تم تنظيف المنشورات القديمة.");
        }
    } catch (e) { console.error("Maintenance Error:", e.message); }
}

/**
 * دالة مساعدة لإرسال التنبيهات المنفردة
 */
function sendAlert(uid, msg, type) {
    db.ref(`alerts/${uid}`).push({ msg, type, date: Date.now() });
}

/**
 * 5. تشغيل المحركات
 */

// محرك المعاملات يعمل كل 5 ثوانٍ
setInterval(async () => {
    if (isProcessing) return;
    isProcessing = true;
    try {
        await processSecureTransfers();
        await processRatings();
    } catch (err) { console.error("Engine Error:", err.message); }
    isProcessing = false;
}, 5000);

// الصيانة كل ساعة
setInterval(maintenanceTask, 3600000);

// تشغيل صيانة عند التشغيل الأول
maintenanceTask();

/**
 * 6. خادم الويب (Health Check) لمنع توقف البوت على Render
 */
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bot is Active ✅');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`📡 Health-check server is active on port ${PORT}`);
});
