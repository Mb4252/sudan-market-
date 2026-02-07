const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const { Telegraf } = require('telegraf');
const { OpenAI } = require('openai');
const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// --- [ إعدادات OpenAI ] ---
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// --- [ إعدادات تليجرام ] ---
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

// --- [ إعدادات Firebase Admin ] ---
// تأكد من تحميل ملف الـ JSON الخاص بـ Service Account من لوحة تحكم Firebase
const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
});
const db = admin.database();

app.use(cors());
app.use(express.json());

// ==================== [ 1. نظام التخزين الذكي (Telegram) ] ====================

// رفع ملف إلى تليجرام
app.post('/api/telegram/store', upload.single('file'), async (req, res) => {
    try {
        const file = req.file;
        const metadata = JSON.parse(req.body.metadata || '{}');
        const userId = req.body.userId;

        if (!file) return res.status(400).json({ success: false, error: 'No file uploaded' });

        // إرسال الملف إلى قناة تليجرام
        const result = await bot.telegram.sendDocument(CHANNEL_ID, {
            source: file.buffer,
            filename: file.originalname
        }, {
            caption: `👤 User: ${userId}\n📂 Type: ${req.body.type}\n📄 Name: ${file.originalname}`
        });

        res.json({
            success: true,
            messageId: result.message_id,
            fileId: result.document.file_id
        });
    } catch (error) {
        console.error('Telegram Upload Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// تخزين نص (محادثات أو ملاحظات) في تليجرام
app.post('/api/telegram/store-text', async (req, res) => {
    try {
        const { text, type, userId } = req.body;
        const result = await bot.telegram.sendMessage(CHANNEL_ID, 
            `📝 *New Record* (${type})\n👤 User ID: ${userId}\n\n${text}`, 
            { parse_mode: 'Markdown' }
        );
        res.json({ success: true, messageId: result.message_id });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== [ 2. نظام الذكاء الاصطناعي (AI) ] ====================

// إنشاء اختبار ذكي
app.post('/api/ai/generate-quiz', async (req, res) => {
    try {
        const { subject, difficulty, count } = req.body;

        const prompt = `أنشئ اختباراً في مادة ${subject} بمستوى ${difficulty} يتكون من ${count} أسئلة.
        يجب أن يكون الرد بصيغة JSON فقط كالتالي:
        {
            "quiz": {
                "title": "عنوان الاختبار",
                "questions": [
                    {
                        "question": "السؤال؟",
                        "options": ["أ", "ب", "ج", "د"],
                        "correctAnswer": 0,
                        "explanation": "شرح بسيط"
                    }
                ]
            }
        }`;

        const completion = await openai.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "gpt-3.5-turbo",
            response_format: { type: "json_object" },
        });

        const quizData = JSON.parse(completion.choices[0].message.content);
        res.json({ success: true, quiz: quizData.quiz });

    } catch (error) {
        console.error('AI Quiz Error:', error);
        res.status(500).json({ success: false, error: 'فشل إنشاء الاختبار عبر الذكاء الاصطناعي' });
    }
});

// تحليل النصوص
app.post('/api/ai/analyze', async (req, res) => {
    try {
        const { text } = req.body;

        const prompt = `قم بتحليل النص التالي واستخرج (عدد الكلمات، ملخص قصير، أهم 5 كلمات مفتاحية): \n\n ${text}
        يجب أن يكون الرد بصيغة JSON.`;

        const completion = await openai.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "gpt-3.5-turbo",
            response_format: { type: "json_object" },
        });

        const analysis = JSON.parse(completion.choices[0].message.content);
        res.json({ success: true, analysis });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== [ 3. إدارة المستخدمين (Firebase Admin) ] ====================

// التحقق من صلاحية المستخدم (مثال للسيرفر)
app.get('/api/user/verify/:uid', async (req, res) => {
    try {
        const userRecord = await admin.auth().getUser(req.params.uid);
        res.json({ success: true, user: userRecord });
    } catch (error) {
        res.status(404).json({ success: false, error: 'User not found' });
    }
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Smart Education API is running on port ${PORT}`);
});
