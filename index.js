const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();

// 1. إعداد الاتصال بقاعدة البيانات و Firebase Storage
// يتم استخدام Base64 لفك تشفير مفتاح الخدمة من أجل الأمان في Render
const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString());

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com",
    storageBucket: "sudan-market-6b122.appspot.com"
});

const db = admin.database();
const bucket = admin.storage().bucket();

// إعدادات الوسيط (Middleware)
app.use(cors());
app.use(express.json({ limit: '10mb' }));

/**
 * دالة مساعدة لإرسال تنبيهات فورية للمستخدمين
 */
function sendAlert(uid, msg, type = 'success') {
    db.ref(`alerts/${uid}`).push({
        msg: msg,
        type: type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}

/**
 * Middleware للتحقق من هوية المستخدم عبر Firebase Auth
 */
async function authenticateUser(req, res, next) {
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    if (!idToken) return res.status(401).json({ error: "غير مصرح لك" });

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken;
        next();
    } catch (error) {
        res.status(403).json({ error: "انتهت جلسة الدخول" });
    }
}

// ==========================================
// [1] محرك الوسيط الآمن (Escrow System)
// ==========================================
async function processEscrow() {
    try {
        const escRef = db.ref('requests/escrow_deals');
        const pendingLock = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
        
        if (pendingLock.exists()) {
            for (const [id, deal] of Object.entries(pendingLock.val())) {
                
                // صمام الأمان: منع الشراء الذاتي
                if (deal.buyerId === deal.sellerId) {
                    await escRef.child(id).update({ 
                        status: 'failed_self_purchase',
                        updatedAt: admin.database.ServerValue.TIMESTAMP 
                    });
                    sendAlert(deal.buyerId, `❌ محاولة فاشلة: لا يمكنك الشراء من نفسك.`, 'error');
                    continue;
                }

                const amount = parseFloat(deal.amount);
                const lockTx = await db.ref(`users/${deal.buyerId}`).transaction(user => {
                    if (!user) return user;
                    const bal = parseFloat(user.sdmBalance || 0);
                    if (bal < amount) return undefined; 
                    user.sdmBalance = Number((bal - amount).toFixed(2));
                    return user;
                });

                if (lockTx.committed) {
                    await escRef.child(id).update({ status: 'secured', updatedAt: admin.database.ServerValue.TIMESTAMP });
                    await db.ref(`${deal.path}/${deal.postId}`).update({ pending: true, buyerId: deal.buyerId });
                    sendAlert(deal.buyerId, `🔒 تم حجز ${amount} SDM. حقك محفوظ في الوسيط الآن.`);
                    sendAlert(deal.sellerId, `🔔 تم دفع مبلغ السلعة للوسيط. يمكنك التسليم للمشتري الآن.`);
                } else {
                    await escRef.child(id).update({ status: 'failed_insufficient_funds' });
                    sendAlert(deal.buyerId, `❌ رصيدك غير كافٍ لإتمام عملية الشراء.`, 'error');
                }
            }
        }
    } catch (e) { console.error("Escrow Error:", e.message); }
}

// ==========================================
// [2] محرك التحويل المباشر بين المستخدمين
// ==========================================
async function processTransfers() {
    try {
        const snap = await db.ref('requests/transfers').orderByChild('status').equalTo('pending').once('value');
        if (snap.exists()) {
            for (const [id, req] of Object.entries(snap.val())) {
                const amount = parseFloat(req.amount);
                const targetSnap = await db.ref('users').orderByChild('numericId').equalTo(req.toId).once('value');
                
                if (!targetSnap.exists()) {
                    await db.ref(`requests/transfers/${id}`).update({ status: 'failed_not_found' });
                    sendAlert(req.from, `❌ عذراً، لم نجد مستخدماً يحمل الرقم ${req.toId}`, 'error');
                    continue;
                }

                const targetUid = Object.keys(targetSnap.val())[0];
                const tx = await db.ref(`users/${req.from}`).transaction(u => {
                    if (!u || (u.sdmBalance || 0) < amount) return undefined;
                    u.sdmBalance = Number((u.sdmBalance - amount).toFixed(2));
                    return u;
                });

                if (tx.committed) {
                    await db.ref(`users/${targetUid}/sdmBalance`).transaction(b => Number(((b || 0) + amount).toFixed(2)));
                    await db.ref(`requests/transfers/${id}`).update({ status: 'completed' });
                    sendAlert(req.from, `✅ تم تحويل ${amount} SDM بنجاح.`);
                    sendAlert(targetUid, `💰 وصلك تحويل ${amount} SDM من ${req.fromName}.`);
                } else {
                    await db.ref(`requests/transfers/${id}`).update({ status: 'failed_insufficient_funds' });
                    sendAlert(req.from, `❌ فشل التحويل: رصيدك غير كافٍ.`, 'error');
                }
            }
        }
    } catch (e) { console.error("Transfer Error:", e.message); }
}

// ==========================================
// [3] محرك الـ VIP (تفعيل + فحص انتهاء)
// ==========================================
async function processVIP() {
    try {
        const snap = await db.ref('requests/vip_subscriptions').orderByChild('status').equalTo('pending').once('value');
        if (snap.exists()) {
            for (const [id, req] of Object.entries(snap.val())) {
                const cost = parseFloat(req.cost);
                const tx = await db.ref(`users/${req.userId}`).transaction(u => {
                    if (!u || (u.sdmBalance || 0) < cost) return undefined;
                    u.sdmBalance = Number((u.sdmBalance - cost).toFixed(2));
                    u.vipStatus = 'active';
                    u.vipExpiry = (Math.max(u.vipExpiry || 0, Date.now())) + (req.days * 86400000);
                    return u;
                });
                if (tx.committed) {
                    await db.ref(`requests/vip_subscriptions/${id}`).update({ status: 'completed' });
                    sendAlert(req.userId, `👑 مبروك! تم تفعيل ميزات VIP لمدة ${req.days} يوم.`);
                }
            }
        }

        const now = Date.now();
        const activeVips = await db.ref('users').orderByChild('vipStatus').equalTo('active').once('value');
        if (activeVips.exists()) {
            activeVips.forEach(child => {
                const user = child.val();
                if (user.vipExpiry && now > user.vipExpiry) {
                    child.ref.update({ vipStatus: 'expired' });
                    sendAlert(child.key, "⚠️ انتهى اشتراك VIP الخاص بك.", "info");
                }
            });
        }
    } catch (e) {}
}

// ==========================================
// [4] محرك تحويلات البنوك وتنظيف المتجر
// ==========================================
async function processBankTransfers() {
    try {
        const snap = await db.ref('bank_transfer_requests').orderByChild('status').equalTo('pending').once('value');
        if (snap.exists()) {
            for (const [id, req] of Object.entries(snap.val())) {
                const userSnap = await db.ref(`users/${req.userId}`).once('value');
                const user = userSnap.val();
                
                if (!user || (user.sdmBalance || 0) < req.amountSDM) {
                    await db.ref(`bank_transfer_requests/${id}`).update({ status: 'auto_rejected', reason: 'رصيد غير كافٍ' });
                    sendAlert(req.userId, `❌ رفض طلب التحويل: رصيدك غير كافٍ`, 'error');
                    continue;
                }
                
                const adminNotif = await db.ref('admin_notifications').orderByChild('transferId').equalTo(id).once('value');
                if (!adminNotif.exists()) {
                    await db.ref('admin_notifications').push({
                        ...req, type: 'bank_transfer_request', date: admin.database.ServerValue.TIMESTAMP
                    });
                }
            }
        }
    } catch (e) {}
}

async function cleanupStore() {
    try {
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        for (const path of ['posts', 'vip_posts']) {
            const snap = await db.ref(path).orderByChild('sold').equalTo(true).once('value');
            if (snap.exists()) {
                snap.forEach(child => {
                    const post = child.val();
                    if (post.soldAt && (now - post.soldAt) > oneDay) child.ref.remove();
                });
            }
        }
    } catch (e) {}
}

// ==========================================
// [5] مراقب الدردشة والـ APIs
// ==========================================
const DISPUTE_KEYWORDS = ["نصاب", "حرامي", "غش", "كذاب", "بلاغ"];
function startChatMonitor() {
    db.ref('chats').on('child_added', (chatSnap) => {
        db.ref(`chats/${chatSnap.key}`).limitToLast(1).on('child_added', async (msgSnap) => {
            const msg = msgSnap.val();
            if (!msg || !msg.text || msg.date < (Date.now() - 60000)) return;
            if (DISPUTE_KEYWORDS.some(word => msg.text.includes(word))) {
                await db.ref('admin_notifications').push({
                    type: 'dispute_alert', chatId: chatSnap.key, lastMessage: msg.text, senderName: msg.senderName, date: admin.database.ServerValue.TIMESTAMP
                });
            }
        });
    });
}

// --- مسارات الـ API ---
app.get('/api/posts', async (req, res) => {
    try {
        const { path, sub } = req.query;
        let query = db.ref(path);
        if (sub && sub !== 'null') query = query.orderByChild('sub').equalTo(sub);
        const snapshot = await query.limitToLast(50).once('value');
        const posts = snapshot.exists() ? Object.keys(snapshot.val()).map(k => ({ id: k, ...snapshot.val()[k] })).reverse() : [];
        res.json(posts);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/publish', authenticateUser, async (req, res) => {
    try {
        const { path, postData } = req.body;
        postData.userId = req.user.uid;
        postData.date = admin.database.ServerValue.TIMESTAMP;
        const newPostRef = await db.ref(path).push(postData);
        res.json({ success: true, id: newPostRef.key });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/', (req, res) => res.send("🚀 SDM Market Security & API System is Live"));

// ---------------------------------------------------------
// المجدولات الزمنية وتشغيل السيرفر
// ---------------------------------------------------------
setInterval(processEscrow, 5000);
setInterval(processTransfers, 6000);
setInterval(processVIP, 15000);
setInterval(processBankTransfers, 7000);
setInterval(cleanupStore, 3600000);
startChatMonitor();

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Backend Server Live on Port ${PORT}`));
