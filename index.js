const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// مفتاح ImgBB (تأكد أنه فعال)
const IMGBB_API_KEY = 'aa874951c530708a0300fc5401ed7046';

// --- [1] إعداد الاتصال بـ Firebase ---
let serviceAccount;
try {
    const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT;
    const keyString = rawKey.trim().startsWith('{') ? rawKey : Buffer.from(rawKey, 'base64').toString('utf-8');
    serviceAccount = JSON.parse(keyString);
} catch (error) {
    console.error("❌ خطأ في مفتاح Firebase!");
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
});

const db = admin.database();
app.use(cors());
app.use(express.json());

// --- [2] محرك إنشاء الهوية الفريدة (Numeric ID) ---
db.ref('users').on('child_added', async (snap) => {
    const user = snap.val();
    const uid = snap.key;

    if (!user.numericId) {
        let isUnique = false;
        let newId = "";
        while (!isUnique) {
            newId = Math.floor(100000 + Math.random() * 900000).toString();
            const existing = await db.ref('users').orderByChild('numericId').equalTo(newId).once('value');
            if (!existing.exists()) isUnique = true;
        }
        await db.ref(`users/${uid}`).update({
            numericId: newId,
            sdmBalance: user.sdmBalance || 0,
            rating: user.rating || 5.0
        });
        console.log(`✅ تم إنشاء ID: ${newId} للمستخدم: ${uid}`);
        sendAlert(uid, `🎉 تم تفعيل حسابك بنجاح. رقمك التعريفي هو: ${newId}`);
    }
});

// --- [3] محرك تحويل الأموال الفوري (P2P) ---
db.ref('requests/transfers').on('child_added', async (snap) => {
    const req = snap.val();
    if (req.status !== 'pending') return;

    try {
        const amount = parseFloat(req.amount);
        const targetSnap = await db.ref('users').orderByChild('numericId').equalTo(req.toId.toString()).once('value');
        
        if (!targetSnap.exists()) {
            await snap.ref.update({ status: 'failed_not_found' });
            return sendAlert(req.from, `❌ الرقم ${req.toId} غير موجود`);
        }

        const targetUid = Object.keys(targetSnap.val())[0];
        if (targetUid === req.from) return snap.ref.update({ status: 'failed_self' });

        const tx = await db.ref(`users/${req.from}`).transaction(u => {
            if (!u || parseFloat(u.sdmBalance || 0) < amount) return undefined;
            u.sdmBalance = Number((parseFloat(u.sdmBalance) - amount).toFixed(2));
            return u;
        });

        if (tx.committed) {
            await db.ref(`users/${targetUid}/sdmBalance`).transaction(b => Number(((parseFloat(b) || 0) + amount).toFixed(2)));
            await snap.ref.update({ status: 'completed', date: Date.now() });
            await db.ref('transactions').push({ from: req.from, to: targetUid, amount, date: Date.now() });
            sendAlert(targetUid, `💰 استلمت ${amount} SDM من ${req.fromName}`);
            sendAlert(req.from, `✅ تم تحويل ${amount} SDM بنجاح.`);
        }
    } catch (e) { console.error("Transfer Error:", e.message); }
});

// --- [4] محرك الوسيط الآمن والحذف التلقائي للمنشورات ---
db.ref('requests/escrow_deals').on('child_added', async (snap) => {
    const deal = snap.val();
    if (deal.status !== 'pending_delivery') return;

    try {
        const amount = parseFloat(deal.amount);
        const tx = await db.ref(`users/${deal.buyerId}`).transaction(u => {
            if (!u || parseFloat(u.sdmBalance || 0) < amount) return undefined;
            u.sdmBalance = Number((parseFloat(u.sdmBalance) - amount).toFixed(2));
            return u;
        });

        if (tx.committed) {
            await snap.ref.update({ status: 'secured' });
            await db.ref(`${deal.path}/${deal.postId}`).update({ pending: true, buyerId: deal.buyerId });
            sendAlert(deal.buyerId, `🔒 تم حجز المبلغ لدى الوسيط.`);
            sendAlert(deal.sellerId, `🔔 دفع المشتري الثمن. يمكنك تسليم المنتج.`);
        }
    } catch (e) { console.error("Escrow Hold Error:", e.message); }
});

db.ref('requests/escrow_deals').on('child_changed', async (snap) => {
    const deal = snap.val();
    
    // الحالة: المشتري استلم المنتج -> حول المال للبائع واحذف المنشور
    if (deal.status === 'confirmed_by_buyer') {
        const amount = parseFloat(deal.amount);
        await db.ref(`users/${deal.sellerId}/sdmBalance`).transaction(b => Number(((parseFloat(b) || 0) + amount).toFixed(2)));
        await snap.ref.update({ status: 'completed' });
        
        // 🚨 حذف المنشور من السوق نهائياً 🚨
        await db.ref(`${deal.path}/${deal.postId}`).remove();
        
        sendAlert(deal.sellerId, `💰 مبروك! استلمت ${amount} SDM وتم حذف المنشور.`);
        console.log(`🗑️ تم حذف المنشور المباع: ${deal.postId}`);
    }

    // الحالة: إلغاء الصفقة
    if (deal.status === 'cancelled_by_buyer') {
        const amount = parseFloat(deal.amount);
        await db.ref(`users/${deal.buyerId}/sdmBalance`).transaction(b => Number(((parseFloat(b) || 0) + amount).toFixed(2)));
        await snap.ref.update({ status: 'refunded' });
        await db.ref(`${deal.path}/${deal.postId}`).update({ pending: false, buyerId: null });
        sendAlert(deal.buyerId, `↩️ تم إلغاء الصفقة وإعادة المال.`);
    }
});

// --- [5] محرك VIP الكامل ---
db.ref('requests/vip_subscriptions').on('child_added', async (snap) => {
    const req = snap.val();
    if (req.status !== 'pending') return;

    try {
        const cost = parseFloat(req.cost);
        const days = parseInt(req.days);
        const tx = await db.ref(`users/${req.userId}`).transaction(u => {
            if (!u || parseFloat(u.sdmBalance || 0) < cost) return undefined;
            u.sdmBalance = Number((parseFloat(u.sdmBalance) - cost).toFixed(2));
            u.vipStatus = 'active';
            const now = Date.now();
            u.vipExpiry = (Math.max(u.vipExpiry || 0, now)) + (days * 86400000);
            return u;
        });

        if (tx.committed) {
            await snap.ref.update({ status: 'completed' });
            sendAlert(req.userId, `👑 مبروك تفعيل VIP لمدة ${days} يوم.`);
        }
    } catch (e) { console.error("VIP Error:", e.message); }
});

// --- [6] محرك السحب البنكي (تجميد الرصيد) ---
db.ref('bank_transfer_requests').on('child_added', async (snap) => {
    const req = snap.val();
    if (req.status !== 'pending') return;
    try {
        const amount = parseFloat(req.amountSDM);
        const tx = await db.ref(`users/${req.userId}`).transaction(u => {
            if (!u || parseFloat(u.sdmBalance || 0) < amount) return undefined;
            u.sdmBalance = Number((parseFloat(u.sdmBalance) - amount).toFixed(2));
            return u;
        });
        if (tx.committed) {
            await snap.ref.update({ status: 'processing' });
            sendAlert(req.userId, `🏦 تم خصم ${amount} SDM. جارٍ تحويل المال لحسابك البنكي.`);
        }
    } catch (e) { console.error("Bank Error:", e.message); }
});

// --- [7] نظام رفع الصور ---
app.post('/api/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file" });
        const form = new FormData();
        form.append('image', req.file.buffer.toString('base64'));
        const response = await axios.post(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, form);
        res.status(200).json({ url: response.data.data.url });
    } catch (e) { res.status(500).json({ error: "Upload failed" }); }
});

// دوال مساعدة
function sendAlert(uid, message) {
    db.ref(`alerts/${uid}`).push({ msg: message, date: admin.database.ServerValue.TIMESTAMP });
}

app.get('/', (req, res) => res.send("🚀 SDM Secure Bot v3.0 - Ready"));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 السيرفر يعمل على المنفذ ${PORT}`));
