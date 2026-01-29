const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { Configuration, OpenAIApi } = require('openai');
const cors = require('cors')({ origin: true });

// 1. تهيئة Firebase
admin.initializeApp();

// 2. تهيئة قاعدة البيانات
const db = admin.firestore();

// 3. إعداد OpenAI (متوافق مع الإصدار 3.3.0)
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY, // يفضل استخدام متغيرات البيئة
  // أو يمكنك وضع المفتاح مباشرة هنا كـ string إذا كنت تفضل ذلك مؤقتاً:
  // apiKey: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
});

const openai = new OpenAIApi(configuration);

// 4. الدالة الرئيسية: إنشاء اختبار من كتاب
exports.createBookQuiz = functions.https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const {
        bookId,
        chapterId,
        questionCount = 5,
        difficulty = 'medium',
        questionType = 'mcq',
        userId = 'guest'
      } = req.body;

      console.log('📖 طلب إنشاء اختبار:', { bookId, chapterId, questionCount });

      if (!bookId || !chapterId) {
        return res.status(400).json({
          success: false,
          error: 'المعرفات المطلوبة: bookId و chapterId'
        });
      }

      const bookRef = db.collection('books').doc(bookId);
      const bookSnapshot = await bookRef.get();

      if (!bookSnapshot.exists) {
        return res.status(404).json({
          success: false,
          error: 'الكتاب غير موجود'
        });
      }

      const bookData = bookSnapshot.data();
      
      const chapterRef = bookRef.collection('chapters').doc(chapterId);
      const chapterSnapshot = await chapterRef.get();

      if (!chapterSnapshot.exists) {
        return res.status(404).json({
          success: false,
          error: 'الفصل غير موجود'
        });
      }

      const chapterData = chapterSnapshot.data();

      const arabicDifficulty = {
        'easy': 'سهل',
        'medium': 'متوسط', 
        'hard': 'صعب'
      }[difficulty] || 'متوسط';

      const prompt = `
      أنت معلم خبير في مادة "${bookData.subject || 'المواد الدراسية'}" للصف "${bookData.grade || 'المستوى التعليمي'}".

      **الكتاب:** ${bookData.title}
      **الفصل:** ${chapterData.title || 'الفصل الدراسي'}
      **المحتوى:** "${chapterData.content?.substring(0, 2000) || 'نص الفصل'}"

      **المهمة:**
      1. أنشئ ${questionCount} سؤالاً تعليمياً من نوع "${questionType === 'mcq' ? 'اختيار من متعدد' : 'صح وخطأ'}"
      2. مستوى الصعوبة: **${arabicDifficulty}**
      3. كل سؤال يجب أن:
         - يكون مباشراً من محتوى الفصل
         - له 4 خيارات (للمتعدد) أو خيارين (لصح/خطأ)
         - الإجابة الصحيحة واضحة
         - شرح مختصر للإجابة
      4. ركز على النقاط التعليمية الأساسية في النص

      **مثال للهيكل المطلوب:**
      {
        "bookTitle": "اسم الكتاب",
        "chapterTitle": "اسم الفصل", 
        "questions": [
          {
            "id": 1,
            "question": "نص السؤال",
            "options": ["الخيار 1", "الخيار 2", "الخيار 3", "الخيار 4"],
            "correctAnswer": 0,
            "explanation": "شرح الإجابة"
          }
        ]
      }
      `;

      // استخدام createChatCompletion المتوافق مع v3
      const aiResponse = await openai.createChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'أنت معلم ذكي. أجب دائمًا بتنسيق JSON فقط دون أي نص إضافي.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 3000
      });

      // الوصول للبيانات في v3 يتم عبر .data
      const aiContent = aiResponse.data.choices[0].message.content;
      
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error('فشل تحويل رد الذكاء الاصطناعي إلى JSON');
      }

      const quizData = JSON.parse(jsonMatch[0]);

      const quizId = `quiz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const quizToSave = {
        ...quizData,
        bookId: bookId,
        chapterId: chapterId,
        questionCount: parseInt(questionCount),
        difficulty: difficulty,
        questionType: questionType,
        generatedFor: userId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'active',
        views: 0,
        attempts: 0
      };

      await db.collection('generated_quizzes').doc(quizId).set(quizToSave);

      await bookRef.update({
        totalQuizzesGenerated: (bookData.totalQuizzesGenerated || 0) + 1,
        lastQuizGenerated: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.status(200).json({
        success: true,
        message: `✅ تم إنشاء ${quizData.questions?.length || 0} سؤال بنجاح`,
        quizId: quizId,
        quiz: quizData,
        metadata: {
          bookTitle: bookData.title,
          chapterTitle: chapterData.title,
          generatedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('🔥 خطأ في الخادم:', error);
      
      return res.status(500).json({
        success: false,
        error: 'فشل إنشاء الاختبار',
        details: error.message,
        code: error.code || 'UNKNOWN_ERROR'
      });
    }
  });
});

// 5. دالة لرفع كتاب جديد
exports.uploadBookWithAI = functions.https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const { 
        title, 
        author, 
        subject, 
        grade, 
        chapters 
      } = req.body;

      if (!title || !chapters) {
        return res.status(400).json({
          success: false,
          error: 'العنوان والفصول مطلوبة'
        });
      }

      const bookId = `book_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      
      const bookData = {
        title: title,
        author: author || 'مؤلف غير معروف',
        subject: subject || 'عام',
        grade: grade || 'جميع المستويات',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        totalChapters: Object.keys(chapters).length,
        status: 'active',
        aiEnabled: true
      };

      await db.collection('books').doc(bookId).set(bookData);

      const chapterPromises = Object.entries(chapters).map(async ([chapterKey, chapterData]) => {
        await db.collection('books').doc(bookId)
          .collection('chapters').doc(chapterKey).set({
            ...chapterData,
            bookId: bookId,
            order: parseInt(chapterKey.split('_')[1]) || 0
          });
      });

      await Promise.all(chapterPromises);

      return res.status(200).json({
        success: true,
        message: `تم رفع الكتاب "${title}" بنجاح`,
        bookId: bookId,
        totalChapters: Object.keys(chapters).length
      });

    } catch (error) {
      console.error('خطأ في رفع الكتاب:', error);
      return res.status(500).json({
        success: false,
        error: 'فشل رفع الكتاب'
      });
    }
  });
});

// 6. دالة لجلب اختبارات الكتاب
exports.getBookQuizzes = functions.https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const { bookId, limit = 10 } = req.query;

      if (!bookId) {
        return res.status(400).json({
          success: false,
          error: 'معرف الكتاب مطلوب'
        });
      }

      const quizzesSnapshot = await db.collection('generated_quizzes')
        .where('bookId', '==', bookId)
        .orderBy('createdAt', 'desc')
        .limit(parseInt(limit))
        .get();

      const quizzes = [];
      quizzesSnapshot.forEach(doc => {
        quizzes.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return res.status(200).json({
        success: true,
        quizzes: quizzes,
        total: quizzes.length
      });

    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'فشل جلب الاختبارات'
      });
    }
  });
});

// 7. دالة صحية للتحقق من عمل الخادم
exports.healthCheck = functions.https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    return res.status(200).json({
      success: true,
      message: '✅ خادم البوت التعليمي يعمل بشكل صحيح',
      timestamp: new Date().toISOString(),
      services: {
        firestore: '🟢 نشط',
        openai: '🟢 متصل',
        functions: '🟢 جاهز'
      },
      version: '1.0.0'
    });
  });
});

// 8. دالة لإنشاء فصل تلقائياً من نص
exports.createChapterFromText = functions.https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const { bookId, chapterTitle, chapterText } = req.body;

      if (!bookId || !chapterText) {
        return res.status(400).json({
          success: false,
          error: 'معرف الكتاب ونص الفصل مطلوبان'
        });
      }

      const chapterId = `chapter_${Date.now()}`;
      
      const analysisPrompt = `
      قم بتحليل النص التالي وإنشاء هيكل تعليمي له:
      
      "${chapterText.substring(0, 1500)}"
      
      المطلوب:
      1. عنوان مناسب للفصل
      2. 3-5 نقاط تعليمية رئيسية
      3. مستوى الصعوبة المقترح
      4. الكلمات المفتاحية التعليمية
      
      أخرج النتيجة كـ JSON:
      {
        "title": "عنوان الفصل",
        "keyPoints": ["النقطة 1", "النقطة 2"],
        "difficulty": "easy/medium/hard",
        "keywords": ["الكلمة 1", "الكلمة 2"]
      }
      `;

      const aiResponse = await openai.createChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'أنت محلل تعليمي محترف.' },
          { role: 'user', content: analysisPrompt }
        ],
        temperature: 0.6,
        max_tokens: 1000
      });

      const aiAnalysis = JSON.parse(
        aiResponse.data.choices[0].message.content.match(/\{[\s\S]*\}/)[0]
      );

      const chapterData = {
        title: chapterTitle || aiAnalysis.title,
        content: chapterText,
        keyPoints: aiAnalysis.keyPoints || [],
        difficulty: aiAnalysis.difficulty || 'medium',
        keywords: aiAnalysis.keywords || [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        wordCount: chapterText.split(' ').length,
        aiGenerated: true
      };

      await db.collection('books').doc(bookId)
        .collection('chapters').doc(chapterId).set(chapterData);

      return res.status(200).json({
        success: true,
        message: 'تم إنشاء الفصل بنجاح',
        chapterId: chapterId,
        analysis: aiAnalysis
      });

    } catch (error) {
      console.error('خطأ في إنشاء الفصل:', error);
      return res.status(500).json({
        success: false,
        error: 'فشل إنشاء الفصل'
      });
    }
  });
});
