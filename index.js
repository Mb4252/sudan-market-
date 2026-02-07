const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Telegraf } = require('telegraf');
const { OpenAI } = require('openai');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// ==================== [ 1. تهيئة Firebase بشكل احترافي ] ====================
// لكي يعمل هذا الجزء، يجب وضع محتوى ملف الـ JSON كاملاً في متغير بيئة اسمه FIREBASE_SERVICE_ACCOUNT
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
        });
        console.log("✅ Firebase Admin Connected Successfully!");
    } else {
        console.log("⚠️ Warning: FIREBASE_SERVICE_ACCOUNT missing in Environment Variables.");
    }
} catch (e) {
    console.log("❌ Firebase Init Error: ", e.message);
}

const db = admin.database();

// ==================== [ 2. تهيئة OpenAI وتليجرام ] ====================
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const bot = process.env.TELEGRAM_BOT_TOKEN ? new Telegraf(process.env.TELEGRAM_BOT_TOKEN) : null;

if (bot) bot.launch().catch(err => console.log("Telegram Bot Error:", err.message));

// ==================== [ 3. المسارات البرمجية (API Routes) ] ====================

// --- رفع ملف لتليجرام وحفظ "الرابط والمعلومات" في فايربيس ---
app.post('/api/upload-and-save', upload.single('file'), async (req, res) => {
    const { userId, fileType, fileName } = req.body;

    if (!bot || !process.env.TELEGRAM_CHANNEL_ID) {
        return res.status(500).json({ success: false, error: "Storage not configured" });
    }

    try {
        // 1. إرسال الملف إلى تليجرام
        const result = await bot.telegram.sendDocument(process.env.TELEGRAM_CHANNEL_ID, {
            source: req.file.buffer,
            filename: fileName || req.file.originalname
        });

        const telegramFileId = result.document.file_id;
        const messageId = result.message_id;

        // 2. حفظ "الرابط والمعلومات" في Firebase Realtime Database
        const fileData = {
            fileName: fileName || req.file.originalname,
            fileType: fileType,
            telegramMessageId: messageId,
            telegramFileId: telegramFileId,
            uploadDate: Date.now(),
            status: "stored"
        };

        await db.ref(`users/${userId}/files`).push(fileData);

        res.json({ 
            success: true, 
            message: "File stored in Telegram and link saved to Firebase",
            data: fileData 
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- جلب جميع الروابط والملفات الخاصة بطالب معين ---
app.get('/api/user-files/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const snapshot = await db.ref(`users/${userId}/files`).once('value');
        const files = snapshot.val();
        res.json({ success: true, files: files || {} });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- تحديث إحصائيات الطالب بعد الاختبار ---
app.post('/api/update-stats', async (req, res) => {
    const { userId, score, totalQuestions } = req.body;
    try {
        const statsRef = db.ref(`users/${userId}/stats`);
        await statsRef.transaction((currentStats) => {
            if (currentStats === null) {
                return { totalExams: 1, lastScore: score, totalScore: score };
            } else {
                return {
                    totalExams: (currentStats.totalExams || 0) + 1,
                    lastScore: score,
                    totalScore: (currentStats.totalScore || 0) + score
                };
            }
        });
        res.json({ success: true, message: "Stats updated in Firebase" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/', (req, res) => res.send('🚀 Smart Education System is Online'));

// ==================== [ 4. التشغيل ] ====================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
