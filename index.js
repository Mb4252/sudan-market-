const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto'); // مضافة من الكود الأول
const multer = require('multer');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// --- [1] فك تشفير مفتاح الخدمة بأمان (Base64) ---
// تم استخدام منطق الكود الأول في فك التشفير مع نظام الحماية من الكود الثاني
let serviceAccount;
try {
    const base64Key = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!base64Key) throw new Error("FIREBASE_SERVICE_ACCOUNT is missing in Render variables!");
    
    // استخدام Buffer.from كما في الكود الأول
    serviceAccount = JSON.parse(Buffer.from(base64Key, 'base64').toString());
    console.log("✅ Firebase Service Account Loaded Successfully");
} catch (error) {
    console.error("❌ Critical Error: Could not load Firebase Key:", error.message);
    process.exit(1);
}

// --- [2] تهيئة Firebase ---
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com",
    storageBucket: "sudan-market-6b122.appspot.com" // تم تغييره إلى الرابط الموجود في الكود الأول
});

const db = admin.database();
const bucket = admin.storage().bucket();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- [3] نظام رفع الصور الاحترافي ---
app.post('/api/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        const fileName = `uploads/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
        const file = bucket.file(fileName);

        const blobStream = file.createWriteStream({
            metadata: { contentType: req.file.mimetype },
            public: true
        });

        blobStream.on('error', (err) => res.status(500).json({ error: err.message }));

        blobStream.on('finish', () => {
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
            res.status(200).json({ url: publicUrl });
        });

        blobStream.end(req.file.buffer);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- [4] محرك الوسيط الآمن (Escrow Engine) ---
async function processEscrow() {
    try {
        const escRef = db.ref('requests/escrow_deals');
        const snap = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
        
        if (snap.exists()) {
            for (const [id, deal] of Object.entries(snap.val())) {
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
                    await escRef.child(id).update({ 
                        status: 'secured', 
                        updatedAt: admin.database.ServerValue.TIMESTAMP 
                    });
                    await db.ref(`${deal.path}/${deal.postId}`).update({ 
                        pending: true, 
                        buyerId: deal.buyerId 
                    });
                    
                    sendAlert(deal.buyerId, `🔒 تم حجز ${amount} SDM. حقك محفوظ في الوسيط.`);
                    sendAlert(deal.sellerId, `🔔 تم دفع المبلغ للوسيط. يمكنك تسليم المنتج الآن.`);
                }
            }
        }
    } catch (e) { console.error("Escrow Engine Error:", e.message); }
}

// --- [5] محرك تحويل العملات المباشر ---
async function processTransfers() {
    try {
        const snap = await db.ref('requests/transfers').orderByChild('status').equalTo('pending').once('value');
        if (snap.exists()) {
            for (const [id, req] of Object.entries(snap.val())) {
                const amount = parseFloat(req.amount);
                const targetSnap = await db.ref('users').orderByChild('numericId').equalTo(req.toId).once('value');
                
                if (targetSnap.exists()) {
                    const targetUid = Object.keys(targetSnap.val())[0];
                    const senderRef = db.ref(`users/${req.from}`);
                    
                    const tx = await senderRef.transaction(u => {
                        if (!u || (u.sdmBalance || 0) < amount) return undefined;
                        u.sdmBalance = Number((u.sdmBalance - amount).toFixed(2));
                        return u;
                    });

                    if (tx.committed) {
                        await db.ref(`users/${targetUid}/sdmBalance`).transaction(b => Number(((b || 0) + amount).toFixed(2)));
                        await db.ref(`requests/transfers/${id}`).update({ status: 'completed' });
                        sendAlert(targetUid, `💰 استلمت ${amount} SDM من ${req.fromName}`);
                    }
                }
            }
        }
    } catch (e) {}
}

// --- [6] محرك الـ VIP والتحويلات البنكية ---
async function processVIP() {
    const snap = await db.ref('requests/vip_subscriptions').orderByChild('status').equalTo('pending').once('value');
    if (snap.exists()) {
        for (const [id, req] of Object.entries(snap.val())) {
            const cost = parseFloat(req.cost);
            const userRef = db.ref(`users/${req.userId}`);
            
            const tx = await userRef.transaction(u => {
                if (!u || (u.sdmBalance || 0) < cost) return undefined;
                u.sdmBalance = Number((u.sdmBalance - cost).toFixed(2));
                u.vipStatus = 'active';
                u.vipExpiry = (Math.max(u.vipExpiry || 0, Date.now())) + (req.days * 86400000);
                return u;
            });

            if (tx.committed) {
                await db.ref(`requests/vip_subscriptions/${id}`).update({ status: 'completed' });
                sendAlert(req.userId, "👑 تم تفعيل اشتراك VIP بنجاح!");
            }
        }
    }
}

// --- [7] مراقب الدردشة والنزاعات (أمني) ---
const SUSPICIOUS_WORDS = ["نصاب", "كذاب", "غش", "سرقة", "كاشي", "رقمك"];
function startChatMonitor() {
    db.ref('chats').on('child_added', (chatSnap) => {
        db.ref(`chats/${chatSnap.key}`).limitToLast(1).on('child_added', async (msgSnap) => {
            const msg = msgSnap.val();
            if (!msg || msg.date < (Date.now() - 30000)) return;
            
            if (SUSPICIOUS_WORDS.some(word => msg.text.includes(word))) {
                await db.ref('admin_notifications').push({
                    type: 'dispute_alert',
                    chatId: chatSnap.key,
                    senderName: msg.senderName,
                    lastMessage: msg.text,
                    date: admin.database.ServerValue.TIMESTAMP
                });
            }
        });
    });
}

// --- [8] دوال مساعدة ---
function sendAlert(uid, message) {
    db.ref(`alerts/${uid}`).push({
        msg: message,
        type: 'success',
        date: admin.database.ServerValue.TIMESTAMP
    });
}

// --- [9] مسارات الـ API العامة ---
app.get('/api/posts', async (req, res) => {
    try {
        const { path, sub } = req.query;
        let query = db.ref(path);
        if (sub && sub !== 'null') query = query.orderByChild('sub').equalTo(sub);
        const snapshot = await query.limitToLast(40).once('value');
        const posts = snapshot.exists() ? Object.keys(snapshot.val()).map(k => ({ id: k, ...snapshot.val()[k] })).reverse() : [];
        res.json(posts);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/', (req, res) => res.send("🚀 SDM Full Bot System is Active"));

// --- [10] تشغيل المجدولات الزمنية ---
setInterval(processEscrow, 5000);
setInterval(processTransfers, 6000);
setInterval(processVIP, 15000);
startChatMonitor();

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Backend Live on Port ${PORT}`));
