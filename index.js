const express = require('express');
const admin = require('firebase-admin');
const OpenAI = require('openai');
const cors = require('cors');

// 1. إعداد تطبيق Express
const app = express();
app.use(cors({ origin: true })); // السماح بالطلبات من أي مصدر
app.use(express.json()); // السماح بقراءة بيانات JSON

// 2. تهيئة Firebase
// يحاول استخدام بيانات الاعتماد التلقائية في Render
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
  } catch (e) {
    console.log('ملاحظة: فشل التحقق التلقائي، سيتم التهيئة بدون بيانات اعتماد (قد يعمل محلياً فقط):', e.message);
    admin.initializeApp();
  }
}

const db = admin.firestore();

// 3. إعداد OpenAI (الإصدار الجديد v4)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, 
});

// ==========================================
// المسارات (Routes)
// ==========================================

// ✅ المسار الرئيسي: إنشاء اختبار (متوافق مع ملف HTML الخاص بك)
// يطابق الرابط: /generate-quiz
app.post('/generate-quiz', async (req, res) => {
  try {
    // استقبال البيانات كما يرسلها ملف HTML تماماً
    const {
      bookId,
      bookTitle,    // العنوان كما يرسله الواجهة
      chapter,      // اسم الفصل كنص (مثال: "الفصل الأول")
      questionCount = 5,
      difficulty = 'medium',
      userId = 'guest'
    } = req.body;

    console.log(`📖 طلب جديد: كتاب "${bookTitle}" - الفصل "${chapter}"`);

    // التحقق من البيانات الأساسية
    if (!bookId) {
      return res.status(400).json({ success: false, error: 'معرف الكتاب مفقود' });
    }

    // --- محاولة جلب محتوى الفصل ---
    let chapterContent = "";
    
    // بما أن الواجهة ترسل "اسم الفصل" وليس المعرف، سنبحث عنه
    if (chapter && chapter !== 'عام') {
      try {
        const chaptersRef = db.collection('books').doc(bookId).collection('chapters');
        const snapshot = await chaptersRef.where('title', '==', chapter).limit(1).get();
        
        if (!snapshot.empty) {
          const docData = snapshot.docs[0].data();
          chapterContent = docData.content || "";
          console.log("✅ تم العثور على محتوى الفصل في قاعدة البيانات.");
        }
      } catch (err) {
        console.warn("⚠️ لم يتم العثور على الفصل في قاعدة البيانات، سيتم الاعتماد على الذكاء العام.");
      }
    } else {
       chapterContent = `اختبار شامل عن الكتاب المدرسي: ${bookTitle}`;
    }

    // إذا كان المحتوى فارغاً، نجهز تعليمات للذكاء الاصطناعي للاعتماد على معرفته
    if (!chapterContent || chapterContent.length < 20) {
       chapterContent = `لم يتم توفير نص. اعتمد على معرفتك العامة عن كتاب "${bookTitle}" وتحديداً فصل "${chapter}".`;
    } else {
       // قص النص لتجنب تجاوز الحد المسموح
       chapterContent = chapterContent.substring(0, 3000);
    }

    // تجهيز مستوى الصعوبة
    const diffMap = { 'easy': 'سهل', 'medium': 'متوسط', 'hard': 'صعب' };
    const arDiff = diffMap[difficulty] || 'متوسط';

    // إعداد الـ Prompt
    const prompt = `
    أنت معلم خبير. أنشئ اختباراً من ${questionCount} أسئلة (اختيار من متعدد).
    الموضوع: كتاب "${bookTitle}" - "${chapter}".
    المحتوى المرجعي: "${chapterContent}"
    الصعوبة: ${arDiff}.

    القواعد الصارمة:
    1. المخرج يجب أن يكون JSON صالح فقط.
    2. لا تضف أي نص قبل أو بعد JSON.
    3. التنسيق:
    {
      "questions": [
        {
          "question": "نص السؤال",
          "options": ["أ", "ب", "ج", "د"],
          "correctAnswer": 0, // رقم الخيار الصحيح (0-3)
          "explanation": "شرح"
        }
      ]
    }
    `;

    // طلب البيانات من OpenAI
    const aiResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a JSON generator.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
    });

    // معالجة الرد
    let rawContent = aiResponse.choices[0].message.content;
    // تنظيف الكود من علامات Markdown إذا وجدت
    rawContent = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const quizData = JSON.parse(rawContent);

    // حفظ النتيجة في Firestore للرجوع إليها
    const quizId = `quiz_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    await db.collection('generated_quizzes').doc(quizId).set({
      ...quizData,
      bookId,
      bookTitle,
      chapter,
      difficulty,
      generatedFor: userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // إرسال الرد للواجهة (بنفس الهيكل المتوقع)
    res.status(200).json({
      success: true,
      quizId: quizId,
      quiz: quizData
    });

  } catch (error) {
    console.error('🔥 خطأ أثناء إنشاء الاختبار:', error);
    res.status(500).json({
      success: false,
      error: 'فشل إنشاء الاختبار',
      details: error.message
    });
  }
});

// ✅ مسار فحص الحالة (للتأكد أن السيرفر يعمل)
app.get('/healthCheck', (req, res) => {
  res.status(200).send('✅ Teacher Bot Server is Running!');
});

// ✅ مسار رفع كتاب (اختياري - إذا كنت تستخدمه في لوحة الإدارة)
app.post('/uploadBookWithAI', async (req, res) => {
  try {
    const { title, author, subject, grade, chapters } = req.body;
    if (!title || !chapters) return res.status(400).json({ error: 'بيانات ناقصة' });

    const bookId = `book_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    // حفظ الكتاب
    await db.collection('books').doc(bookId).set({
      title, author, subject, grade,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      aiEnabled: true
    });

    // حفظ الفصول
    const batch = db.batch();
    Object.entries(chapters).forEach(([key, data]) => {
      const ref = db.collection('books').doc(bookId).collection('chapters').doc(key);
      batch.set(ref, { ...data, bookId });
    });
    await batch.commit();

    res.json({ success: true, bookId, message: 'تم الرفع بنجاح' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 4. تشغيل السيرفر
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
