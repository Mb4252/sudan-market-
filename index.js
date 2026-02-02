const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const admin = require('firebase-admin');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const { WebSocketServer } = require('ws');
const http = require('http');
const moment = require('moment');
const { OpenAI } = require('openai');
const socketIO = require('socket.io');
const { Telegraf } = require('telegraf');
const FormData = require('form-data');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const port = process.env.PORT || 10000;

// ==================== [ تهيئة المفاتيح ] ====================
let CONFIG = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
    TELEGRAM_ADMIN_CHAT_ID: process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '',
    TELEGRAM_NOTIFICATIONS_CHAT_ID: process.env.TELEGRAM_NOTIFICATIONS_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '',
    FIREBASE_JSON: process.env.FIREBASE_ADMIN_JSON ? JSON.parse(process.env.FIREBASE_ADMIN_JSON) : {},
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    ADMIN_ID: process.env.ADMIN_ID || '',
    ADMIN_BANK_ACCOUNT: "4426148",
    ADMIN_NAME: "محمد عبدالمعطي علي",
    WEEKLY_SUBSCRIPTION: 7000,
    TEACHER_MONTHLY_FEE: 30000,
    FREE_TRIAL_DAYS: 1,
    FREE_TEACHER_MONTHS: 1,
    MAX_DAILY_QUESTIONS: 100
};

// ==================== [ تهيئة Firebase Admin ] ====================
if (CONFIG.FIREBASE_JSON && Object.keys(CONFIG.FIREBASE_JSON).length > 0) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(CONFIG.FIREBASE_JSON),
            databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
        });
        console.log('✅ Firebase Admin initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize Firebase Admin:', error.message);
    }
} else {
    console.log('⚠️ Firebase Admin JSON not provided - some features will be limited');
}

// ==================== [ تهيئة OpenAI ] ====================
let openaiClient = null;
if (CONFIG.OPENAI_API_KEY) {
    try {
        openaiClient = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });
        console.log('✅ OpenAI initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize OpenAI:', error.message);
    }
} else {
    console.log('⚠️ OpenAI API Key not provided - AI features disabled');
}

// ==================== [ متغيرات التخزين ] ====================
const liveRooms = new Map(); // لتخزين غرف البث النشطة

// ==================== [ إعدادات تخزين الملفات ] ====================
const STORAGE_BASE = './smart_storage';
const FOLDERS = {
    IMAGES: 'images',
    BOOKS: 'books',
    VIDEOS: 'videos',
    AVATARS: 'avatars',
    TEACHER_IDS: 'teacher_ids',
    LIVE_RECORDINGS: 'live_recordings',
    TELEGRAM_UPLOADS: 'telegram_uploads'
};

// إنشاء مجلدات التخزين
(async () => {
    try {
        await fs.mkdir(STORAGE_BASE, { recursive: true });
        for (const folder of Object.values(FOLDERS)) {
            await fs.mkdir(path.join(STORAGE_BASE, folder), { recursive: true });
        }
        console.log('✅ Storage folders created successfully');
    } catch (error) {
        console.error('❌ Error creating storage folders:', error);
    }
})();

// ==================== [ تكوين Multer للرفع ] ====================
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
            cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
        }
    }
});

// ==================== [ دوال مساعدة ] ====================
async function createThumbnail(filePath, folder, fileName) {
    try {
        const thumbFileName = `thumb_${path.parse(fileName).name}.webp`;
        const thumbPath = path.join(STORAGE_BASE, folder, thumbFileName);
        
        await sharp(filePath)
            .resize(200, 200, { fit: 'cover' })
            .webp({ quality: 80 })
            .toFile(thumbPath);
        
        return `${process.env.BOT_URL || 'http://localhost:' + port}/api/file/${folder}/${thumbFileName}`;
    } catch (error) {
        console.warn('⚠️ Failed to create thumbnail:', error.message);
        return null;
    }
}

async function extractPDFInfo(filePath) {
    try {
        const pdfBytes = await fs.readFile(filePath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPageCount();
        return { pages, hasText: pages > 0, optimized: pages <= 50 };
    } catch (error) {
        return { pages: 0, hasText: false, optimized: false };
    }
}

async function storeFileMetadata(fileInfo) {
    const fileId = `file_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const metadata = {
        id: fileId,
        originalName: fileInfo.originalName,
        fileName: fileInfo.fileName,
        folder: fileInfo.folder,
        mimeType: fileInfo.mimeType,
        size: fileInfo.size,
        url: `${process.env.BOT_URL || 'http://localhost:' + port}/api/file/${fileInfo.folder}/${fileInfo.fileName}`,
        uploadedBy: fileInfo.uploadedBy,
        uploadedAt: Date.now(),
        isPublic: fileInfo.isPublic !== false
    };
    
    // حفظ البيانات في Firebase إذا كان مهيئاً
    if (admin.apps.length > 0) {
        try {
            const db = admin.database();
            await db.ref(`file_storage/${fileId}`).set(metadata);
            console.log(`✅ File metadata saved to Firebase: ${fileId}`);
        } catch (error) {
            console.warn('⚠️ Could not save file metadata to Firebase:', error.message);
        }
    }
    
    return metadata;
}

// ==================== [ Socket.IO للبث المباشر ] ====================
io.on('connection', (socket) => {
    console.log('👤 User connected:', socket.id);

    socket.on('join-room', (roomData) => {
        const { roomId, userId, userName, role } = roomData;
        
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userId = userId;
        socket.userName = userName;
        
        // إضافة المستخدم للغرفة
        if (!liveRooms.has(roomId)) {
            liveRooms.set(roomId, {
                id: roomId,
                participants: new Map(),
                teacherId: role === 'teacher' ? userId : null,
                isRecording: false,
                createdAt: Date.now()
            });
        }
        
        const room = liveRooms.get(roomId);
        room.participants.set(userId, { userName, role, socketId: socket.id });
        
        // إعلام الآخرين
        socket.to(roomId).emit('participant-joined', { userId, userName, role });
        
        // إرسال قائمة المشاركين للمستخدم الجديد
        socket.emit('room-info', {
            participants: Array.from(room.participants.entries()).map(([id, data]) => ({
                userId: id,
                userName: data.userName,
                role: data.role
            })),
            isRecording: room.isRecording
        });
        
        console.log(`🚪 ${userName} joined room ${roomId}`);
        
        // تحديث Firebase
        if (admin.apps.length > 0) {
            try {
                const db = admin.database();
                db.ref(`live_rooms/${roomId}/participants/${userId}`).set({
                    userName,
                    role,
                    joinedAt: Date.now()
                });
            } catch (error) {
                console.error('Error updating Firebase:', error);
            }
        }
    });

    socket.on('signal', (data) => {
        // نقل إشارات WebRTC بين المستخدمين
        socket.to(data.target).emit('signal', {
            from: socket.userId,
            signal: data.signal
        });
    });

    socket.on('chat-message', (data) => {
        const { roomId, message } = data;
        const chatMessage = {
            from: socket.userId,
            fromName: socket.userName,
            message,
            timestamp: Date.now()
        };
        
        // إرسال الرسالة للجميع في الغرفة
        io.to(roomId).emit('chat-message', chatMessage);
        
        // حفظ الرسالة في Firebase
        if (admin.apps.length > 0 && roomId) {
            try {
                const db = admin.database();
                const messageId = `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
                db.ref(`live_chats/${roomId}/${messageId}`).set(chatMessage);
            } catch (error) {
                console.error('Error saving chat message:', error);
            }
        }
    });

    socket.on('disconnect', () => {
        if (socket.roomId) {
            const room = liveRooms.get(socket.roomId);
            if (room) {
                room.participants.delete(socket.userId);
                if (room.participants.size === 0) {
                    liveRooms.delete(socket.roomId);
                } else {
                    socket.to(socket.roomId).emit('participant-left', {
                        userId: socket.userId
                    });
                }
            }
        }
        console.log('👋 User disconnected:', socket.id);
    });
});

// ==================== [ Middleware ] ====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== [ نقاط النهاية الرئيسية ] ====================

// 1. نقطة اختبار النظام
app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: '✅ Server is running!', 
        time: new Date().toISOString(),
        server: 'Smart Education Platform',
        version: '2.0.0',
        features: ['Upload', 'Live Streaming', 'AI Assistant', 'Library', 'Payments'],
        firebase: admin.apps.length > 0 ? 'Connected' : 'Not Connected',
        openai: openaiClient ? 'Connected' : 'Not Connected'
    });
});

// 2. رفع الملفات مع إرسال إلى Telegram
app.post('/api/upload/:folder?', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        const folder = req.params.folder || FOLDERS.IMAGES;
        const uploadedBy = req.body.userId || 'anonymous';
        const filePath = req.file.path;
        
        // إرسال الملف إلى Telegram للتخزين
        try {
            const botToken = CONFIG.TELEGRAM_BOT_TOKEN;
            const chatId = CONFIG.TELEGRAM_ADMIN_CHAT_ID || CONFIG.TELEGRAM_CHAT_ID;

            if (botToken && chatId) {
                const form = new FormData();
                form.append('chat_id', chatId);
                form.append('document', fs.createReadStream(filePath));
                form.append('caption', `📂 New file uploaded:\n👤 By: ${uploadedBy}\n📁 Folder: ${folder}\n📄 Name: ${req.file.originalname}`);

                await axios.post(`https://api.telegram.org/bot${botToken}/sendDocument`, form, {
                    headers: form.getHeaders()
                });
                console.log('✅ File sent to Telegram successfully');
            }
        } catch (tgError) {
            console.warn('⚠️ Failed to send file to Telegram:', tgError.message);
        }

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
            message: 'File uploaded successfully and saved to Telegram',
            fileId: storedMetadata.id,
            metadata: storedMetadata
        });
        
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. رفع الكتب (للإدمن)
app.post('/api/admin/upload-book', upload.single('book'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No book file uploaded' });
        }

        const adminId = req.body.adminId;
        if (!adminId || adminId !== CONFIG.ADMIN_ID) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }

        const { title, author, grade, subject, description, year, pages } = req.body;
        
        if (!title || !author || !grade || !subject) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        const bookData = {
            title,
            author,
            grade,
            subject,
            description: description || '',
            year: year || new Date().getFullYear(),
            pages: pages || 0,
            fileName: req.file.filename,
            fileSize: req.file.size,
            uploadedBy: adminId,
            uploadedAt: Date.now(),
            downloads: 0,
            downloadUrl: `${process.env.BOT_URL || 'http://localhost:' + port}/api/file/books/${req.file.filename}`
        };

        // إرسال إلى Telegram
        try {
            const botToken = CONFIG.TELEGRAM_BOT_TOKEN;
            const chatId = CONFIG.TELEGRAM_NOTIFICATIONS_CHAT_ID || CONFIG.TELEGRAM_CHAT_ID;

            if (botToken && chatId) {
                const form = new FormData();
                form.append('chat_id', chatId);
                form.append('document', fs.createReadStream(req.file.path));
                form.append('caption', `📚 New book uploaded!\n\n📖 Title: ${title}\n✍️ Author: ${author}\n🏫 Grade: ${grade}\n📚 Subject: ${subject}\n📅 Year: ${bookData.year}\n📄 Pages: ${bookData.pages}`);

                await axios.post(`https://api.telegram.org/bot${botToken}/sendDocument`, form, {
                    headers: form.getHeaders()
                });
            }
        } catch (tgError) {
            console.warn('⚠️ Failed to send book to Telegram:', tgError.message);
        }

        // حفظ في Firebase
        if (admin.apps.length > 0) {
            try {
                const db = admin.database();
                const bookId = `book_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
                await db.ref(`books/${bookId}`).set(bookData);
                bookData.id = bookId;
                
                res.json({
                    success: true,
                    message: 'Book uploaded and saved successfully',
                    bookId,
                    book: bookData,
                    telegram: { sent: true }
                });
            } catch (firebaseError) {
                res.status(500).json({ success: false, error: 'Failed to save to database' });
            }
        } else {
            res.json({
                success: true,
                message: 'Book uploaded but not saved to database (Firebase not connected)',
                book: bookData
            });
        }

    } catch (error) {
        console.error('Error uploading book:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 4. جلب الكتب من Firebase
app.get('/api/books', async (req, res) => {
    try {
        if (!admin.apps.length) {
            return res.json({
                success: true,
                books: [
                    { id: '1', title: 'الرياضيات للصف الأول', author: 'وزارة التربية', grade: 'الأول الابتدائي', subject: 'الرياضيات' },
                    { id: '2', title: 'العلوم للصف الثاني', author: 'وزارة التربية', grade: 'الثاني الابتدائي', subject: 'العلوم' }
                ],
                message: 'Using sample data (Firebase not connected)'
            });
        }
        
        const db = admin.database();
        const snapshot = await db.ref('books').once('value');
        const books = snapshot.val() || {};
        
        const booksArray = Object.entries(books).map(([id, book]) => ({
            id,
            title: book.title || 'بدون عنوان',
            author: book.author || 'مجهول',
            grade: book.grade || 'غير محدد',
            subject: book.subject || 'عام',
            description: book.description || '',
            year: book.year || 'غير محدد',
            pages: book.pages || 0,
            fileName: book.fileName,
            downloadUrl: book.downloadUrl || `${process.env.BOT_URL || 'http://localhost:' + port}/api/file/books/${book.fileName}`,
            downloads: book.downloads || 0
        }));
        
        res.json({ success: true, books: booksArray });
        
    } catch (error) {
        console.error('Error fetching books:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch books' });
    }
});

// 5. نظام الذكاء الاصطناعي
app.post('/api/ai/generate-quiz', express.json(), async (req, res) => {
    try {
        if (!openaiClient) {
            return res.status(503).json({ 
                success: false, 
                error: 'AI service not available' 
            });
        }

        const { subject, grade, questionCount = 5, questionTypes = ['mcq'] } = req.body;
        
        if (!subject || !grade) {
            return res.status(400).json({ success: false, error: 'Subject and grade are required' });
        }

        const prompt = `
قم بإنشاء اختبار تعليمي باللغة العربية حسب المواصفات التالية:
- المادة الدراسية: ${subject}
- الصف الدراسي: ${grade}
- عدد الأسئلة: ${questionCount}
- أنواع الأسئلة: ${questionTypes.join(', ')}

يرجى إخراج النتيجة بتنسيق JSON صحيح تماماً بالشكل التالي:
{
    "quizTitle": "عنوان الاختبار المناسب",
    "subject": "${subject}",
    "grade": "${grade}",
    "questions": [
        {
            "question": "نص السؤال الأول",
            "type": "mcq",
            "options": ["الخيار الأول", "الخيار الثاني", "الخيار الثالث", "الخيار الرابع"],
            "correctAnswer": 0,
            "explanation": "شرح الإجابة الصحيحة"
        }
    ]
}

تأكد من أن الأسئلة مناسبة للمستوى الدراسي وأن الخيارات واضحة.
        `;

        const completion = await openaiClient.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            max_tokens: 2000
        });

        const quizData = JSON.parse(completion.choices[0].message.content);
        
        // حفظ الاختبار في Firebase
        if (admin.apps.length > 0) {
            try {
                const db = admin.database();
                const quizId = `quiz_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
                await db.ref(`quizzes/${quizId}`).set({
                    ...quizData,
                    createdAt: Date.now(),
                    questionCount,
                    questionTypes
                });
                quizData.quizId = quizId;
            } catch (error) {
                console.warn('Could not save quiz to Firebase:', error.message);
            }
        }

        res.json({ 
            success: true, 
            quiz: quizData,
            message: 'Quiz generated successfully' 
        });
        
    } catch (error) {
        console.error('Error generating quiz:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to generate quiz',
            details: error.message 
        });
    }
});

// 6. إنشاء غرفة بث مباشر
app.post('/api/live/create-room', express.json(), async (req, res) => {
    try {
        const { teacherId, teacherName, title, description, maxParticipants = 20 } = req.body;
        
        if (!teacherId || !teacherName || !title) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        const roomId = `room_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const roomData = {
            id: roomId,
            teacherId,
            teacherName,
            title,
            description: description || '',
            maxParticipants,
            status: 'active',
            createdAt: Date.now(),
            participantsCount: 0
        };
        
        // حفظ في Firebase
        if (admin.apps.length > 0) {
            try {
                const db = admin.database();
                await db.ref(`live_rooms/${roomId}`).set(roomData);
            } catch (error) {
                console.error('Error saving room to Firebase:', error);
            }
        }
        
        // إرسال إشعار إلى Telegram
        try {
            const botToken = CONFIG.TELEGRAM_BOT_TOKEN;
            const chatId = CONFIG.TELEGRAM_NOTIFICATIONS_CHAT_ID || CONFIG.TELEGRAM_CHAT_ID;
            
            if (botToken && chatId) {
                await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    chat_id: chatId,
                    text: `🎥 New Live Room Created!\n\n👨‍🏫 Teacher: ${teacherName}\n📚 Title: ${title}\n🔗 Room ID: ${roomId}\n👥 Max Participants: ${maxParticipants}`,
                    parse_mode: 'HTML'
                });
            }
        } catch (tgError) {
            console.warn('Could not send Telegram notification:', tgError.message);
        }
        
        res.json({ 
            success: true, 
            roomId,
            room: roomData,
            joinUrl: `${process.env.BOT_URL || 'http://localhost:' + port}/live/${roomId}`
        });
        
    } catch (error) {
        console.error('Error creating room:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 7. نظام الدفع والاشتراكات
app.post('/api/payment/subscribe', express.json(), async (req, res) => {
    try {
        const { userId, userName, userEmail, type, bankReceipt, teacherId } = req.body;
        
        if (!userId || !userName || !type || !bankReceipt) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        const amount = type === 'weekly' ? CONFIG.WEEKLY_SUBSCRIPTION : CONFIG.TEACHER_MONTHLY_FEE;
        const paymentId = `payment_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        
        const paymentData = {
            id: paymentId,
            userId,
            userName,
            userEmail: userEmail || '',
            type,
            bankReceipt,
            teacherId: teacherId || null,
            amount,
            status: 'pending_verification',
            createdAt: Date.now(),
            verifiedBy: null,
            verifiedAt: null
        };
        
        // حفظ في Firebase
        if (admin.apps.length > 0) {
            try {
                const db = admin.database();
                await db.ref(`payments/${paymentId}`).set(paymentData);
                
                // تحديث حالة المستخدم
                await db.ref(`users/${userId}/subscriptionStatus`).set({
                    lastPaymentId: paymentId,
                    lastPaymentDate: Date.now(),
                    status: 'pending'
                });
            } catch (error) {
                console.error('Error saving payment to Firebase:', error);
            }
        }
        
        // إرسال إشعار للإدمن على Telegram
        try {
            const botToken = CONFIG.TELEGRAM_BOT_TOKEN;
            const chatId = CONFIG.TELEGRAM_ADMIN_CHAT_ID || CONFIG.TELEGRAM_CHAT_ID;
            
            if (botToken && chatId) {
                const message = `💰 New Subscription Request!\n\n👤 User: ${userName}\n📧 Email: ${userEmail || 'N/A'}\n🎯 Type: ${type}\n💳 Amount: ${amount.toLocaleString()} SDG\n📋 Receipt: ${bankReceipt}\n🆔 User ID: ${userId}\n🔗 Payment ID: ${paymentId}`;
                
                await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    chat_id: chatId,
                    text: message,
                    parse_mode: 'HTML'
                });
            }
        } catch (tgError) {
            console.warn('Could not send Telegram notification:', tgError.message);
        }
        
        res.json({ 
            success: true, 
            paymentId, 
            message: 'Subscription request submitted successfully',
            data: {
                bankAccount: CONFIG.ADMIN_BANK_ACCOUNT,
                accountName: CONFIG.ADMIN_NAME,
                amount,
                paymentId
            }
        });
        
    } catch (error) {
        console.error('Error processing payment:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 8. تنزيل الملفات
app.get('/api/file/:folder/:filename', async (req, res) => {
    try {
        const { folder, filename } = req.params;
        const filePath = path.join(STORAGE_BASE, folder, filename);
        
        await fs.access(filePath);
        
        const ext = path.extname(filename).toLowerCase();
        const contentType = {
            '.pdf': 'application/pdf',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.webp': 'image/webp',
            '.mp4': 'video/mp4',
            '.webm': 'video/webm'
        }[ext] || 'application/octet-stream';
        
        // تحديث عدد التحميلات إذا كان كتاباً
        if (folder === 'books' && admin.apps.length > 0) {
            try {
                const db = admin.database();
                const booksRef = db.ref('books');
                const snapshot = await booksRef.orderByChild('fileName').equalTo(filename).once('value');
                if (snapshot.exists()) {
                    const bookKey = Object.keys(snapshot.val())[0];
                    const currentDownloads = snapshot.val()[bookKey].downloads || 0;
                    await db.ref(`books/${bookKey}/downloads`).set(currentDownloads + 1);
                }
            } catch (error) {
                console.warn('Could not update download count:', error.message);
            }
        }
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.sendFile(filePath);
        
    } catch (error) {
        console.error('Error serving file:', error);
        res.status(404).json({ success: false, error: 'File not found' });
    }
});

// 9. جلب غرف البث النشطة
app.get('/api/live/rooms', async (req, res) => {
    try {
        let rooms = [];
        
        if (admin.apps.length > 0) {
            const db = admin.database();
            const snapshot = await db.ref('live_rooms').orderByChild('status').equalTo('active').once('value');
            const firebaseRooms = snapshot.val() || {};
            
            rooms = Object.entries(firebaseRooms).map(([id, room]) => ({
                id,
                teacherId: room.teacherId,
                teacherName: room.teacherName,
                title: room.title,
                description: room.description,
                maxParticipants: room.maxParticipants,
                participantsCount: room.participantsCount || 0,
                createdAt: room.createdAt,
                isLive: liveRooms.has(id)
            }));
        }
        
        // إضافة الغرف النشطة حالياً في الذاكرة
        for (const [roomId, room] of liveRooms) {
            const existing = rooms.find(r => r.id === roomId);
            if (!existing) {
                rooms.push({
                    id: roomId,
                    teacherId: room.teacherId,
                    teacherName: 'Unknown',
                    title: 'Live Room',
                    description: '',
                    maxParticipants: 50,
                    participantsCount: room.participants.size,
                    createdAt: room.createdAt,
                    isLive: true
                });
            } else {
                existing.participantsCount = room.participants.size;
                existing.isLive = true;
            }
        }
        
        res.json({ success: true, rooms });
        
    } catch (error) {
        console.error('Error fetching rooms:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch rooms' });
    }
});

// 10. نقطة نهاية للصحة
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        firebase: admin.apps.length > 0 ? 'connected' : 'disconnected',
        openai: openaiClient ? 'connected' : 'disconnected',
        telegram: CONFIG.TELEGRAM_BOT_TOKEN ? 'configured' : 'not configured'
    });
});

// 11. نقطة بديلة للواجهة
app.get('/api/hello', (req, res) => {
    res.json({ 
        success: true, 
        message: 'مرحباً! النظام جاهز للعمل',
        version: '2.0.0',
        endpoints: [
            '/api/test',
            '/api/books',
            '/api/upload/:folder',
            '/api/ai/generate-quiz',
            '/api/live/create-room',
            '/api/payment/subscribe',
            '/health'
        ]
    });
});

// ==================== [ تشغيل السيرفر ] ====================
server.listen(port, '0.0.0.0', () => {
    console.log(`
    🚀 Smart Education Platform Server
    🔗 Running on port: ${port}
    📡 Local: http://localhost:${port}
    🌐 Public: ${process.env.BOT_URL || 'Set BOT_URL in environment'}
    
    ✅ Features Activated:
    ${admin.apps.length > 0 ? '    • Firebase Database ✓' : '    • Firebase Database ✗'}
    ${openaiClient ? '    • OpenAI AI Assistant ✓' : '    • OpenAI AI Assistant ✗'}
    ${CONFIG.TELEGRAM_BOT_TOKEN ? '    • Telegram Integration ✓' : '    • Telegram Integration ✗'}
    ${'    • File Upload System ✓'}
    ${'    • Live Streaming ✓'}
    ${'    • Payment System ✓'}
    ${'    • Library System ✓'}
    
    📊 Health Check: http://localhost:${port}/health
    🎯 API Test: http://localhost:${port}/api/test
    `);
});

// ==================== [ معالجة الإغلاق ] ====================
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('🔥 Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.warn('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});
