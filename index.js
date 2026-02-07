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

// ==================== [ 1. تهيئة الخدمات بشكل آمن ] ====================

// --- تهيئة Firebase ---
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG || '{}');
    if (process.env.FIREBASE_CONFIG) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
        });
        console.log("✅ Firebase Admin Initialized");
    } else {
        console.log("⚠️ Warning: FIREBASE_CONFIG missing. Database features restricted.");
    }
} catch (e) {
    console.log("❌ Firebase Init Error: ", e.message);
}

// --- تهيئة OpenAI ---
let openai = null;
if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log("✅ OpenAI Ready");
} else {
    console.log("⚠️ Warning: OPENAI_API_KEY missing. AI features will use 'Mock Mode'.");
}

// --- تهيئة Telegram Bot ---
let bot = null;
if (process.env.TELEGRAM_BOT_TOKEN) {
    bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
    bot.launch().catch(err => console.log("❌ Telegram Bot Launch Error:", err.message));
    console.log("✅ Telegram Bot Ready");
} else {
    console.log("⚠️ Warning: TELEGRAM_BOT_TOKEN missing. Storage features disabled.");
}

// ==================== [ 2. المسارات (Routes) ] ====================

// مسار فحص الحالة (عشان تعرف السيرفر شغال)
app.get('/', (req, res) => {
    res.send('🚀 Smart Education Server is LIVE and RUNNING!');
});

// --- الذكاء الاصطناعي: إنشاء اختبار ---
app.post('/api/ai/generate-quiz', async (req, res) => {
    const { subject, difficulty, count } = req.body;

    if (!openai) {
        // Mock Data: في حال عدم وجود توكن، نرسل بيانات تجريبية بدلاً من الخطأ
        return res.json({
            success: true,
            quiz: {
                title: `اختبار ${subject} (وضع تجريبي)`,
                questions: [
                    {
                        question: "ما هو ناتج 5 + 5؟",
                        options: ["10", "15", "20", "25"],
                        correctAnswer: 0,
                        explanation: "هذا سؤال تجريبي لأن مفتاح AI غير مفعل حالياً."
                    }
                ]
            }
        });
    }

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: `أنشئ اختبار ${subject} مستوى ${difficulty} عدد ${count} أسئلة بصيغة JSON.` }],
            response_format: { type: "json_object" }
        });
        res.json({ success: true, quiz: JSON.parse(completion.choices[0].message.content) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- التخزين الذكي: رفع الملفات لتليجرام ---
app.post('/api/telegram/store', upload.single('file'), async (req, res) => {
    if (!bot || !process.env.TELEGRAM_CHANNEL_ID) {
        return res.status(503).json({ success: false, error: "Telegram Storage not configured." });
    }

    try {
        const result = await bot.telegram.sendDocument(process.env.TELEGRAM_CHANNEL_ID, {
            source: req.file.buffer,
            filename: req.file.originalname
        });
        res.json({ success: true, messageId: result.message_id });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==================== [ 3. تشغيل السيرفر ] ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`
    *****************************************
    🟢 Server is running on port ${PORT}
    🌐 URL: http://localhost:${PORT}
    *****************************************
    `);
});
