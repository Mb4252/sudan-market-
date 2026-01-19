const admin = require('firebase-admin');
const express = require('express');
const app = express();

// --- 1. إعداد الاتصال (عبر متغيرات البيئة) ---
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
    console.log("✅ تم تشغيل البوت الشامل بنجاح (التحويل، VIP، الوسيط، التقييم، التنظيف)");
} catch (error) {
    console.error("❌ خطأ في الاتصال بالخدمة:", error.message);
    process.exit(1);
}

const db = admin.database();

// --- وظيفة الإشعارات ---
function sendAlert(uid, msg, type = 'success') {
    db.ref(`alerts/${uid}`).push({ msg, type, date: Date.now() });
}

// --- 1. محرك التحويلات ---
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
                sendAlert(from, `❌ رقم الحساب ${toId} غير صحيح`, 'error');
                continue;
            }
            const receiverUid = Object.keys(userSnap.val())[0];
            const senderRef = db.ref(`users/${from}/sdmBalance`);
            const tx = await senderRef.transaction(curr => (Number(curr || 0) >= numAmount ? Number(curr) - numAmount : undefined));

            if (tx.committed) {
                await db.ref(`users/${receiverUid}/sdmBalance`).transaction(c => Number(c || 0) + numAmount);
                await ref.child(id).update({ status: 'completed' });
                sendAlert(receiverUid, `💰 وصلك ${numAmount} SDM من ${fromName}`, 'success');
                sendAlert(from, `✅ تم تحويل ${numAmount} SDM للمستلم ${toId}`, 'success');
            } else {
                await ref.child(id).update({ status: 'failed', reason: 'رصيد غير كافي' });
                sendAlert(from, `❌ رصيدك لا يكفي للتحويل`, 'error');
            }
        } catch (e) { console.error(e); }
    }
}

// --- 2. محرك التقييمات (حساب النجوم تلقائياً) ---
async function processRatings() {
    const ref = db.ref('rating_queue');
    const snap = await ref.orderByChild('status').equalTo('pending').once('value');
    if (!snap.exists()) return;

    for (const [id, task] of Object.entries(snap.val())) {
        try {
            const userRef = db.ref(`users/${task.target}`);
            await userRef.transaction(user => {
                if (user) {
                    const currentRating = Number(user.rating || 5);
                    const count = Number(user.ratingCount || 1);
                    user.rating = ((currentRating * count) + Number(task.stars)) / (count + 1);
                    user.ratingCount = count + 1;
                    return user;
                }
            });
            await ref.child(id).update({ status: 'completed' });
            sendAlert(task.target, `⭐ حصلت على تقييم جديد (${task.stars} نجوم)`, 'info');
        } catch (e) { console.error(e); }
    }
}

// --- 3. محرك الـ VIP والوسيط ---
async function processCommerce() {
    // معالجة VIP
    const vipRef = db.ref('requests/vip_subscriptions');
    const vSnap = await vipRef.orderByChild('status').equalTo('pending').once('value');
    if (vSnap.exists()) {
        for (const [id, task] of Object.entries(vSnap.val())) {
            const tx = await db.ref(`users/${task.userId}`).transaction(u => {
                if (u && Number(u.sdmBalance || 0) >= Number(task.cost)) {
                    const now = Date.now();
                    const start = (u.vipExpiry && u.vipExpiry > now) ? u.vipExpiry : now;
                    u.sdmBalance = Number(u.sdmBalance) - Number(task.cost);
                    u.vipStatus = 'active';
                    u.vipExpiry = start + (Number(task.days) * 86400000);
                    return u;
                }
            });
            if (tx.committed) {
                await vipRef.child(id).update({ status: 'completed' });
                sendAlert(task.userId, `👑 تم تفعيل VIP لمدة ${task.days} يوم`, 'success');
            }
        }
    }

    // معالجة الوسيط (التحرير)
    const escRef = db.ref('requests/escrow_deals');
    const eSnap = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
    if (eSnap.exists()) {
        for (const [id, deal] of Object.entries(eSnap.val())) {
            await db.ref(`users/${deal.sellerId}/sdmBalance`).transaction(c => Number(c || 0) + Number(deal.amount));
            await escRef.child(id).update({ status: 'completed' });
            sendAlert(deal.sellerId, `💰 تم استلام ${deal.amount} SDM ثمن مبيعاتك`, 'success');
        }
    }
}

// --- 4. محرك البلاغات ---
async function processReports() {
    const ref = db.ref('user_reports');
    const snap = await ref.orderByChild('status').equalTo('pending').once('value');
    if (snap.exists()) {
        for (const id of Object.keys(snap.val())) {
            await ref.child(id).update({ status: 'received_by_bot' });
        }
    }
}

// --- 5. محرك التنظيف (كل 48 ساعة) ---
async function cleanupOldPosts() {
    const cutoff = Date.now() - (48 * 60 * 60 * 1000);
    const paths = ['posts', 'vip_posts'];
    for (const path of paths) {
        const snap = await db.ref(path).orderByChild('date').endAt(cutoff).once('value');
        if (snap.exists()) {
            const updates = {};
            Object.keys(snap.val()).forEach(key => updates[key] = null);
            await db.ref(path).update(updates);
            console.log(`🧹 تم تنظيف إعلانات قديمة من ${path}`);
        }
    }
}

// --- الحلقة الرئيسية (كل 7 ثوانٍ) ---
setInterval(() => {
    processTransfers();
    processRatings();
    processCommerce();
    processReports();
}, 7000);

// تنظيف المنشورات كل ساعة
setInterval(cleanupOldPosts, 3600000);

// --- سيرفر الويب لـ Render ---
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('SDM Market Mega Bot is Active 🚀'));
app.listen(PORT, () => console.log(`🌍 السيرفر يعمل على منفذ ${PORT}`));
