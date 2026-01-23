const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// إعدادات ImgBB
const IMGBB_API_KEY = 'aa874951c530708a0300fc5401ed7046';

// --- [1] تهيئة Firebase ---
let serviceAccount;
try {
    const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!rawKey) throw new Error("FIREBASE_SERVICE_ACCOUNT is missing!");
    
    // فك التشفير إذا كان مفتاح الخدمة مضغوطاً أو Base64
    const keyString = rawKey.trim().startsWith('{') ? rawKey : Buffer.from(rawKey, 'base64').toString('utf-8');
    serviceAccount = JSON.parse(keyString);
    
    console.log("✅ Firebase Service Account Loaded");
} catch (error) {
    console.error("❌ Firebase Init Error:", error.message);
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
});

const db = admin.database();
app.use(cors());
app.use(express.json());

// --- [2] نظام رفع الصور (يعمل بنجاح) ---
app.post('/api/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });
        const form = new FormData();
        form.append('image', req.file.buffer.toString('base64'));
        const response = await axios.post(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, form, {
            headers: form.getHeaders()
        });
        res.status(200).json({ url: response.data.data.url });
    } catch (e) {
        res.status(500).json({ error: "Upload failed" });
    }
});

// --- [3] محرك الوسيط الآمن (Escrow Engine) - إصدار كامل ---
async function processEscrow() {
    try {
        const escRef = db.ref('requests/escrow_deals');
        
        // أ. حجز المبلغ (Pending -> Secured)
        const pendingSnap = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
        if (pendingSnap.exists()) {
            for (const [id, deal] of Object.entries(pendingSnap.val())) {
                const amount = parseFloat(deal.amount);
                const buyerRef = db.ref(`users/${deal.buyerId}`);
                
                const tx = await buyerRef.transaction(user => {
                    if (!user) return user;
                    const bal = parseFloat(user.sdmBalance || 0);
                    if (bal < amount) return undefined; // رصيد غير كافٍ
                    user.sdmBalance = Number((bal - amount).toFixed(2));
                    return user;
                });

                if (tx.committed) {
                    await escRef.child(id).update({ status: 'secured', updatedAt: admin.database.ServerValue.TIMESTAMP });
                    await db.ref(`${deal.path}/${deal.postId}`).update({ pending: true, buyerId: deal.buyerId });
                    sendAlert(deal.buyerId, `🔒 تم حجز ${amount} SDM. حقك محفوظ في الوسيط.`);
                    sendAlert(deal.sellerId, `🔔 قام مشترٍ بدفع ثمن "${deal.itemTitle}". يمكنك التسليم الآن.`);
                }
            }
        }

        // ب. تحويل المال للبائع بعد الاستلام (Confirmed -> Completed)
        const confirmSnap = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
        if (confirmSnap.exists()) {
            for (const [id, deal] of Object.entries(confirmSnap.val())) {
                const amount = parseFloat(deal.amount);
                const sellerRef = db.ref(`users/${deal.sellerId}/sdmBalance`);
                
                const tx = await sellerRef.transaction(bal => Number(((parseFloat(bal) || 0) + amount).toFixed(2)));

                if (tx.committed) {
                    await escRef.child(id).update({ status: 'completed' });
                    await db.ref(`${deal.path}/${deal.postId}`).update({ pending: false, sold: true });
                    sendAlert(deal.sellerId, `💰 مبروك! استلمت ${amount} SDM ثمن مبيعاتك.`);
                    sendAlert(deal.buyerId, `✅ تمت الصفقة بنجاح.`);
                }
            }
        }

        // ج. إلغاء الطلب وإرجاع المال للمشتري (Cancelled -> Refunded)
        const cancelSnap = await escRef.orderByChild('status').equalTo('cancelled_by_buyer').once('value');
        if (cancelSnap.exists()) {
            for (const [id, deal] of Object.entries(cancelSnap.val())) {
                const amount = parseFloat(deal.amount);
                const buyerRef = db.ref(`users/${deal.buyerId}/sdmBalance`);
                
                const tx = await buyerRef.transaction(bal => Number(((parseFloat(bal) || 0) + amount).toFixed(2)));

                if (tx.committed) {
                    await escRef.child(id).update({ status: 'refunded' });
                    await db.ref(`${deal.path}/${deal.postId}`).update({ pending: false, buyerId: null });
                    sendAlert(deal.buyerId, `↩️ تم إلغاء الطلب وإعادة ${amount} SDM لمحفظتك.`);
                }
            }
        }
    } catch (e) { console.error("Escrow Engine Error:", e.message); }
}

// --- [4] محرك تحويل العملات المباشر (Direct Transfer) ---
async function processTransfers() {
    try {
        const snap = await db.ref('requests/transfers').orderByChild('status').equalTo('pending').once('value');
        if (snap.exists()) {
            for (const [id, req] of Object.entries(snap.val())) {
                const amount = parseFloat(req.amount);
                const targetSnap = await db.ref('users').orderByChild('numericId').equalTo(req.toId).once('value');
                
                if (targetSnap.exists()) {
                    const targetUid = Object.keys(targetSnap.val())[0];
                    if (targetUid === req.from) {
                        await db.ref(`requests/transfers/${id}`).update({ status: 'failed_self_transfer' });
                        continue;
                    }

                    const senderRef = db.ref(`users/${req.from}`);
                    const tx = await senderRef.transaction(u => {
                        if (!u || parseFloat(u.sdmBalance || 0) < amount) return undefined;
                        u.sdmBalance = Number((parseFloat(u.sdmBalance) - amount).toFixed(2));
                        return u;
                    });

                    if (tx.committed) {
                        await db.ref(`users/${targetUid}/sdmBalance`).transaction(b => Number(((parseFloat(b) || 0) + amount).toFixed(2)));
                        await db.ref(`requests/transfers/${id}`).update({ status: 'completed' });
                        // إضافة سجل في المعاملات
                        await db.ref('transactions').push({ from: req.from, to: targetUid, amount, type: 'transfer', date: Date.now() });
                        sendAlert(targetUid, `💰 استلمت ${amount} SDM من ${req.fromName}`, 'success');
                        sendAlert(req.from, `✅ تم تحويل ${amount} SDM بنجاح.`, 'success');
                    }
                } else {
                    await db.ref(`requests/transfers/${id}`).update({ status: 'failed_not_found' });
                    sendAlert(req.from, `❌ الرقم ${req.toId} غير مسجل لدينا.`, 'error');
                }
            }
        }
    } catch (e) { console.error("Transfer Error:", e.message); }
}

// --- [5] محرك الـ VIP ---
async function processVIP() {
    try {
        const snap = await db.ref('requests/vip_subscriptions').orderByChild('status').equalTo('pending').once('value');
        if (snap.exists()) {
            for (const [id, req] of Object.entries(snap.val())) {
                const cost = parseFloat(req.cost);
                const userRef = db.ref(`users/${req.userId}`);
                
                const tx = await userRef.transaction(u => {
                    if (!u || parseFloat(u.sdmBalance || 0) < cost) return undefined;
                    u.sdmBalance = Number((parseFloat(u.sdmBalance) - cost).toFixed(2));
                    u.vipStatus = 'active';
                    u.vipExpiry = (Math.max(u.vipExpiry || 0, Date.now())) + (req.days * 86400000);
                    return u;
                });

                if (tx.committed) {
                    await db.ref(`requests/vip_subscriptions/${id}`).update({ status: 'completed' });
                    sendAlert(req.userId, "👑 مبروك! تم تفعيل اشتراك VIP بنجاح.");
                }
            }
        }
    } catch (e) { console.error("VIP Process Error:", e.message); }
}

// --- [6] مراقب الدردشة (Dispute Monitor) ---
const SUSPICIOUS_WORDS = ["نصاب", "كذاب", "غش", "سرقة", "حرامي", "بلاغ"];
function startChatMonitor() {
    db.ref('chats').on('child_added', (chatSnap) => {
        db.ref(`chats/${chatSnap.key}`).limitToLast(1).on('child_added', async (msgSnap) => {
            const msg = msgSnap.val();
            if (!msg || !msg.text || msg.date < (Date.now() - 60000)) return;
            
            if (SUSPICIOUS_WORDS.some(word => msg.text.includes(word))) {
                await db.ref('admin_notifications').push({
                    type: 'dispute_alert',
                    chatId: chatSnap.key,
                    senderName: msg.senderName,
                    lastMessage: msg.text,
                    keyword: "كلمة مشبوهة",
                    date: admin.database.ServerValue.TIMESTAMP,
                    read: false
                });
            }
        });
    });
}

// --- [7] دوال مساعدة ---
function sendAlert(uid, message, type = 'success') {
    db.ref(`alerts/${uid}`).push({
        msg: message,
        type: type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}

// --- [8] تشغيل المجدولات والمسارات ---
app.get('/', (req, res) => res.send("🤖 SDM Secure Bot is Active"));

// تشغيل المحركات كل عدة ثوانٍ
setInterval(processEscrow, 5000); 
setInterval(processTransfers, 7000); 
setInterval(processVIP, 10000); 
startChatMonitor();

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Bot is live on port ${PORT}`));
