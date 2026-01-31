const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const admin = require('firebase-admin');
const imageThumbnail = require('image-thumbnail');
const { PDFDocument } = require('pdf-lib');
const { WebSocketServer } = require('ws');
const http = require('http');
const moment = require('moment');
const { OpenAI } = require('openai');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const port = process.env.PORT || 3001;

// ==================== [ 1. إعدادات أساسية ] ====================
const ADMIN_BANK_ACCOUNT = "4426148";
const ADMIN_NAME = "محمد عبدالمعطي علي";
const WEEKLY_SUBSCRIPTION = 7000;
const TEACHER_MONTHLY_FEE = 30000;
const FREE_TRIAL_DAYS = 1;
const FREE_TEACHER_MONTHS = 1;
const MAX_DAILY_QUESTIONS = 100;

// ==================== [ 2. إعدادات تخزين الملفات ] ====================
const STORAGE_BASE = './smart_storage';
const FOLDERS = {
    IMAGES: 'images',
    BOOKS: 'books',
    VIDEOS: 'videos',
    AVATARS: 'avatars',
    TEACHER_IDS: 'teacher_ids',
    LIVE_RECORDINGS: 'live_recordings'
};

// إنشاء المجلدات
(async () => {
    try {
        await fs.mkdir(STORAGE_BASE, { recursive: true });
        for (const folder of Object.values(FOLDERS)) {
            await fs.mkdir(path.join(STORAGE_BASE, folder), { recursive: true });
        }
        console.log('✅ مجلدات التخزين جاهزة');
    } catch (error) {
        console.error('❌ خطأ في إنشاء المجلدات:', error);
    }
})();

// تكوين Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const folder = req.params.folder || 'images';
        cb(null, path.join(STORAGE_BASE, folder));
    },
    filename: (req, file, cb) => {
        const uniqueId = crypto.randomBytes(8).toString('hex');
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}_${uniqueId}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = {
            'image/jpeg': 'images',
            'image/png': 'images',
            'image/webp': 'images',
            'application/pdf': 'books',
            'video/mp4': 'videos',
            'video/webm': 'videos'
        };
        
        if (allowedTypes[file.mimetype]) {
            cb(null, true);
        } else {
            cb(new Error(`نوع الملف غير مدعوم: ${file.mimetype}`), false);
        }
    }
});

// ==================== [ 3. إعداد Firebase ] ====================
let firebaseInitialized = false;

const initializeFirebase = () => {
    try {
        if (admin.apps.length === 0) {
            const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_JSON || '{}');
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
            });
        }
        firebaseInitialized = true;
        console.log('✅ Firebase Admin متصل');
    } catch (error) {
        console.error('❌ خطأ في إعداد Firebase:', error.message);
    }
};

initializeFirebase();
const db = firebaseInitialized ? admin.database() : null;

// ==================== [ 4. إعداد OpenAI ] ====================
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'your-openai-api-key',
});

// ==================== [ 5. نظام البث المباشر الجماعي (WebSocket) ] ====================
const activeRooms = new Map();
const userConnections = new Map();

io.on('connection', (socket) => {
    console.log('👤 مستخدم متصل:', socket.id);

    socket.on('join-room', async (data) => {
        const { roomId, userId, userName, userRole } = data;
        
        if (!activeRooms.has(roomId)) {
            activeRooms.set(roomId, {
                id: roomId,
                host: userId,
                participants: new Map(),
                created: Date.now(),
                status: 'active'
            });
        }

        const room = activeRooms.get(roomId);
        room.participants.set(userId, {
            id: userId,
            name: userName,
            role: userRole,
            socketId: socket.id,
            joinedAt: Date.now(),
            hasPaid: await checkPaymentStatus(userId, roomId)
        });

        socket.join(roomId);
        userConnections.set(socket.id, { userId, roomId });

        // إعلام الجميع بمستخدم جديد
        io.to(roomId).emit('participant-joined', {
            userId,
            userName,
            userRole,
            participantsCount: room.participants.size
        });

        // إرسال قائمة المشاركين للمستخدم الجديد
        socket.emit('room-info', {
            roomId,
            host: room.host,
            participants: Array.from(room.participants.values()).map(p => ({
                id: p.id,
                name: p.name,
                role: p.role,
                hasPaid: p.hasPaid
            }))
        });

        console.log(`🎥 ${userName} انضم للغرفة ${roomId}`);
    });

    // إشارات WebRTC
    socket.on('webrtc-signal', (data) => {
        const { to, signal, type } = data;
        socket.to(to).emit('webrtc-signal', { 
            from: socket.id, 
            signal, 
            type 
        });
    });

    // التحكم في الغرفة (للأستاذ فقط)
    socket.on('room-control', async (data) => {
        const { roomId, action, targetUserId, reason } = data;
        const room = activeRooms.get(roomId);
        
        if (!room || room.host !== userConnections.get(socket.id)?.userId) {
            return;
        }

        if (action === 'remove-student') {
            const participant = room.participants.get(targetUserId);
            if (participant && participant.role === 'student') {
                room.participants.delete(targetUserId);
                
                // إغلاق الاتصال مع الطالب المطرود
                io.to(participant.socketId).emit('kicked-from-room', {
                    reason: reason || 'لم تقم بالدفع'
                });
                socket.to(participant.socketId).socketsLeave(roomId);
                
                // إعلام الباقين
                io.to(roomId).emit('participant-removed', {
                    userId: targetUserId,
                    reason: reason
                });

                // تسجيل في قاعدة البيانات
                if (db) {
                    await db.ref(`room_kicks/${roomId}`).push({
                        userId: targetUserId,
                        kickedBy: room.host,
                        reason: reason,
                        timestamp: Date.now()
                    });
                }
            }
        }
    });

    // رسائل الدردشة
    socket.on('send-message', (data) => {
        const { roomId, message, userName } = data;
        io.to(roomId).emit('new-message', {
            userId: userConnections.get(socket.id)?.userId,
            userName: userName,
            message: message,
            timestamp: Date.now()
        });

        // حفظ الرسائل
        if (db) {
            db.ref(`room_chat/${roomId}`).push({
                userId: userConnections.get(socket.id)?.userId,
                userName: userName,
                message: message,
                timestamp: Date.now()
            });
        }
    });

    // بدء/إيقاف التسجيل
    socket.on('recording-control', (data) => {
        const { roomId, action } = data;
        io.to(roomId).emit('recording-status', {
            action: action,
            timestamp: Date.now()
        });
    });

    socket.on('disconnect', () => {
        const userInfo = userConnections.get(socket.id);
        if (userInfo) {
            const { userId, roomId } = userInfo;
            const room = activeRooms.get(roomId);
            
            if (room) {
                room.participants.delete(userId);
                io.to(roomId).emit('participant-left', { userId });
                
                if (room.participants.size === 0) {
                    activeRooms.delete(roomId);
                }
            }
            
            userConnections.delete(socket.id);
        }
        console.log('👤 مستخدم انقطع:', socket.id);
    });
});

// ==================== [ 6. دوال مساعدة ] ====================
async function checkPaymentStatus(userId, roomId) {
    if (!db) return false;
    
    try {
        const snapshot = await db.ref(`payments/${userId}`).once('value');
        const payments = snapshot.val();
        
        if (!payments) return false;
        
        // التحقق من الدفع الأخير
        const lastPayment = Object.values(payments).sort((a, b) => b.timestamp - a.timestamp)[0];
        
        if (!lastPayment) return false;
        
        // التحقق من صلاحية الدفع
        const paymentDate = moment(lastPayment.timestamp);
        const now = moment();
        
        if (lastPayment.type === 'weekly') {
            return paymentDate.add(7, 'days').isAfter(now);
        } else if (lastPayment.type === 'monthly') {
            return paymentDate.add(30, 'days').isAfter(now);
        } else if (lastPayment.type === 'trial') {
            return paymentDate.add(FREE_TRIAL_DAYS, 'days').isAfter(now);
        }
        
        return false;
    } catch (error) {
        console.error('خطأ في التحقق من الدفع:', error);
        return false;
    }
}

// ==================== [ 7. المسارات الرئيسية ] ====================

// 7.1 رفع كتاب (للإدمن فقط)
app.post('/api/admin/upload-book', upload.single('book'), async (req, res) => {
    try {
        const { adminId } = req.body;
        
        if (!adminId || adminId !== process.env.ADMIN_ID) {
            return res.status(403).json({ success: false, error: 'غير مصرح' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, error: 'لم يتم رفع أي كتاب' });
        }
        
        const bookInfo = {
            title: req.body.title || 'كتاب بدون عنوان',
            author: req.body.author || 'مؤلف غير معروف',
            grade: req.body.grade || 'غير محدد',
            subject: req.body.subject || 'عام',
            description: req.body.description || '',
            year: req.body.year || new Date().getFullYear(),
            pages: parseInt(req.body.pages) || 0,
            uploadDate: Date.now(),
            uploadedBy: 'admin'
        };
        
        const bookId = `book_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const bookMetadata = {
            ...bookInfo,
            id: bookId,
            fileName: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size,
            mimeType: req.file.mimetype,
            url: `${process.env.BOT_URL || 'http://localhost:' + port}/api/file/books/${req.file.filename}`,
            downloadUrl: `${process.env.BOT_URL || 'http://localhost:' + port}/api/download/books/${req.file.filename}`,
            downloads: 0
        };
        
        if (db) {
            await db.ref(`books/${bookId}`).set(bookMetadata);
        }
        
        res.json({
            success: true,
            message: 'تم رفع الكتاب بنجاح',
            bookId: bookId,
            metadata: bookMetadata
        });
        
    } catch (error) {
        console.error('خطأ في رفع الكتاب:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 7.2 الحصول على قائمة الكتب
app.get('/api/books', async (req, res) => {
    try {
        const { grade, subject, page = 1, limit = 20 } = req.query;
        
        let books = [];
        
        if (db) {
            const snapshot = await db.ref('books').once('value');
            const allBooks = snapshot.val();
            
            if (allBooks) {
                books = Object.values(allBooks);
                
                // التصفية حسب الصف والمادة
                if (grade) {
                    books = books.filter(book => book.grade === grade);
                }
                if (subject) {
                    books = books.filter(book => book.subject === subject);
                }
                
                // الترتيب حسب التاريخ
                books.sort((a, b) => b.uploadDate - a.uploadDate);
                
                // التجزئة
                const start = (page - 1) * limit;
                const end = start + limit;
                const paginatedBooks = books.slice(start, end);
                
                res.json({
                    success: true,
                    total: books.length,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    books: paginatedBooks
                });
            } else {
                res.json({
                    success: true,
                    total: 0,
                    books: []
                });
            }
        } else {
            res.status(500).json({ success: false, error: 'قاعدة البيانات غير متاحة' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 7.3 نظام الدفع والاشتراكات
app.post('/api/payment/subscribe', async (req, res) => {
    try {
        const { userId, userName, userEmail, type, bankReceipt, teacherId } = req.body;
        
        if (!userId || !type) {
            return res.status(400).json({ success: false, error: 'بيانات ناقصة' });
        }
        
        // التحقق من نوع الاشتراك
        const validTypes = ['weekly', 'monthly', 'teacher_monthly'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ success: false, error: 'نوع اشتراك غير صالح' });
        }
        
        const paymentId = `pay_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const amount = type === 'weekly' ? WEEKLY_SUBSCRIPTION : 
                      type === 'teacher_monthly' ? TEACHER_MONTHLY_FEE : 0;
        
        const paymentData = {
            id: paymentId,
            userId: userId,
            userName: userName,
            userEmail: userEmail,
            type: type,
            amount: amount,
            bankReceipt: bankReceipt,
            teacherId: teacherId || null,
            status: 'pending_verification',
            adminAccount: ADMIN_BANK_ACCOUNT,
            adminName: ADMIN_NAME,
            timestamp: Date.now(),
            verified: false,
            verifiedBy: null,
            verifiedAt: null
        };
        
        if (db) {
            await db.ref(`payments/${userId}/${paymentId}`).set(paymentData);
            
            // إشعار للإدمن
            await db.ref('admin_notifications').push({
                type: 'new_payment',
                paymentId: paymentId,
                userId: userId,
                userName: userName,
                amount: amount,
                subscriptionType: type,
                timestamp: Date.now(),
                status: 'pending'
            });
        }
        
        res.json({
            success: true,
            message: 'تم إرسال طلب الاشتراك. سيتم المراجعة من قبل الإدمن.',
            paymentId: paymentId,
            adminAccount: ADMIN_BANK_ACCOUNT,
            adminName: ADMIN_NAME,
            amount: amount
        });
        
    } catch (error) {
        console.error('خطأ في طلب الاشتراك:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 7.4 تأكيد الدفع (للإدمن فقط)
app.post('/api/admin/verify-payment', async (req, res) => {
    try {
        const { adminId, paymentId, userId, action } = req.body;
        
        if (!adminId || adminId !== process.env.ADMIN_ID) {
            return res.status(403).json({ success: false, error: 'غير مصرح' });
        }
        
        if (!db) {
            return res.status(500).json({ success: false, error: 'قاعدة البيانات غير متاحة' });
        }
        
        const paymentRef = db.ref(`payments/${userId}/${paymentId}`);
        const snapshot = await paymentRef.once('value');
        const payment = snapshot.val();
        
        if (!payment) {
            return res.status(404).json({ success: false, error: 'الدفع غير موجود' });
        }
        
        const updateData = {
            status: action === 'approve' ? 'verified' : 'rejected',
            verified: action === 'approve',
            verifiedBy: adminId,
            verifiedAt: Date.now()
        };
        
        await paymentRef.update(updateData);
        
        // إذا تم الموافقة، تحديث حالة المستخدم
        if (action === 'approve') {
            const userRef = db.ref(`users/${userId}`);
            const userSnapshot = await userRef.once('value');
            const user = userSnapshot.val();
            
            if (user) {
                const subscriptionEnd = Date.now() + (
                    payment.type === 'weekly' ? 7 * 24 * 60 * 60 * 1000 :
                    payment.type === 'monthly' ? 30 * 24 * 60 * 60 * 1000 :
                    payment.type === 'teacher_monthly' ? 30 * 24 * 60 * 60 * 1000 : 0
                );
                
                await userRef.update({
                    hasActiveSubscription: true,
                    subscriptionType: payment.type,
                    subscriptionStart: Date.now(),
                    subscriptionEnd: subscriptionEnd,
                    lastPayment: paymentId
                });
            }
        }
        
        // إرسال إشعار للمستخدم
        await db.ref(`user_notifications/${userId}`).push({
            type: 'payment_verification',
            paymentId: paymentId,
            status: action === 'approve' ? 'approved' : 'rejected',
            message: action === 'approve' ? 
                'تم تأكيد دفعتك بنجاح. يمكنك الآن استخدام الخدمات.' :
                'تم رفض دفعتك. يرجى التحقق من إيصال التحويل.',
            timestamp: Date.now()
        });
        
        res.json({
            success: true,
            message: `تم ${action === 'approve' ? 'تأكيد' : 'رفض'} الدفع بنجاح`
        });
        
    } catch (error) {
        console.error('خطأ في تأكيد الدفع:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 7.5 المساعد الذكي - إنشاء اختبار
app.post('/api/ai/generate-quiz', async (req, res) => {
    try {
        const { userId, bookId, questionCount = 5, questionTypes = ['mcq', 'true_false', 'essay'] } = req.body;
        
        if (!userId) {
            return res.status(400).json({ success: false, error: 'يجب تسجيل الدخول' });
        }
        
        // التحقق من الحد اليومي
        const today = moment().format('YYYY-MM-DD');
        const dailyKey = `ai_questions_${userId}_${today}`;
        
        if (db) {
            const snapshot = await db.ref(`ai_usage/${dailyKey}`).once('value');
            const todayUsage = snapshot.val() || { count: 0 };
            
            if (todayUsage.count >= MAX_DAILY_QUESTIONS) {
                return res.status(429).json({
                    success: false,
                    error: `لقد استخدمت الحد اليومي (${MAX_DAILY_QUESTIONS} سؤال). يرجى المحاولة غداً.`
                });
            }
            
            // زيادة العداد
            await db.ref(`ai_usage/${dailyKey}`).set({
                count: todayUsage.count + questionCount,
                lastUsed: Date.now()
            });
        }
        
        // الحصول على محتوى الكتاب
        let bookContent = '';
        if (bookId && db) {
            const snapshot = await db.ref(`books/${bookId}`).once('value');
            const book = snapshot.val();
            
            if (book && book.fileName) {
                const filePath = path.join(STORAGE_BASE, 'books', book.fileName);
                if (book.mimeType === 'application/pdf') {
                    const pdf = require('pdf-parse');
                    const dataBuffer = await fs.readFile(filePath);
                    const data = await pdf(dataBuffer);
                    bookContent = data.text.substring(0, 5000); // الحد بـ 5000 حرف
                }
            }
        }
        
        // توليد الأسئلة باستخدام OpenAI
        const prompt = `
        أنشئ اختباراً تعليمياً بناءً على المحتوى التالي:
        
        ${bookContent || 'موضوع عام في التعليم'}
        
        المتطلبات:
        - عدد الأسئلة: ${questionCount}
        - أنواع الأسئلة: ${questionTypes.join('، ')}
        - مستوى الصعوبة: متوسط
        - اللغة: العربية الفصحى
        
        أرجو الإجابة بتنسيق JSON بالشكل التالي:
        {
          "quizTitle": "عنوان الاختبار",
          "questions": [
            {
              "id": 1,
              "type": "mcq",
              "question": "نص السؤال",
              "options": ["الخيار أ", "الخيار ب", "الخيار ج", "الخيار د"],
              "correctAnswer": 0,
              "explanation": "شرح الإجابة"
            }
          ],
          "timeLimit": 30
        }
        `;
        
        const completion = await openai.chat.completions.create({
            messages: [
                { 
                    role: "system", 
                    content: "أنت مساعد تعليمي ذكي تقوم بإنشاء اختبارات تعليمية." 
                },
                { role: "user", content: prompt }
            ],
            model: "gpt-3.5-turbo",
            temperature: 0.7
        });
        
        let quizData;
        try {
            quizData = JSON.parse(completion.choices[0].message.content);
        } catch (error) {
            quizData = {
                quizTitle: "اختبار تعليمي",
                questions: Array.from({ length: questionCount }, (_, i) => ({
                    id: i + 1,
                    type: questionTypes[i % questionTypes.length],
                    question: `سؤال رقم ${i + 1}`,
                    options: ["الخيار أ", "الخيار ب", "الخيار ج", "الخيار د"],
                    correctAnswer: 0
                })),
                timeLimit: 30
            };
        }
        
        // حفظ الاختبار في قاعدة البيانات
        const quizId = `quiz_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        
        if (db) {
            await db.ref(`quizzes/${quizId}`).set({
                id: quizId,
                userId: userId,
                bookId: bookId || null,
                title: quizData.quizTitle,
                questions: quizData.questions,
                timeLimit: quizData.timeLimit || 30,
                createdAt: Date.now(),
                status: 'active'
            });
            
            // تسجيل نشاط المستخدم
            await db.ref(`user_activities/${userId}/quizzes`).push({
                quizId: quizId,
                title: quizData.quizTitle,
                createdAt: Date.now()
            });
        }
        
        res.json({
            success: true,
            quizId: quizId,
            quiz: quizData,
            dailyUsage: {
                used: (todayUsage.count || 0) + questionCount,
                remaining: MAX_DAILY_QUESTIONS - ((todayUsage.count || 0) + questionCount)
            }
        });
        
    } catch (error) {
        console.error('خطأ في توليد الاختبار:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 7.6 تصحيح الاختبار
app.post('/api/ai/grade-quiz', async (req, res) => {
    try {
        const { userId, quizId, answers } = req.body;
        
        if (!userId || !quizId || !answers) {
            return res.status(400).json({ success: false, error: 'بيانات ناقصة' });
        }
        
        let quiz;
        if (db) {
            const snapshot = await db.ref(`quizzes/${quizId}`).once('value');
            quiz = snapshot.val();
        }
        
        if (!quiz) {
            return res.status(404).json({ success: false, error: 'الاختبار غير موجود' });
        }
        
        // تصحيح الإجابات
        const results = [];
        let score = 0;
        let totalQuestions = quiz.questions.length;
        
        for (const question of quiz.questions) {
            const userAnswer = answers[question.id];
            let isCorrect = false;
            let points = 0;
            
            if (question.type === 'mcq' || question.type === 'true_false') {
                isCorrect = userAnswer === question.correctAnswer;
                points = isCorrect ? 1 : 0;
            } else if (question.type === 'essay') {
                // تصحيح المقالات باستخدام الذكاء الاصطناعي
                const prompt = `
                قيم الإجابة المقالية التالية:
                
                السؤال: ${question.question}
                
                الإجابة النموذجية: ${question.correctAnswer || 'لا يوجد نموذج إجابة'}
                
                إجابة الطالب: ${userAnswer || 'لم يجب الطالب'}
                
                قيم الإجابة من 10 درجات مع شرح التقييم.
                `;
                
                const completion = await openai.chat.completions.create({
                    messages: [{ role: "user", content: prompt }],
                    model: "gpt-3.5-turbo",
                    temperature: 0.3
                });
                
                const evaluation = completion.choices[0].message.content;
                points = 7; // درجة افتراضية، يمكن تحسينها
                isCorrect = points >= 5;
            }
            
            if (isCorrect) score++;
            
            results.push({
                questionId: question.id,
                question: question.question,
                type: question.type,
                userAnswer: userAnswer,
                correctAnswer: question.correctAnswer,
                isCorrect: isCorrect,
                points: points,
                explanation: question.explanation
            });
        }
        
        const percentage = Math.round((score / totalQuestions) * 100);
        
        // حفظ النتيجة
        const resultId = `result_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        
        if (db) {
            await db.ref(`quiz_results/${resultId}`).set({
                id: resultId,
                userId: userId,
                quizId: quizId,
                quizTitle: quiz.title,
                score: score,
                totalQuestions: totalQuestions,
                percentage: percentage,
                results: results,
                takenAt: Date.now(),
                timeSpent: req.body.timeSpent || 0
            });
            
            // تحديث إحصائيات المستخدم
            const statsRef = db.ref(`user_stats/${userId}`);
            const statsSnapshot = await statsRef.once('value');
            const stats = statsSnapshot.val() || { quizzesTaken: 0, averageScore: 0 };
            
            const newTotal = stats.quizzesTaken + 1;
            const newAverage = ((stats.averageScore * stats.quizzesTaken) + percentage) / newTotal;
            
            await statsRef.update({
                quizzesTaken: newTotal,
                averageScore: Math.round(newAverage),
                lastQuiz: resultId,
                lastQuizDate: Date.now()
            });
        }
        
        res.json({
            success: true,
            resultId: resultId,
            score: score,
            totalQuestions: totalQuestions,
            percentage: percentage,
            results: results,
            feedback: percentage >= 70 ? 'ممتاز! أداء رائع.' :
                     percentage >= 50 ? 'جيد، يمكنك التحسين.' :
                     'يحتاج لمزيد من المذاكرة.'
        });
        
    } catch (error) {
        console.error('خطأ في تصحيح الاختبار:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 7.7 الحصول على إحصائيات المستخدم
app.get('/api/user/stats/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!db) {
            return res.status(500).json({ success: false, error: 'قاعدة البيانات غير متاحة' });
        }
        
        const today = moment().format('YYYY-MM-DD');
        const dailyKey = `ai_questions_${userId}_${today}`;
        
        const [userSnapshot, statsSnapshot, usageSnapshot, subscriptionsSnapshot] = await Promise.all([
            db.ref(`users/${userId}`).once('value'),
            db.ref(`user_stats/${userId}`).once('value'),
            db.ref(`ai_usage/${dailyKey}`).once('value'),
            db.ref(`payments/${userId}`).once('value')
        ]);
        
        const user = userSnapshot.val();
        const stats = statsSnapshot.val() || { quizzesTaken: 0, averageScore: 0 };
        const dailyUsage = usageSnapshot.val() || { count: 0 };
        const subscriptions = subscriptionsSnapshot.val() || {};
        
        let activeSubscription = null;
        let nextPaymentDue = null;
        
        // التحقق من الاشتراكات النشطة
        const now = Date.now();
        for (const [paymentId, payment] of Object.entries(subscriptions)) {
            if (payment.status === 'verified' && payment.verified) {
                const subscriptionEnd = payment.timestamp + (
                    payment.type === 'weekly' ? 7 * 24 * 60 * 60 * 1000 :
                    payment.type === 'monthly' ? 30 * 24 * 60 * 60 * 1000 :
                    payment.type === 'teacher_monthly' ? 30 * 24 * 60 * 60 * 1000 : 0
                );
                
                if (subscriptionEnd > now) {
                    activeSubscription = {
                        type: payment.type,
                        amount: payment.amount,
                        startDate: payment.timestamp,
                        endDate: subscriptionEnd,
                        daysRemaining: Math.ceil((subscriptionEnd - now) / (24 * 60 * 60 * 1000))
                    };
                    nextPaymentDue = subscriptionEnd;
                    break;
                }
            }
        }
        
        res.json({
            success: true,
            user: {
                name: user?.name,
                email: user?.email,
                grade: user?.grade,
                role: user?.role,
                joinDate: user?.joinDate
            },
            stats: {
                quizzesTaken: stats.quizzesTaken || 0,
                averageScore: stats.averageScore || 0,
                booksDownloaded: stats.booksDownloaded || 0,
                liveSessionsAttended: stats.liveSessionsAttended || 0
            },
            aiUsage: {
                dailyUsed: dailyUsage.count || 0,
                dailyRemaining: MAX_DAILY_QUESTIONS - (dailyUsage.count || 0),
                limit: MAX_DAILY_QUESTIONS
            },
            subscription: activeSubscription,
            nextPaymentDue: nextPaymentDue,
            adminBank: {
                account: ADMIN_BANK_ACCOUNT,
                name: ADMIN_NAME
            }
        });
        
    } catch (error) {
        console.error('خطأ في الحصول على الإحصائيات:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 7.8 إدارة الغرف الحية (للأستاذ)
app.post('/api/live/create-room', async (req, res) => {
    try {
        const { teacherId, teacherName, title, description, maxParticipants = 20 } = req.body;
        
        if (!teacherId || !teacherName || !title) {
            return res.status(400).json({ success: false, error: 'بيانات ناقصة' });
        }
        
        // التحقق من أن المستخدم أستاذ وله اشتراك نشط
        if (db) {
            const userSnapshot = await db.ref(`users/${teacherId}`).once('value');
            const user = userSnapshot.val();
            
            if (!user || user.role !== 'teacher') {
                return res.status(403).json({ success: false, error: 'يجب أن تكون أستاذاً لإنشاء غرفة' });
            }
            
            // التحقق من الاشتراك الشهري للأستاذ
            const paymentsSnapshot = await db.ref(`payments/${teacherId}`).once('value');
            const payments = paymentsSnapshot.val() || {};
            
            let hasActiveSubscription = false;
            const now = Date.now();
            
            for (const payment of Object.values(payments)) {
                if (payment.type === 'teacher_monthly' && payment.status === 'verified' && payment.verified) {
                    const subscriptionEnd = payment.timestamp + (30 * 24 * 60 * 60 * 1000);
                    if (subscriptionEnd > now) {
                        hasActiveSubscription = true;
                        break;
                    }
                }
            }
            
            // السماح بالشهر الأول مجاناً
            const oneMonthAgo = now - (30 * 24 * 60 * 60 * 1000);
            const isFirstMonth = user.joinDate > oneMonthAgo;
            
            if (!hasActiveSubscription && !isFirstMonth) {
                return res.status(403).json({
                    success: false,
                    error: 'يجب أن يكون لديك اشتراك شهري نشط لإنشاء غرف بث',
                    requiredPayment: {
                        amount: TEACHER_MONTHLY_FEE,
                        type: 'teacher_monthly',
                        adminAccount: ADMIN_BANK_ACCOUNT,
                        adminName: ADMIN_NAME
                    }
                });
            }
        }
        
        const roomId = `room_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
        
        const roomData = {
            id: roomId,
            teacherId: teacherId,
            teacherName: teacherName,
            title: title,
            description: description || '',
            maxParticipants: maxParticipants,
            createdAt: Date.now(),
            status: 'scheduled',
            participants: 0,
            isRecording: false
        };
        
        if (db) {
            await db.ref(`live_rooms/${roomId}`).set(roomData);
        }
        
        res.json({
            success: true,
            message: 'تم إنشاء غرفة البث بنجاح',
            roomId: roomId,
            room: roomData,
            socketUrl: process.env.BOT_URL || `http://localhost:${port}`
        });
        
    } catch (error) {
        console.error('خطأ في إنشاء الغرفة:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 7.9 إلغاء طالب من البث
app.post('/api/live/remove-student', async (req, res) => {
    try {
        const { teacherId, roomId, studentId, reason } = req.body;
        
        if (!teacherId || !roomId || !studentId) {
            return res.status(400).json({ success: false, error: 'بيانات ناقصة' });
        }
        
        // التحقق من أن المعلم هو مضيف الغرفة
        if (db) {
            const roomSnapshot = await db.ref(`live_rooms/${roomId}`).once('value');
            const room = roomSnapshot.val();
            
            if (!room || room.teacherId !== teacherId) {
                return res.status(403).json({ success: false, error: 'غير مصرح' });
            }
            
            // تسجيل الإلغاء
            await db.ref(`room_kicks/${roomId}`).push({
                studentId: studentId,
                teacherId: teacherId,
                reason: reason || 'عدم الدفع',
                timestamp: Date.now()
            });
            
            // إرسال إشعار للطالب
            await db.ref(`user_notifications/${studentId}`).push({
                type: 'removed_from_live',
                roomId: roomId,
                roomTitle: room.title,
                teacherName: room.teacherName,
                reason: reason || 'عدم الدفع',
                timestamp: Date.now()
            });
            
            // إعلام السيرفر للقطع الفوري
            io.to(roomId).emit('force-disconnect', {
                userId: studentId,
                reason: reason || 'تم إزالتك من البث'
            });
        }
        
        res.json({
            success: true,
            message: 'تم إزالة الطالب من الغرفة'
        });
        
    } catch (error) {
        console.error('خطأ في إزالة الطالب:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 7.10 الحصول على إحصائيات الإدمن
app.get('/api/admin/stats', async (req, res) => {
    try {
        const { adminId } = req.query;
        
        if (!adminId || adminId !== process.env.ADMIN_ID) {
            return res.status(403).json({ success: false, error: 'غير مصرح' });
        }
        
        if (!db) {
            return res.status(500).json({ success: false, error: 'قاعدة البيانات غير متاحة' });
        }
        
        const [usersSnapshot, paymentsSnapshot, booksSnapshot, roomsSnapshot] = await Promise.all([
            db.ref('users').once('value'),
            db.ref('payments').once('value'),
            db.ref('books').once('value'),
            db.ref('live_rooms').once('value')
        ]);
        
        const users = usersSnapshot.val() || {};
        const payments = paymentsSnapshot.val() || {};
        const books = booksSnapshot.val() || {};
        const rooms = roomsSnapshot.val() || {};
        
        let totalRevenue = 0;
        let verifiedPayments = 0;
        let pendingPayments = 0;
        
        // حساب الإيرادات
        Object.values(payments).forEach(userPayments => {
            Object.values(userPayments).forEach(payment => {
                if (payment.status === 'verified') {
                    totalRevenue += payment.amount || 0;
                    verifiedPayments++;
                } else if (payment.status === 'pending_verification') {
                    pendingPayments++;
                }
            });
        });
        
        const stats = {
            users: {
                total: Object.keys(users).length,
                students: Object.values(users).filter(u => u.role === 'student').length,
                teachers: Object.values(users).filter(u => u.role === 'teacher').length,
                pendingTeachers: Object.values(users).filter(u => u.role === 'pending_teacher').length
            },
            revenue: {
                total: totalRevenue,
                weekly: WEEKLY_SUBSCRIPTION,
                monthly: TEACHER_MONTHLY_FEE,
                verifiedPayments: verifiedPayments,
                pendingPayments: pendingPayments
            },
            content: {
                totalBooks: Object.keys(books).length,
                booksByGrade: {},
                booksBySubject: {}
            },
            live: {
                totalRooms: Object.keys(rooms).length,
                activeRooms: Object.values(rooms).filter(r => r.status === 'active').length
            },
            bankInfo: {
                account: ADMIN_BANK_ACCOUNT,
                name: ADMIN_NAME,
                totalCollected: totalRevenue
            }
        };
        
        // تحليل الكتب
        Object.values(books).forEach(book => {
            stats.content.booksByGrade[book.grade] = (stats.content.booksByGrade[book.grade] || 0) + 1;
            stats.content.booksBySubject[book.subject] = (stats.content.booksBySubject[book.subject] || 0) + 1;
        });
        
        res.json({
            success: true,
            stats: stats,
            timestamp: Date.now()
        });
        
    } catch (error) {
        console.error('خطأ في إحصائيات الإدمن:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== [ 8. المسارات الحالية من الكود الأصلي ] ====================

// 8.1 رفع ملف
app.post('/api/upload/:folder?', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'لم يتم رفع أي ملف' });
        }

        const folder = req.params.folder || FOLDERS.IMAGES;
        const uploadedBy = req.body.userId || 'anonymous';
        const filePath = req.file.path;
        
        let thumbnailUrl = null;
        let pdfInfo = null;
        
        if (req.file.mimetype.startsWith('image/')) {
            thumbnailUrl = await createThumbnail(filePath, folder, req.file.filename);
        }
        
        if (req.file.mimetype === 'application/pdf') {
            pdfInfo = await extractPDFInfo(filePath);
        }
        
        const fileMetadata = {
            originalName: req.file.originalname,
            fileName: req.file.filename,
            folder: folder,
            mimeType: req.file.mimetype,
            size: req.file.size,
            uploadedBy: uploadedBy,
            isPublic: req.body.isPublic !== 'false',
            thumbnailUrl: thumbnailUrl,
            extraInfo: pdfInfo || {}
        };
        
        const storedMetadata = await storeFileMetadata(fileMetadata);
        
        res.json({
            success: true,
            message: 'تم رفع الملف بنجاح',
            fileId: storedMetadata.id,
            metadata: storedMetadata,
            storageNote: '📦 الملف مخزن في ذاكرة البوت، فقط الرابط مخزن في Firebase'
        });
        
    } catch (error) {
        console.error('خطأ في رفع الملف:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 8.2 الحصول على ملف
app.get('/api/file/:folder/:filename', async (req, res) => {
    try {
        const filePath = path.join(STORAGE_BASE, req.params.folder, req.params.filename);
        await fs.access(filePath);
        
        const ext = path.extname(req.params.filename).toLowerCase();
        const contentType = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.webp': 'image/webp',
            '.pdf': 'application/pdf',
            '.mp4': 'video/mp4',
            '.webm': 'video/webm'
        }[ext] || 'application/octet-stream';
        
        res.setHeader('Content-Type', contentType);
        res.sendFile(filePath);
        
    } catch (error) {
        res.status(404).json({ success: false, error: 'الملف غير موجود' });
    }
});

// 8.3 تحميل ملف
app.get('/api/download/:folder/:filename', async (req, res) => {
    try {
        const filePath = path.join(STORAGE_BASE, req.params.folder, req.params.filename);
        await fs.access(filePath);
        
        if (req.params.folder === 'books' && db) {
            const booksRef = db.ref('books');
            const snapshot = await booksRef.orderByChild('fileName').equalTo(req.params.filename).once('value');
            
            if (snapshot.exists()) {
                snapshot.forEach((childSnapshot) => {
                    const book = childSnapshot.val();
                    db.ref(`books/${childSnapshot.key}/downloads`).set((book.downloads || 0) + 1);
                });
            }
        }
        
        res.download(filePath);
        
    } catch (error) {
        res.status(404).json({ success: false, error: 'الملف غير موجود' });
    }
});

// ==================== [ 9. دوال مساعدة ] ====================

async function createThumbnail(filePath, folder, fileName) {
    try {
        const options = { width: 200, height: 200, responseType: 'base64' };
        const thumbnail = await imageThumbnail(filePath, options);
        
        const thumbFileName = `thumb_${fileName}`;
        const thumbPath = path.join(STORAGE_BASE, folder, thumbFileName);
        
        await fs.writeFile(thumbPath, Buffer.from(thumbnail, 'base64'));
        
        return `${process.env.BOT_URL || 'http://localhost:' + port}/api/file/${folder}/${thumbFileName}`;
    } catch (error) {
        console.warn('⚠️ تعذر إنشاء صورة مصغرة:', error.message);
        return null;
    }
}

async function extractPDFInfo(filePath) {
    try {
        const pdfBytes = await fs.readFile(filePath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPageCount();
        
        return {
            pages,
            hasText: pages > 0,
            optimized: pdfDoc.getPageCount() <= 50
        };
    } catch (error) {
        return { pages: 0, hasText: false, optimized: false };
    }
}

async function storeFileMetadata(fileInfo) {
    if (!db) throw new Error('Firebase غير مهيء');
    
    const fileId = `file_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const metadata = {
        id: fileId,
        originalName: fileInfo.originalName,
        fileName: fileInfo.fileName,
        folder: fileInfo.folder,
        mimeType: fileInfo.mimeType,
        size: fileInfo.size,
        url: `${process.env.BOT_URL || 'http://localhost:' + port}/api/file/${fileInfo.folder}/${fileInfo.fileName}`,
        downloadUrl: `${process.env.BOT_URL || 'http://localhost:' + port}/api/download/${fileInfo.folder}/${fileInfo.fileName}`,
        thumbnailUrl: fileInfo.thumbnailUrl || null,
        uploadedBy: fileInfo.uploadedBy,
        uploadedAt: Date.now(),
        isPublic: fileInfo.isPublic !== false
    };
    
    await db.ref(`file_storage/${fileId}`).set(metadata);
    return metadata;
}

// ==================== [ 10. الصفحة الرئيسية ] ====================

app.get('/', (req, res) => {
    res.json({
        name: 'Smart Education Platform',
        version: '3.0.0',
        description: 'منصة التعليم الذكي - بث مباشر جماعي + مساعد ذكي + نظام دفع',
        admin: {
            name: ADMIN_NAME,
            account: ADMIN_BANK_ACCOUNT
        },
        pricing: {
            student_weekly: WEEKLY_SUBSCRIPTION,
            teacher_monthly: TEACHER_MONTHLY_FEE,
            free_trial_days: FREE_TRIAL_DAYS,
            free_teacher_months: FREE_TEACHER_MONTHS
        },
        limits: {
            daily_ai_questions: MAX_DAILY_QUESTIONS
        },
        endpoints: {
            // البث المباشر
            create_room: 'POST /api/live/create-room',
            remove_student: 'POST /api/live/remove-student',
            
            // الكتب
            upload_book_admin: 'POST /api/admin/upload-book',
            get_books: 'GET /api/books',
            
            // الدفع
            subscribe: 'POST /api/payment/subscribe',
            verify_payment: 'POST /api/admin/verify-payment',
            
            // المساعد الذكي
            generate_quiz: 'POST /api/ai/generate-quiz',
            grade_quiz: 'POST /api/ai/grade-quiz',
            
            // المستخدم
            user_stats: 'GET /api/user/stats/:userId',
            admin_stats: 'GET /api/admin/stats',
            
            // الملفات
            upload_file: 'POST /api/upload/:folder',
            get_file: 'GET /api/file/:folder/:filename',
            download: 'GET /api/download/:folder/:filename'
        },
        websocket: `ws://${req.headers.host}/socket.io/`,
        note: '🚀 النظام يعتمد على WebSocket للبث المباشر والتواصل الفوري'
    });
});

// ==================== [ 11. تشغيل السيرفر ] ====================

server.listen(port, '0.0.0.0', () => {
    console.log(`🚀 سيرفر التعليم الذكي يعمل على المنفذ ${port}`);
    console.log(`📁 مساحة التخزين: ${path.resolve(STORAGE_BASE)}`);
    console.log(`🔗 الواجهة الرئيسية: http://localhost:${port}`);
    console.log(`🔌 WebSocket: ws://localhost:${port}`);
    console.log(`🏦 حساب الإدمن: ${ADMIN_BANK_ACCOUNT} (${ADMIN_NAME})`);
    console.log('🎥 نظام البث الجماعي جاهز!');
    console.log('🤖 المساعد الذكي محدود بـ 100 سؤال/يوم');
});
