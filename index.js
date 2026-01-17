const express = require('express');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. تهيئة Firebase Admin بشكل آمن
try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) 
        : require("./serviceAccountKey.json");

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
    console.log("✅ Firebase Admin Initialized Successfully");
} catch (e) {
    console.error("❌ Firebase Initialization Error:", e.message);
}

const db = admin.database();
let isBusy = false;

// 1. معالجة التحويلات (نظام الطلبات)
async function processTransfers() {
    const transfersRef = db.ref('requests/transfers');
    const snap = await transfersRef.orderByChild('status').equalTo('pending').limitToFirst(10).once('value');
    
    if (!snap.exists()) return;

    const tasks = snap.val();
    for (const id in tasks) {
        const { from, to, amount } = tasks[id];
        try {
            // خصم من المرسل
            const result = await db.ref(`users/${from}/sdmBalance`).transaction((current) => {
                if (current === null) return 0;
                if (current < amount) return; // رصيد غير كافٍ
                return current - amount;
            });

            if (result.committed) {
                // إضافة للمستلم
                await db.ref(`users/${to}/sdmBalance`).transaction((c) => (c || 0) + amount);
                // تحديث الطلب
                await transfersRef.child(id).update({ status: 'completed', processedAt: Date.now() });
                // سجل العمليات
                await db.ref('transactions').push({ from, to, amount, type: 'transfer', date: Date.now() });
                // تنبيهات
                db.ref(`alerts/${from}`).push({ msg: `✅ تم تحويل ${amount} SDM بنجاح.`, type: 'success', date: Date.now() });
                db.ref(`alerts/${to}`).push({ msg: `💰 استلمت تحويل بقيمة ${amount} SDM.`, type: 'success', date: Date.now() });
                console.log(`✅ Transfer Done: ${amount} from ${from} to ${to}`);
            } else {
                await transfersRef.child(id).update({ status: 'failed', reason: 'Insufficient Balance', processedAt: Date.now() });
            }
        } catch (err) { console.error("Transfer Task Error:", err.message); }
    }
}

// 2. معالجة التقييمات
async function processRatings() {
    const queueRef = db.ref('rating_queue');
    const snap = await queueRef.limitToFirst(10).once('value');
    if (!snap.exists()) return;

    const ratings = snap.val();
    for (const id in ratings) {
        const { target, stars } = ratings[id];
        try {
            await db.ref(`users/${target}`).transaction((userData) => {
                if (userData) {
                    const currentRating = Number(userData.rating) || 5;
                    const count = Number(userData.ratingCount) || 0;
                    const newRating = ((currentRating * count) + stars) / (count + 1);
                    
                    userData.rating = Math.round(newRating * 10) / 10;
                    userData.ratingCount = count + 1;
                }
                return userData;
            });
            await queueRef.child(id).remove();
        } catch (err) { console.error("Rating Task Error:", err.message); }
    }
}

// 3. تنظيف البيانات (المنشورات القديمة و VIP)
async function maintenanceTask() {
    console.log("🧹 Starting Maintenance...");
    const now = Date.now();
    const postCutoff = now - (48 * 60 * 60 * 1000); // 48 ساعة

    // تنظيف المنشورات
    const paths = ['posts', 'vip_posts'];
    for (const path of paths) {
        const oldSnap = await db.ref(path).orderByChild('date').endAt(postCutoff).once('value');
        if (oldSnap.exists()) {
            const updates = {};
            oldSnap.forEach(post => {
                updates[`${path}/${post.key}`] = null;
                updates[`comments/${path}/${post.key}`] = null;
            });
            await db.ref().update(updates);
        }
    }

    // تنظيف VIP
    const vipSnap = await db.ref('users').orderByChild('vipStatus').equalTo('active').once('value');
    if (vipSnap.exists()) {
        const vipUpdates = {};
        vipSnap.forEach(uSnap => {
            const u = uSnap.val();
            if (u.vipExpiry && u.vipExpiry < now) {
                vipUpdates[`users/${uSnap.key}/vipStatus`] = 'expired';
                db.ref(`alerts/${uSnap.key}`).push({ msg: `💔 انتهى اشتراك VIP الخاص بك.`, type: 'info', date: now });
            }
        });
        if (Object.keys(vipUpdates).length > 0) await db.ref().update(vipUpdates);
    }
}

// المحرك الأساسي
async function startEngine() {
    if (isBusy) return;
    isBusy = true;
    try {
        await processTransfers();
        await processRatings();
    } catch (e) { console.error("Engine Error:", e.message); }
    isBusy = false;
}

app.get('/', (req, res) => res.send('SDM Market Security Bot is Online 🚀'));

app.listen(PORT, () => {
    console.log(`🤖 Bot is running on port: ${PORT}`);
    // فحص التحويلات والتقييمات كل 5 ثوانٍ
    setInterval(startEngine, 5000);
    // فحص الصيانة كل ساعة
    setInterval(maintenanceTask, 3600000);
    // تشغيل صيانة فورية عند الإقلاع
    maintenanceTask();
});
