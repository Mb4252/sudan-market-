const express = require('express');
const path = require('path');
const OpenAI = require('openai');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');
const axios = require('axios');
const pdf = require('pdf-parse');

const app = express();
const port = process.env.PORT || 3000;

// 1. إعدادات Firebase
if (process.env.FIREBASE_ADMIN_JSON) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_JSON);
        // التحقق من عدم تهيئة التطبيق مسبقاً لتجنب الأخطاء عند إعادة التشغيل
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
            });
            console.log("✅ Firebase Admin Connected");
        }
    } catch (error) {
        console.error("❌ Error parsing Firebase JSON:", error);
    }
}

// 2. إعدادات OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// --- التعديل الأول: جعل السيرفر يقرأ الملفات الثابتة من المجلد الرئيسي مباشرة ---
app.use(express.static(__dirname)); 

app.use(bodyParser.json());

// --- [ الميزة الجديدة: قراءة الكتاب وتوليد أسئلة منه ] ---
app.post('/api/generate-quiz-from-book', async (req, res) => {
    try {
        const { bookUrl, count } = req.body;

        if (!bookUrl) return res.status(400).json({ error: "لا يوجد رابط للكتاب" });

        // أ. تحميل ملف الـ PDF
        const response = await axios.get(bookUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);

        // ب. استخراج النص من الـ PDF
        const data = await pdf(buffer);
        // نأخذ أول 15000 حرف فقط لتوفير التكلفة وتجنب تجاوز الحدود
        const textContent = data.text.substring(0, 15000); 

        // ج. إرسال النص لـ GPT لعمل أسئلة
        const prompt = `
        لديك النص التالي من كتاب دراسي:
        "${textContent}..."
        
        بناءً على هذا النص فقط، قم بإنشاء ${count} أسئلة اختبار.
        النتيجة يجب أن تكون JSON فقط بصيغة:
        [{ "question": "...", "options": ["A", "B", "C", "D"], "correctAnswer": 0, "type": "اختيار من متعدد" }]
        `;

        const completion = await openai.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "gpt-3.5-turbo-16k",
        });

        const quizData = JSON.parse(completion.choices[0].message.content);
        res.json({ success: true, questions: quizData });

    } catch (error) {
        console.error("Error:", error.message);
        res.status(500).json({ success: false, error: "فشل قراءة الملف أو توليد الأسئلة" });
    }
});

// --- [ التوليد العام (للفصول والأسماء) ] ---
app.post('/api/generate-quiz', async (req, res) => {
    try {
        const { subject, chapter, count } = req.body;
        const prompt = `أنشئ اختباراً لمادة ${subject} الفصل ${chapter} مكون من ${count} أسئلة.
        JSON format: [{ "question": "...", "options": ["..."], "correctAnswer": 0, "type": "اختيار من متعدد" }]`;

        const completion = await openai.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "gpt-3.5-turbo",
        });

        const quizData = JSON.parse(completion.choices[0].message.content);
        res.json({ success: true, questions: quizData });
    } catch (error) {
        console.error("Generate Quiz Error:", error);
        res.status(500).json({ success: false });
    }
});

// --- التعديل الثاني: توجيه الصفحة الرئيسية لتقرأ index.html من نفس المجلد ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// تشغيل السيرفر
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
