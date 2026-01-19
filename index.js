const admin = require('firebase-admin');
const http = require('http');

// --- 1. إعداد الاتصال ---
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
    console.log("✅ البوت الشامل يعمل الآن (تحويل، VIP، تنظيف، تقييم، بلاغات)");
} catch (e) {
    console.error("❌ خطأ اتصال:", e.message);
    process.exit(1);
}

const db = admin.database();
let isProcessing = false;

// --- 2. محرك مسح المنشورات القديمة (تلقائي كل ساعة) ---
async function cleanupOldPosts() {
    const now = Date.now();
    const expiryTime = 48 * 60 * 60 * 1000; // 48 ساعة
    const cutoff = now - expiryTime;

    const paths = ['posts', 'vip_posts'];
    for (const path of paths) {
        const snap = await db.ref(path).orderByChild('date').endAt(cutoff).once('value');
        if (snap.exists()) {
            const count = snap.numChildren();
            await db.ref(path).update(Object.keys(snap.val()).reduce((acc, key) => ({ ...acc, [key]: null }), {}));
            console.log(`[CLEANUP] تم حذف ${count} منشور قديم من ${path}`);
        }
    }
}

// --- 3. محرك التحويلات المالية ---
async function processTransfers() {
    const ref = db.ref('requests/transfers');
    const snap = await ref.orderByChild('status').equalTo('pending').limitToFirst(5).once('value');
    if (!snap.exists()) return;

    for (const [id, task] of Object.entries(snap.val())) {
        const { from, toId, amount, fromName } = task;
        const numAmount = Number(amount);
        try {
            const userSnap = await db.ref('users').orderByChild('numericId').equalTo(String(toId)).once('value');
            if (!userSnap.exists()) {
                await ref.child(id).update({ status: 'failed', reason: 'المستلم غير موجود' });
                continue;
            }
            const receiverUid = Object.keys(userSnap.val())[0];
            const tx = await db.ref(`users/${from}/sdmBalance`).transaction(curr => (curr >= numAmount ? curr - numAmount : undefined));
            
            if (tx.committed) {
                await db.ref(`users/${receiverUid}/sdmBalance`).transaction(c => (c || 0) + numAmount);
                await ref.child(id).update({ status: 'completed', completedAt: now() });
                sendAlert(receiverUid, `💰 وصلك ${numAmount} SDM من ${fromName}`, 'success');
                sendAlert(from, `✅ تم تحويل ${numAmount} SDM للمستلم ${toId}`, 'success');
            } else {
                await ref.child(id).update({ status: 'failed', reason: 'رصيدك غير كافٍ' });
            }
        } catch (e) { console.error(e); }
    }
}

// --- 4. محرك تقييمات المستخدمين (تحديث النجوم تلقائياً) ---
async function processRatings() {
    const ref = db.ref('rating_queue');
    const snap = await ref.orderByChild('status').equalTo('pending').once('value');
    if (!snap.exists()) return;

    for (const [id, task] of Object.entries(snap.val())) {
        try {
            const userRef = db.ref(`users/${task.target}`);
            await userRef.transaction(user => {
                if (user) {
                    const oldRating = user.rating || 5;
                    const count = user.ratingCount || 1;
                    user.rating = ((oldRating * count) + task.stars) / (count + 1);
                    user.ratingCount = count + 1;
                    return user;
                }
            });
            await ref.child(id).update({ status: 'completed' });
            sendAlert(task.target, `⭐ حصلت على تقييم جديد (${task.stars} نجوم) من ${task.raterN}`, 'info');
        } catch (e) { console.error(e); }
    }
}

// --- 5. محرك البلاغات (تسجيل البلاغ وإخطار الأدمن) ---
async function processReports() {
    const ref = db.ref('user_reports');
    const snap = await ref.orderByChild('status').equalTo('pending').once('value');
    if (!snap.exists()) return;

    for (const [id, report] of Object.entries(snap.val())) {
        console.log(`[REPORT] بلاغ جديد ضد ${report.offender} من ${report.reporterN}`);
        // هنا يمكن للبوت حظر المستخدم تلقائياً إذا تجاوز 5 بلاغات (اختياري)
        await ref.child(id).update({ status: 'logged_to_admin' });
    }
}

// --- 6. محرك الـ VIP ---
async function processVips() {
    const ref = db.ref('requests/vip_subscriptions');
    const snap = await ref.orderByChild('status').equalTo('pending').once('value');
    if (!snap.exists()) return;

    for (const [id, task] of Object.entries(snap.val())) {
        const { userId, days, cost } = task;
        const tx = await db.ref(`users/${userId}`).transaction(u => {
            if (u && (u.sdmBalance || 0) >= cost) {
                const start = (u.vipExpiry && u.vipExpiry > Date.now()) ? u.vipExpiry : Date.now();
                u.sdmBalance -= cost;
                u.vipStatus = 'active';
                u.vipExpiry = start + (days * 24 * 60 * 60 * 1000);
                return u;
            }
        });
        if (tx.committed) {
            await ref.child(id).update({ status: 'completed' });
            sendAlert(userId, `👑 مبروك! تم تفعيل VIP لمدة ${days} يوم`, 'success');
        } else {
            await ref.child(id).update({ status: 'failed', reason: 'رصيد غير كافٍ' });
        }
    }
}

// --- وظائف مساعدة ---
function sendAlert(uid, msg, type) {
    db.ref(`alerts/${uid}`).push({ msg, type, date: Date.now() });
}
function now() { return Date.now(); }

// --- الحلقة الرئيسية (تعمل كل 5 ثوانٍ) ---
setInterval(async () => {
    if (isProcessing) return;
    isProcessing = true;
    try {
        await processTransfers();
        await processVips();
        await processRatings();
        await processReports();
    } catch (e) {}
    isProcessing = false;
}, 5000);

// حلقة التنظيف (كل ساعة)
setInterval(cleanupOldPosts, 3600000);

// خادم الويب (لإبقاء البوت مستيقظاً)
http.createServer((req, res) => res.end('SDM All-In-One Bot is Running')).listen(process.env.PORT || 3000);
