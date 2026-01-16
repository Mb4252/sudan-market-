const express = require('express');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. تهيئة Firebase Admin
try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) 
        : require("./serviceAccountKey.json");

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
    console.log("✅ تم الاتصال بقاعدة بيانات Firebase بنجاح");
} catch (e) {
    console.error("❌ خطأ في تهيئة Firebase: تأكد من ملف serviceAccountKey.json");
}

const db = admin.database();

// ===== [وظائف البوت الاحترافية] =====

// 1. معالجة تحويلات الرصيد بنظام Transaction (أمان مالي 100%)
async function processTransfers() {
    const transfersRef = db.ref('requests/transfers');
    const snap = await transfersRef.orderByChild('status').equalTo('pending').once('value');
    if (!snap.exists()) return;

    for (const [id, task] of Object.entries(snap.val())) {
        const { from, to, amount } = task;
        try {
            const senderBalRef = db.ref(`users/${from}/sdmBalance`);
            const deductionResult = await senderBalRef.transaction((currentBalance) => {
                if (currentBalance === null) return 0; 
                if (currentBalance < amount) return; 
                return currentBalance - amount;
            });

            if (!deductionResult.committed) {
                await transfersRef.child(id).update({ status: 'failed', error: 'رصيد غير كافٍ', processedAt: Date.now() });
                continue;
            }

            const receiverBalRef = db.ref(`users/${to}/sdmBalance`);
            await receiverBalRef.transaction((currentBalance) => (currentBalance || 0) + amount);

            await transfersRef.child(id).update({ status: 'completed', processedAt: Date.now() });
            await db.ref('transactions').push({ from, to, amount, type: 'transfer', date: Date.now() });

            const alertMsg = (uid, msg, type) => db.ref(`alerts/${uid}`).push({ msg, type, date: Date.now() });
            await alertMsg(from, `✅ تم تحويل ${amount} SDM بنجاح.`, 'success');
            await alertMsg(to, `💰 استلمت تحويل بقيمة ${amount} SDM.`, 'success');
            console.log(`✅ اكتمل التحويل: ${id}`);
        } catch (err) { console.error(`❌ خطأ في التحويل ${id}:`, err); }
    }
}

// 2. معالجة التقييمات وتحديث النجوم
async function processRatings() {
    const queueRef = db.ref('rating_queue');
    const snap = await queueRef.once('value');
    if (!snap.exists()) return;

    for (const [id, rating] of Object.entries(snap.val())) {
        try {
            const { target, stars } = rating;
            await db.ref(`users/${target}`).transaction((userData) => {
                if (userData) {
                    const currentRating = userData.rating || 5;
                    const count = userData.ratingCount || 0;
                    userData.rating = parseFloat(((currentRating * count) + stars) / (count + 1)).toFixed(1);
                    userData.ratingCount = count + 1;
                }
                return userData;
            });
            await queueRef.child(id).remove();
        } catch (err) { console.error("Rating Error:", err); }
    }
}

// 3. مسح المنشورات القديمة (بعد مرور يومين) + مسح تعليقاتها
async function cleanupOldPosts() {
    console.log("🧹 جاري تنظيف المنشورات القديمة (أقدم من يومين)...");
    const now = Date.now();
    const cutoff = now - (2 * 24 * 60 * 60 * 1000); // 48 ساعة بالملي ثانية

    const paths = ['posts', 'vip_posts'];

    for (const path of paths) {
        const snap = await db.ref(path).once('value');
        if (snap.exists()) {
            const posts = snap.val();
            for (const postId in posts) {
                if (posts[postId].date && posts[postId].date < cutoff) {
                    // 1. مسح المنشور
                    await db.ref(`${path}/${postId}`).remove();
                    // 2. مسح التعليقات المرتبطة بهذا المنشور
                    await db.ref(`comments/${path}/${postId}`).remove();
                    console.log(`🗑️ تم حذف المنشور القديم وتعليقاته: ${postId} من ${path}`);
                }
            }
        }
    }
}

// 4. تنظيف اشتراكات VIP المنتهية
async function cleanupVIP() {
    const now = Date.now();
    const usersSnap = await db.ref('users').orderByChild('vipStatus').equalTo('active').once('value');
    if (usersSnap.exists()) {
        for (const [uid, user] of Object.entries(usersSnap.val())) {
            if (user.vipExpiry && user.vipExpiry < now) {
                await db.ref(`users/${uid}`).update({ vipStatus: 'expired' });
                await db.ref(`alerts/${uid}`).push({ msg: `💔 انتهى اشتراك VIP الخاص بك.`, type: 'info', date: now });
            }
        }
    }
}

// 5. معالجة البلاغات
async function processReports() {
    const reportsRef = db.ref('user_reports');
    const snap = await reportsRef.orderByChild('status').equalTo('pending').once('value');
    if (!snap.exists()) return;

    for (const [id, report] of Object.entries(snap.val())) {
        try {
            const { offender } = report;
            const userSnap = await db.ref(`users/${offender}`).once('value');
            if (userSnap.exists()) {
                const reportCount = (userSnap.val().reportCount || 0) + 1;
                let updates = { reportCount: reportCount };
                if (reportCount >= 3) {
                    updates.bannedUntil = Date.now() + (7 * 24 * 60 * 60 * 1000);
                    await db.ref(`alerts/${offender}`).push({ msg: `⛔ حظر لمدة 7 أيام بسبب البلاغات.`, type: 'error', date: Date.now() });
                }
                await db.ref(`users/${offender}`).update(updates);
            }
            await reportsRef.child(id).update({ status: 'processed' });
        } catch (err) { console.error("Report Error:", err); }
    }
}

// ===== [المحرك والجدولة] =====

async function startBot() {
    console.log("🤖 بوت SDM Market الاحترافي يعمل الآن...");
    
    // مهام سريعة (كل 5 ثوانٍ): التحويلات، التقييمات، البلاغات
    setInterval(async () => {
        await processTransfers();
        await processRatings();
        await processReports();
    }, 5000);

    // مهام الصيانة (كل ساعة): تنظيف المنشورات القديمة والـ VIP
    setInterval(async () => {
        await cleanupOldPosts();
        await cleanupVIP();
    }, 3600000); 

    // تنفيذ تنظيف فوري عند بدء التشغيل
    await cleanupOldPosts();
}

// ===== [إعدادات السيرفر] =====

app.use(express.json());
app.get('/', (req, res) => res.send('Bot SDM Market is Running 🚀'));
app.get('/health', (req, res) => res.json({ status: 'active', database: 'connected' }));

app.listen(PORT, () => startBot());
