const admin = require('firebase-admin');
const http = require('http');

/**
 * 1. إعداد الاتصال بقاعدة البيانات Firebase
 * تأكد من إضافة FIREBASE_SERVICE_ACCOUNT في إعدادات Environment Variables في Render
 */
try {
    const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;

    if (!serviceAccountRaw) {
        console.error("❌ خطأ: لم يتم العثور على متغير البيئة FIREBASE_SERVICE_ACCOUNT");
        process.exit(1);
    }

    // تحويل النص إلى كائن JSON
    const serviceAccount = JSON.parse(serviceAccountRaw);

    // معالجة مشكلة الأسطر الجديدة في المفتاح الخاص (ضرورية للعمل على السيرفرات)
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
 * 2. المحرك الرئيسي لمعالجة التحويلات المالية
 */
async function processSecureTransfers() {
    const transfersRef = db.ref('requests/transfers');
    
    // جلب الطلبات التي تنتظر المعالجة (حالتها pending)
    const snap = await transfersRef.orderByChild('status').equalTo('pending').limitToFirst(10).once('value');
    
    if (!snap.exists()) return;

    const tasks = snap.val();
    
    for (const id in tasks) {
        const { from, to, amount, fromName } = tasks[id];
        
        try {
            console.log(`[LOG] جاري معالجة طلب تحويل: ${amount} SDM من ${fromName}...`);

            const [senderSnap, receiverSnap] = await Promise.all([
                db.ref(`users/${from}`).once('value'),
                db.ref(`users/${to}`).once('value')
            ]);

            const sender = senderSnap.val();
            const receiver = receiverSnap.val();

            if (!sender) {
                await transfersRef.child(id).update({ status: 'failed', reason: 'المرسل غير موجود' });
                continue;
            }
            if (!receiver) {
                await transfersRef.child(id).update({ status: 'failed', reason: 'المستلم غير موجود' });
                sendAlert(from, `❌ فشل التحويل: رقم تعريف المستلم غير صحيح.`, 'error');
                continue;
            }
            if (sender.sdmBalance < amount) {
                await transfersRef.child(id).update({ status: 'failed', reason: 'رصيد غير كافٍ' });
                sendAlert(from, `❌ فشل التحويل: رصيدك الحالي (${sender.sdmBalance}) لا يكفي.`, 'error');
                continue;
            }

            const now = Date.now();
            const updates = {};

            updates[`users/${from}/sdmBalance`] = Number(sender.sdmBalance) - Number(amount);
            updates[`users/${to}/sdmBalance`] = (Number(receiver.sdmBalance) || 0) + Number(amount);
            updates[`requests/transfers/${id}/status`] = 'completed';
            updates[`requests/transfers/${id}/processedAt`] = now;
            updates[`transactions/${id}`] = {
                from, to, fromName: sender.n, toName: receiver.n,
                amount, type: 'transfer', date: now
            };

            await db.ref().update(updates);

            console.log(`[SUCCESS] تم التحويل بنجاح: ${id}`);
            sendAlert(from, `✅ تم تحويل ${amount} SDM بنجاح إلى ${receiver.n}.`, 'success');
            sendAlert(to, `💰 استلمت ${amount} SDM من ${sender.n}.`, 'success');

        } catch (err) {
            console.error(`[ERROR] فشل في معالجة الطلب ${id}:`, err.message);
        }
    }
}

/**
 * 3. معالجة طابور التقييمات
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
 * 4. وظيفة الصيانة الدورية
 */
async function maintenanceTask() {
    console.log("🧹 جاري فحص النظام وصيانة البيانات...");
    const now = Date.now();

    try {
        // فحص اشتراكات VIP
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

        // حذف المنشورات القديمة (أكثر من 48 ساعة)
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
        }
    } catch (e) {
        console.error("Maintenance Error:", e.message);
    }
}

function sendAlert(uid, msg, type) {
    db.ref(`alerts/${uid}`).push({ msg, type, date: Date.now() });
}

// تشغيل المحرك الرئيسي كل 5 ثوانٍ
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
maintenanceTask();

console.log("🚀 SDM Secure Bot Logic is Running...");

/**
 * 5. أهم جزء لـ Render: خادم الويب (Health Check Server)
 * هذا الجزء سيفتح المنفذ الذي يطلبه Render لضمان بقاء البوت حياً (Live)
 */
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.write('سيرفر البوت يعمل بنجاح! ✅');
    res.end();
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`📡 Health-check server is active on port ${PORT}`);
});
