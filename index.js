const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios'); // تم إضافة axios للرفع إلى ImgBB
const FormData = require('form-data'); // تم إضافة form-data

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// مفتاح ImgBB الخاص بك
const IMGBB_API_KEY = 'aa874951c530708a0300fc5401ed7046';

// --- [1] فك تشفير مفتاح الخدمة بأمان ---
let serviceAccount;
try {
    const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!rawKey) throw new Error("FIREBASE_SERVICE_ACCOUNT is missing in Render variables!");

    if (rawKey.trim().startsWith('{')) {
        serviceAccount = JSON.parse(rawKey);
    } else {
        const decodedKey = Buffer.from(rawKey, 'base64').toString('utf-8');
        serviceAccount = JSON.parse(decodedKey);
    }
    console.log("✅ Firebase Service Account Loaded Successfully");
} catch (error) {
    console.error("❌ Critical Error: Could not load Firebase Key:", error.message);
    process.exit(1);
}

// --- [2] تهيئة Firebase (قاعدة البيانات فقط) ---
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
});

const db = admin.database();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- [3] نظام رفع الصور الجديد عبر ImgBB (بدون بطاقة بنكية) ---
app.post('/api/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "لم يتم رفع ملف" });

        // تحويل الملف إلى Base64
        const imageBase64 = req.file.buffer.toString('base64');

        const form = new FormData();
        form.append('image', imageBase64);

        console.log("⏳ جاري الرفع إلى ImgBB...");
        
        const response = await axios.post(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, form, {
            headers: form.getHeaders()
        });

        if (response.data && response.data.data.url) {
            const publicUrl = response.data.data.url;
            console.log("✅ تم الرفع بنجاح:", publicUrl);
            res.status(200).json({ url: publicUrl });
        } else {
            throw new Error("فشل الحصول على رابط من ImgBB");
        }
    } catch (e) {
        console.error("❌ Upload Error:", e.message);
        res.status(500).json({ error: "فشل رفع الصورة: " + e.message });
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
                    if (bal < amount) return undefined; 
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
                        sendAlert(req.from, `✅ تم تحويل ${amount} SDM بنجاح.`);
                    }
                }
            }
        }
    } catch (e) { console.error("Transfer Error:", e.message); }
}

// --- [6] محرك الـ VIP ---
async function processVIP() {
    try {
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
    } catch (e) { console.error("VIP Process Error:", e.message); }
}

// --- [7] مراقب الدردشة والنزاعات ---
const SUSPICIOUS_WORDS = ["نصاب", "كذاب", "غش", "سرقة", "حرامي"];
function startChatMonitor() {
    db.ref('chats').on('child_added', (chatSnap) => {
        db.ref(`chats/${chatSnap.key}`).limitToLast(1).on('child_added', async (msgSnap) => {
            try {
                const msg = msgSnap.val();
                if (!msg || !msg.text || msg.date < (Date.now() - 30000)) return;
                
                const lowerText = msg.text.toLowerCase();
                if (SUSPICIOUS_WORDS.some(word => lowerText.includes(word))) {
                    await db.ref('admin_notifications').push({
                        type: 'dispute_alert',
                        chatId: chatSnap.key,
                        senderName: msg.senderName || "مجهول",
                        lastMessage: msg.text,
                        date: admin.database.ServerValue.TIMESTAMP,
                        read: false
                    });
                }
            } catch (err) {
                console.error("Monitor Error:", err.message);
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

// --- [9] مسارات الـ API ---
app.get('/', (req, res) => res.send("🚀 SDM Bot with ImgBB Support is Running Smoothly"));

// --- [10] تشغيل المجدولات الزمنية ---
setInterval(processEscrow, 5000); 
setInterval(processTransfers, 6000); 
setInterval(processVIP, 15000); 
startChatMonitor(); 

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Backend Live on Port ${PORT}`));
