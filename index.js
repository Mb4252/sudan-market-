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
    if (!rawKey) throw new Error("متغير البيئة FIREBASE_SERVICE_ACCOUNT غير موجود في Render!");
    
    const keyString = rawKey.trim().startsWith('{') ? rawKey : Buffer.from(rawKey, 'base64').toString('utf-8');
    serviceAccount = JSON.parse(keyString);
    
    console.log("✅ تم تحميل مفتاح الخدمة بنجاح");
} catch (error) {
    console.error("❌ فشل في تحميل مفتاح Firebase:", error.message);
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
});

const db = admin.database();
app.use(cors());
app.use(express.json());

// --- [2] نظام رفع الصور إلى ImgBB ---
app.post('/api/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "لم يتم اختيار ملف" });
        
        const form = new FormData();
        form.append('image', req.file.buffer.toString('base64'));
        
        console.log("⏳ جاري رفع الصورة إلى ImgBB...");
        const response = await axios.post(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, form);
        
        res.status(200).json({ url: response.data.data.url });
        console.log("✅ تم الرفع بنجاح:", response.data.data.url);
    } catch (e) {
        console.error("❌ فشل الرفع:", e.message);
        res.status(500).json({ error: "فشل رفع الصورة" });
    }
});

// --- [3] محرك تحويل العملات (Direct Transfer) ---
// يعمل فور إضافة طلب جديد في requests/transfers
db.ref('requests/transfers').on('child_added', async (snap) => {
    const req = snap.val();
    if (req.status !== 'pending') return;

    console.log(`💸 معالجة تحويل: من ${req.fromName} إلى رقم التعريف: ${req.toId}`);

    try {
        const amount = parseFloat(req.amount);
        if (isNaN(amount) || amount <= 0) return snap.ref.update({ status: 'invalid_amount' });

        // البحث عن المستلم بواسطة الرقم المكون من 6 أرقام
        const targetSnap = await db.ref('users').orderByChild('numericId').equalTo(req.toId.toString()).once('value');
        
        if (!targetSnap.exists()) {
            console.log(`❌ لم يتم العثور على مستلم بالرقم: ${req.toId}`);
            await snap.ref.update({ status: 'failed_not_found' });
            return sendAlert(req.from, `❌ فشل التحويل: رقم التعريف ${req.toId} غير موجود`);
        }

        const targetUid = Object.keys(targetSnap.val())[0];
        
        // منع التحويل للنفس
        if (targetUid === req.from) {
            await snap.ref.update({ status: 'failed_self_transfer' });
            return sendAlert(req.from, `❌ لا يمكنك التحويل لنفسك`);
        }

        // تنفيذ العملية المالية (خصم من المرسل)
        const senderRef = db.ref(`users/${req.from}`);
        const tx = await senderRef.transaction(u => {
            if (!u) return u;
            const bal = parseFloat(u.sdmBalance || 0);
            if (bal < amount) return undefined; // إلغاء إذا الرصيد غير كافٍ
            u.sdmBalance = Number((bal - amount).toFixed(2));
            return u;
        });

        if (tx.committed) {
            // إضافة الرصيد للمستلم
            await db.ref(`users/${targetUid}/sdmBalance`).transaction(b => Number(((parseFloat(b) || 0) + amount).toFixed(2)));
            
            // تحديث حالة الطلب وإضافة سجل المعاملات
            await snap.ref.update({ status: 'completed', completedAt: Date.now() });
            await db.ref('transactions').push({ from: req.from, to: targetUid, amount, type: 'transfer', date: Date.now() });
            
            sendAlert(targetUid, `💰 استلمت ${amount} SDM من ${req.fromName}`);
            sendAlert(req.from, `✅ تم تحويل ${amount} SDM بنجاح إلى ${req.toId}`);
            console.log("✅ تمت عملية التحويل بنجاح");
        } else {
            await snap.ref.update({ status: 'failed_insufficient_balance' });
            sendAlert(req.from, `❌ فشل التحويل: رصيدك غير كافٍ (${amount} SDM)`);
        }
    } catch (e) {
        console.error("❌ خطأ في محرك التحويل:", e.message);
    }
});

// --- [4] محرك الوسيط الآمن (Escrow Engine) ---
db.ref('requests/escrow_deals').on('child_added', async (snap) => {
    const deal = snap.val();
    if (deal.status !== 'pending_delivery') return;

    console.log(`🔒 حجز مبلغ صفقة: ${deal.itemTitle}`);

    try {
        const amount = parseFloat(deal.amount);
        const buyerRef = db.ref(`users/${deal.buyerId}`);
        
        const tx = await buyerRef.transaction(u => {
            if (!u) return u;
            const bal = parseFloat(u.sdmBalance || 0);
            if (bal < amount) return undefined;
            u.sdmBalance = Number((bal - amount).toFixed(2));
            return u;
        });

        if (tx.committed) {
            await snap.ref.update({ status: 'secured', securedAt: Date.now() });
            await db.ref(`${deal.path}/${deal.postId}`).update({ pending: true, buyerId: deal.buyerId });
            
            sendAlert(deal.buyerId, `🔒 تم حجز ${amount} SDM. المبلغ الآن في أمان لدى الوسيط.`);
            sendAlert(deal.sellerId, `🔔 قام مشترٍ بدفع ثمن "${deal.itemTitle}". يمكنك الآن تسليم المنتج.`);
            console.log("✅ تم حجز المبلغ بنجاح");
        } else {
            await snap.ref.update({ status: 'failed_no_funds' });
            sendAlert(deal.buyerId, `❌ رصيدك غير كافٍ لإتمام عملية الشراء`);
        }
    } catch (e) { console.error("❌ خطأ في محرك الوسيط:", e.message); }
});

// مراقبة تغيير الحالة (عندما يضغط المشتري "تم الاستلام")
db.ref('requests/escrow_deals').on('child_changed', async (snap) => {
    const deal = snap.val();
    
    // إكمال الصفقة وتحويل المال للبائع
    if (deal.status === 'confirmed_by_buyer') {
        console.log(`💰 إكمال صفقة وتحويل المال للبائع: ${deal.sellerId}`);
        const amount = parseFloat(deal.amount);
        
        await db.ref(`users/${deal.sellerId}/sdmBalance`).transaction(b => Number(((parseFloat(b) || 0) + amount).toFixed(2)));
        await snap.ref.update({ status: 'completed', finishedAt: Date.now() });
        await db.ref(`${deal.path}/${deal.postId}`).update({ pending: false, sold: true });
        
        sendAlert(deal.sellerId, `💰 مبروك! استلمت ${amount} SDM من بيع "${deal.itemTitle}"`);
        sendAlert(deal.buyerId, `✅ تمت الصفقة بنجاح. شكراً لتقييمك.`);
    }
    
    // إلغاء الصفقة وإرجاع المال للمشتري
    if (deal.status === 'cancelled_by_buyer') {
        console.log(`↩️ إلغاء صفقة وإرجاع المال للمشتري: ${deal.buyerId}`);
        const amount = parseFloat(deal.amount);
        
        await db.ref(`users/${deal.buyerId}/sdmBalance`).transaction(b => Number(((parseFloat(b) || 0) + amount).toFixed(2)));
        await snap.ref.update({ status: 'cancelled_and_refunded' });
        await db.ref(`${deal.path}/${deal.postId}`).update({ pending: false, buyerId: null });
        
        sendAlert(deal.buyerId, `↩️ تم إلغاء الطلب وإعادة ${amount} SDM لمحفظتك.`);
    }
});

// --- [5] محرك الـ VIP والتفعيلات ---
db.ref('requests/vip_subscriptions').on('child_added', async (snap) => {
    const req = snap.val();
    if (req.status !== 'pending') return;

    try {
        const cost = parseFloat(req.cost);
        const userRef = db.ref(`users/${req.userId}`);
        
        const tx = await userRef.transaction(u => {
            if (!u) return u;
            const bal = parseFloat(u.sdmBalance || 0);
            if (bal < cost) return undefined;
            u.sdmBalance = Number((bal - cost).toFixed(2));
            u.vipStatus = 'active';
            u.vipExpiry = (Math.max(u.vipExpiry || 0, Date.now())) + (req.days * 86400000);
            return u;
        });

        if (tx.committed) {
            await snap.ref.update({ status: 'completed' });
            sendAlert(req.userId, `👑 مبروك! تم تفعيل اشتراك VIP لمدة ${req.days} يوم.`);
            console.log(`✅ تم تفعيل VIP للمستخدم: ${req.userId}`);
        }
    } catch (e) { console.error("❌ خطأ في محرك VIP:", e.message); }
});

// --- [6] دوال مساعدة ---
function sendAlert(uid, message, type = 'info') {
    db.ref(`alerts/${uid}`).push({
        msg: message,
        type: type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}

// --- [7] تشغيل السيرفر ---
app.get('/', (req, res) => {
    res.send(`
        <div style="font-family:sans-serif; text-align:center; padding:50px;">
            <h1 style="color:#10b981;">🚀 SDM Secure Bot is Online</h1>
            <p>Database: sdm-market-6b122</p>
            <div style="background:#f3f4f6; padding:20px; border-radius:10px; display:inline-block;">
                Status: Listening to Transfers, Escrow, and VIP requests...
            </div>
        </div>
    `);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`-----------------------------------------`);
    console.log(`🚀 السيرفر يعمل الآن على المنفذ: ${PORT}`);
    console.log(`📡 مراقبة قاعدة البيانات مفعلة...`);
    console.log(`-----------------------------------------`);
});
