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

const port = process.env.PORT || 3001;

// ==================== [ 0. تهيئة المفاتيح من Hugging Face ] ====================
let CONFIG = {
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_CHAT_ID: '',
    TELEGRAM_ADMIN_CHAT_ID: '',
    TELEGRAM_NOTIFICATIONS_CHAT_ID: '',
    FIREBASE_JSON: {},
    OPENAI_API_KEY: '',
    ADMIN_ID: '',
    ADMIN_BANK_ACCOUNT: "4426148",
    ADMIN_NAME: "محمد عبدالمعطي علي",
    WEEKLY_SUBSCRIPTION: 7000,
    TEACHER_MONTHLY_FEE: 30000,
    FREE_TRIAL_DAYS: 1,
    FREE_TEACHER_MONTHS: 1,
    MAX_DAILY_QUESTIONS: 100
};

// عنوان Hugging Face حيث تم تخزين المفاتيح
const HUGGINGFACE_CONFIG_URL = process.env.HUGGINGFACE_CONFIG_URL || 'https://huggingface.co/datasets/your-username/your-repo/raw/main/config.json';

async function loadConfigFromHuggingFace() {
    try {
        console.log('🔄 جاري تحميل الإعدادات من Hugging Face...');
        const response = await axios.get(HUGGINGFACE_CONFIG_URL, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Telegram-File-Bot/1.0'
            },
            timeout: 10000
        });
        
        if (response.data) {
            CONFIG = { ...CONFIG, ...response.data };
            
            // التحقق من المفاتيح الأساسية
            const requiredKeys = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'FIREBASE_JSON'];
            const missingKeys = requiredKeys.filter(key => !CONFIG[key] || (typeof CONFIG[key] === 'object' && Object.keys(CONFIG[key]).length === 0));
            
            if (missingKeys.length > 0) {
                console.warn(`⚠️ مفاتيح مفقودة في الإعدادات: ${missingKeys.join(', ')}`);
            } else {
                console.log('✅ تم تحميل الإعدادات بنجاح من Hugging Face');
            }
            
            return true;
        }
        
        throw new Error('لا توجد بيانات في الرد');
    } catch (error) {
        console.error('❌ فشل في تحميل الإعدادات من Hugging Face:', error.message);
        
        // محاولة استخدام متغيرات البيئة كبديل
        console.log('🔄 استخدام متغيرات البيئة كبديل...');
        CONFIG = {
            ...CONFIG,
            TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
            TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
            TELEGRAM_ADMIN_CHAT_ID: process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '',
            TELEGRAM_NOTIFICATIONS_CHAT_ID: process.env.TELEGRAM_NOTIFICATIONS_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '',
            FIREBASE_JSON: process.env.FIREBASE_ADMIN_JSON ? JSON.parse(process.env.FIREBASE_ADMIN_JSON) : {},
            OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
            ADMIN_ID: process.env.ADMIN_ID || ''
        };
        
        return false;
    }
}

// ==================== [ 1. إعدادات أساسية ] ====================
let telegramBot = null;
let telegramInitialized = false;

async function initializeTelegramBot() {
    try {
        if (!CONFIG.TELEGRAM_BOT_TOKEN) {
            throw new Error('توكن البوت غير متوفر');
        }
        
        telegramBot = new Telegraf(CONFIG.TELEGRAM_BOT_TOKEN);
        telegramInitialized = true;
        
        // أمر البدء
        telegramBot.start((ctx) => {
            ctx.reply('🎉 مرحباً! أنا بوت منصة التعليم الذكي.\n\n' +
                     'يمكنني:\n' +
                     '🎥 البث المباشر الجماعي\n' +
                     '📚 رفع الكتب والمواد التعليمية\n' +
                     '🤖 توليد اختبارات ذكية\n' +
                     '💳 نظام الاشتراكات والدفع\n\n' +
                     '📱 للإدارة: استخدم الواجهة البرمجية API');
        });
        
        // أمر المساعدة
        telegramBot.help((ctx) => {
            ctx.reply('📋 نظام التعليم الذكي:\n\n' +
                     '🎥 /live - معلومات البث المباشر\n' +
                     '📚 /books - المكتبة التعليمية\n' +
                     '🤖 /quiz - الاختبارات الذكية\n' +
                     '💳 /subscribe - نظام الاشتراكات\n' +
                     '👨‍🏫 /teacher - قسم المعلمين\n\n' +
                     '📞 للإدارة: استخدم الواجهة البرمجية');
        });
        
        // أمر البث المباشر
        telegramBot.command('live', (ctx) => {
            ctx.reply('🎥 نظام البث المباشر:\n\n' +
                     '• إنشاء غرف بث للمعلمين\n' +
                     '• دخول الطلاب للبث\n' +
                     '• تسجيل البث وتخزينه\n' +
                     '• نظام دفع للطلاب\n\n' +
                     '🔗 رابط النظام: ' + (process.env.BOT_URL || `http://localhost:${port}`));
        });
        
        // أمر الكتب
        telegramBot.command('books', (ctx) => {
            ctx.reply('📚 المكتبة التعليمية:\n\n' +
                     '• آلاف الكتب والمراجع\n' +
                     '• جميع المراحل الدراسية\n' +
                     '• مواد متنوعة\n' +
                     '• تحميل مجاني للمشتركين\n\n' +
                     '🔗 رابط المكتبة: ' + (process.env.BOT_URL || `http://localhost:${port}`) + '/api/books');
        });
        
        // بدء البوت
        await telegramBot.launch();
        console.log('🤖 Telegram Bot مهيء وجاهز');
        
    } catch (error) {
        console.error('❌ خطأ في تهيئة Telegram Bot:', error.message);
        telegramInitialized = false;
    }
}

// ==================== [ 2. إعدادات تخزين الملفات ] ====================
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

const initializeFirebase = async () => {
    try {
        if (admin.apps.length === 0) {
            const serviceAccount = CONFIG.FIREBASE_JSON || JSON.parse(process.env.FIREBASE_ADMIN_JSON || '{}');
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

const db = firebaseInitialized ? admin.database() : null;

// ==================== [ 4. إعداد OpenAI ] ====================
const openai = new OpenAI({
    apiKey: CONFIG.OPENAI_API_KEY || process.env.OPENAI_API_KEY || 'your-openai-api-key',
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
        
        // إرسال إشعار إلى Telegram
        await sendTelegramNotification(`🎥 انضمام جديد للبث المباشر\n👤 المستخدم: ${userName}\n🎫 الرول: ${userRole}\n📊 عدد المشاركين: ${room.participants.size}\n🆔 الغرفة: ${roomId}`);
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
                
                // إرسال إشعار إلى Telegram
                await sendTelegramNotification(`🚫 تم إزالة طالب من البث\n👤 الطالب: ${participant.name}\n🎫 الغرفة: ${roomId}\n📝 السبب: ${reason || 'غير محدد'}`);
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
        
        // إرسال إشعار إلى Telegram
        sendTelegramNotification(`🎥 حالة تسجيل البث\n🆔 الغرفة: ${roomId}\n📼 الإجراء: ${action === 'start' ? 'بدء التسجيل' : 'إيقاف التسجيل'}`);
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

// ==================== [ 7. دوال Telegram ] ====================
async function sendFileToTelegram(filePath, originalName, mimeType, caption = '') {
    try {
        if (!telegramInitialized || !telegramBot) {
            throw new Error('Telegram Bot غير مهيء');
        }
        
        const fileStream = await fs.readFile(filePath);
        const stats = await fs.stat(filePath);
        const fileSize = stats.size;
        
        let message = null;
        const chatId = CONFIG.TELEGRAM_CHAT_ID;
        
        // إرسال حسب نوع الملف
        if (mimeType.startsWith('image/')) {
            message = await telegramBot.telegram.sendPhoto(
                chatId,
                { source: fileStream },
                { caption: caption || `📸 ${originalName}\nالحجم: ${formatFileSize(fileSize)}` }
            );
        } 
        else if (mimeType.startsWith('video/')) {
            message = await telegramBot.telegram.sendVideo(
                chatId,
                { source: fileStream },
                { caption: caption || `🎥 ${originalName}\nالحجم: ${formatFileSize(fileSize)}` }
            );
        }
        else if (mimeType === 'application/pdf') {
            message = await telegramBot.telegram.sendDocument(
                chatId,
                { source: fileStream, filename: originalName },
                { caption: caption || `📚 ${originalName}\nالحجم: ${formatFileSize(fileSize)}` }
            );
        }
        else {
            message = await telegramBot.telegram.sendDocument(
                chatId,
                { source: fileStream, filename: originalName },
                { caption: caption || `📄 ${originalName}\nالحجم: ${formatFileSize(fileSize)}\nالنوع: ${mimeType}` }
            );
        }
        
        console.log(`✅ تم إرسال الملف إلى Telegram: ${originalName}`);
        return message;
        
    } catch (error) {
        console.error('❌ خطأ في إرسال الملف إلى Telegram:', error.message);
        
        // محاولة طريقة بديلة باستخدام axios
        try {
            console.log('🔄 جرب طريقة إرسال بديلة...');
            return await sendFileViaTelegramAPI(filePath, originalName, caption);
        } catch (altError) {
            console.error('❌ فشل الطريقة البديلة:', altError.message);
            throw error;
        }
    }
}

async function sendFileViaTelegramAPI(filePath, originalName, caption = '') {
    const formData = new FormData();
    formData.append('chat_id', CONFIG.TELEGRAM_CHAT_ID);
    formData.append('document', await fs.readFile(filePath), originalName);
    formData.append('caption', caption || `📄 ${originalName}`);
    
    const response = await axios.post(
        `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendDocument`,
        formData,
        {
            headers: formData.getHeaders()
        }
    );
    
    if (response.data.ok) {
        return response.data.result;
    } else {
        throw new Error(response.data.description || 'فشل في إرسال الملف');
    }
}

async function sendTelegramNotification(message) {
    try {
        if (!telegramInitialized || !telegramBot) return;
        
        await telegramBot.telegram.sendMessage(
            CONFIG.TELEGRAM_NOTIFICATIONS_CHAT_ID || CONFIG.TELEGRAM_CHAT_ID,
            message
        );
    } catch (error) {
        console.error('❌ خطأ في إرسال إشعار Telegram:', error.message);
    }
}

async function saveTelegramFileInfo(fileInfo, telegramMessage) {
    try {
        if (!firebaseInitialized || !db) return null;
        
        const fileId = `telegram_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const chatId = telegramMessage.chat.id;
        const messageId = telegramMessage.message_id;
        
        const telegramData = {
            id: fileId,
            originalName: fileInfo.originalName,
            fileName: fileInfo.fileName,
            mimeType: fileInfo.mimeType,
            size: fileInfo.size,
            telegramInfo: {
                messageId: messageId,
                chatId: chatId,
                date: telegramMessage.date,
                fileId: telegramMessage.document?.file_id || 
                        telegramMessage.photo?.[0]?.file_id || 
                        telegramMessage.video?.file_id || 
                        telegramMessage.audio?.file_id,
                type: telegramMessage.document ? 'document' : 
                      telegramMessage.photo ? 'photo' : 
                      telegramMessage.video ? 'video' : 
                      telegramMessage.audio ? 'audio' : 'unknown'
            },
            telegramLink: `https://t.me/c/${String(chatId).slice(4)}/${messageId}`,
            directLink: `${process.env.BOT_URL || 'http://localhost:' + port}/api/file/${fileInfo.folder}/${fileInfo.fileName}`,
            uploadedAt: Date.now(),
            uploadedBy: fileInfo.uploadedBy || 'system'
        };
        
        await db.ref(`telegram_files/${fileId}`).set(telegramData);
        console.log(`💾 تم حفظ معلومات Telegram للملف: ${fileId}`);
        
        return telegramData;
    } catch (error) {
        console.error('❌ خطأ في حفظ معلومات Telegram:', error.message);
        return null;
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 ب';
    const k = 1024;
    const sizes = ['ب', 'ك.ب', 'م.ب', 'ج.ب'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ==================== [ 8. المسارات الرئيسية ] ====================

// 8.1 رفع كتاب (للإدمن فقط) + إرسال إلى Telegram
app.post('/api/admin/upload-book', upload.single('book'), async (req, res) => {
    try {
        const { adminId } = req.body;
        
        if (!adminId || adminId !== CONFIG.ADMIN_ID) {
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
        
        // إرسال الكتاب إلى Telegram
        let telegramMessage = null;
        let telegramData = null;
        try {
            console.log(`📤 جاري إرسال الكتاب إلى Telegram: ${req.file.originalname}`);
            telegramMessage = await sendFileToTelegram(
                req.file.path,
                req.file.originalname,
                req.file.mimetype,
                `📚 ${bookInfo.title}\n👨‍🏫 المؤلف: ${bookInfo.author}\n📖 الصف: ${bookInfo.grade}\n📚 المادة: ${bookInfo.subject}`
            );
            
            // حفظ معلومات Telegram
            telegramData = await saveTelegramFileInfo(
                {
                    originalName: req.file.originalname,
                    fileName: req.file.filename,
                    mimeType: req.file.mimetype,
                    size: req.file.size,
                    folder: 'books',
                    uploadedBy: 'admin'
                },
                telegramMessage
            );
            
            // إضافة رابط Telegram إلى بيانات الكتاب
            if (telegramData) {
                bookMetadata.telegramLink = telegramData.telegramLink;
                bookMetadata.telegramMessageId = telegramMessage.message_id;
            }
        } catch (telegramError) {
            console.error('⚠️ فشل إرسال الكتاب إلى Telegram:', telegramError.message);
        }
        
        if (db) {
            await db.ref(`books/${bookId}`).set(bookMetadata);
        }
        
        // إرسال إشعار إلى Telegram عن كتاب جديد
        await sendTelegramNotification(
            `📚 كتاب جديد تم رفعه\n` +
            `📖 العنوان: ${bookInfo.title}\n` +
            `👨‍🏫 المؤلف: ${bookInfo.author}\n` +
            `📊 الصف: ${bookInfo.grade}\n` +
            `📚 المادة: ${bookInfo.subject}\n` +
            `📄 الصفحات: ${bookInfo.pages}\n` +
            `🔗 رابط التحميل: ${bookMetadata.downloadUrl}`
        );
        
        res.json({
            success: true,
            message: 'تم رفع الكتاب بنجاح',
            bookId: bookId,
            metadata: bookMetadata,
            telegram: telegramData ? {
                sent: true,
                messageId: telegramMessage.message_id,
                link: telegramData.telegramLink
            } : {
                sent: false,
                error: 'فشل إرسال إلى Telegram'
            }
        });
        
    } catch (error) {
        console.error('خطأ في رفع الكتاب:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 8.2 الحصول على قائمة الكتب
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

// 8.3 نظام الدفع والاشتراكات
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
        const amount = type === 'weekly' ? CONFIG.WEEKLY_SUBSCRIPTION : 
                      type === 'teacher_monthly' ? CONFIG.TEACHER_MONTHLY_FEE : 0;
        
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
            adminAccount: CONFIG.ADMIN_BANK_ACCOUNT,
            adminName: CONFIG.ADMIN_NAME,
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
        
        // إرسال إشعار إلى Telegram
        await sendTelegramNotification(
            `💳 طلب اشتراك جديد\n` +
            `👤 المستخدم: ${userName}\n` +
            `📧 البريد: ${userEmail || 'غير محدد'}\n` +
            `💰 النوع: ${type === 'weekly' ? 'أسبوعي' : type === 'monthly' ? 'شهري' : 'معلم شهري'}\n` +
            `💵 المبلغ: ${amount}\n` +
            `🆔 رقم الطلب: ${paymentId}`
        );
        
        res.json({
            success: true,
            message: 'تم إرسال طلب الاشتراك. سيتم المراجعة من قبل الإدمن.',
            paymentId: paymentId,
            adminAccount: CONFIG.ADMIN_BANK_ACCOUNT,
            adminName: CONFIG.ADMIN_NAME,
            amount: amount
        });
        
    } catch (error) {
        console.error('خطأ في طلب الاشتراك:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 8.4 تأكيد الدفع (للإدمن فقط)
app.post('/api/admin/verify-payment', async (req, res) => {
    try {
        const { adminId, paymentId, userId, action } = req.body;
        
        if (!adminId || adminId !== CONFIG.ADMIN_ID) {
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
        if (db) {
            await db.ref(`user_notifications/${userId}`).push({
                type: 'payment_verification',
                paymentId: paymentId,
                status: action === 'approve' ? 'approved' : 'rejected',
                message: action === 'approve' ? 
                    'تم تأكيد دفعتك بنجاح. يمكنك الآن استخدام الخدمات.' :
                    'تم رفض دفعتك. يرجى التحقق من إيصال التحويل.',
                timestamp: Date.now()
            });
        }
        
        // إرسال إشعار إلى Telegram
        await sendTelegramNotification(
            `✅ ${action === 'approve' ? 'تم تأكيد دفعة' : 'تم رفض دفعة'}\n` +
            `👤 المستخدم: ${payment.userName}\n` +
            `💰 المبلغ: ${payment.amount}\n` +
            `📋 النوع: ${payment.type}\n` +
            `🆔 رقم الدفعة: ${paymentId}\n` +
            `👨‍💼 تمت العملية بواسطة: ${adminId}`
        );
        
        res.json({
            success: true,
            message: `تم ${action === 'approve' ? 'تأكيد' : 'رفض'} الدفع بنجاح`
        });
        
    } catch (error) {
        console.error('خطأ في تأكيد الدفع:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 8.5 المساعد الذكي - إنشاء اختبار
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
            
            if (todayUsage.count >= CONFIG.MAX_DAILY_QUESTIONS) {
                return res.status(429).json({
                    success: false,
                    error: `لقد استخدمت الحد اليومي (${CONFIG.MAX_DAILY_QUESTIONS} سؤال). يرجى المحاولة غداً.`
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
        
        // إرسال إشعار إلى Telegram
        await sendTelegramNotification(
            `🤖 اختبار جديد تم إنشاؤه\n` +
            `📝 العنوان: ${quizData.quizTitle}\n` +
            `👤 المستخدم: ${userId}\n` +
            `❓ عدد الأسئلة: ${questionCount}\n` +
            `🆔 معرف الاختبار: ${quizId}`
        );
        
        res.json({
            success: true,
            quizId: quizId,
            quiz: quizData,
            dailyUsage: {
                used: (todayUsage.count || 0) + questionCount,
                remaining: CONFIG.MAX_DAILY_QUESTIONS - ((todayUsage.count || 0) + questionCount)
            }
        });
        
    } catch (error) {
        console.error('خطأ في توليد الاختبار:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 8.6 تصحيح الاختبار
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
        
        // إرسال إشعار إلى Telegram
        await sendTelegramNotification(
            `📊 نتيجة اختبار\n` +
            `👤 المستخدم: ${userId}\n` +
            `📝 الاختبار: ${quiz.title}\n` +
            `🏆 النتيجة: ${score}/${totalQuestions}\n` +
            `📈 النسبة: ${percentage}%\n` +
            `🆔 معرف النتيجة: ${resultId}`
        );
        
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

// 8.7 الحصول على إحصائيات المستخدم
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
                dailyRemaining: CONFIG.MAX_DAILY_QUESTIONS - (dailyUsage.count || 0),
                limit: CONFIG.MAX_DAILY_QUESTIONS
            },
            subscription: activeSubscription,
            nextPaymentDue: nextPaymentDue,
            adminBank: {
                account: CONFIG.ADMIN_BANK_ACCOUNT,
                name: CONFIG.ADMIN_NAME
            }
        });
        
    } catch (error) {
        console.error('خطأ في الحصول على الإحصائيات:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 8.8 إدارة الغرف الحية (للأستاذ)
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
                        amount: CONFIG.TEACHER_MONTHLY_FEE,
                        type: 'teacher_monthly',
                        adminAccount: CONFIG.ADMIN_BANK_ACCOUNT,
                        adminName: CONFIG.ADMIN_NAME
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
        
        // إرسال إشعار إلى Telegram
        await sendTelegramNotification(
            `🎥 غرفة بث مباشر جديدة\n` +
            `👨‍🏫 المعلم: ${teacherName}\n` +
            `📝 العنوان: ${title}\n` +
            `📋 الوصف: ${description || 'بدون وصف'}\n` +
            `👥 الحد الأقصى: ${maxParticipants}\n` +
            `🆔 معرف الغرفة: ${roomId}\n` +
            `🔗 رابط الانضمام: ${process.env.BOT_URL || `http://localhost:${port}`}/live/${roomId}`
        );
        
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

// 8.9 إلغاء طالب من البث
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
        
        // إرسال إشعار إلى Telegram
        await sendTelegramNotification(
            `🚫 طالب مطرود من البث\n` +
            `🎥 الغرفة: ${roomId}\n` +
            `👨‍🏫 المعلم: ${teacherId}\n` +
            `👤 الطالب: ${studentId}\n` +
            `📝 السبب: ${reason || 'غير محدد'}`
        );
        
        res.json({
            success: true,
            message: 'تم إزالة الطالب من الغرفة'
        });
        
    } catch (error) {
        console.error('خطأ في إزالة الطالب:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 8.10 الحصول على إحصائيات الإدمن
app.get('/api/admin/stats', async (req, res) => {
    try {
        const { adminId } = req.query;
        
        if (!adminId || adminId !== CONFIG.ADMIN_ID) {
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
                weekly: CONFIG.WEEKLY_SUBSCRIPTION,
                monthly: CONFIG.TEACHER_MONTHLY_FEE,
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
                account: CONFIG.ADMIN_BANK_ACCOUNT,
                name: CONFIG.ADMIN_NAME,
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

// ==================== [ 9. المسارات الحالية من الكود الأصلي ] ====================

// 9.1 رفع ملف + إرسال إلى Telegram
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
        
        // إرسال الملف إلى Telegram
        let telegramMessage = null;
        let telegramData = null;
        try {
            telegramMessage = await sendFileToTelegram(
                filePath,
                req.file.originalname,
                req.file.mimetype,
                req.body.caption || `📄 ${req.file.originalname}\n📁 ${folder}\n👤 ${uploadedBy}`
            );
            
            // حفظ معلومات Telegram في قاعدة البيانات
            telegramData = await saveTelegramFileInfo(fileMetadata, telegramMessage);
        } catch (telegramError) {
            console.error('⚠️ فشل إرسال الملف إلى Telegram:', telegramError.message);
        }
        
        // إرسال إشعار إلى Telegram عن ملف جديد
        await sendTelegramNotification(
            `📤 ملف جديد تم رفعه\n` +
            `📄 الاسم: ${req.file.originalname}\n` +
            `📁 المجلد: ${folder}\n` +
            `📊 الحجم: ${formatFileSize(req.file.size)}\n` +
            `👤 رفع بواسطة: ${uploadedBy}\n` +
            `🔗 رابط التحميل: ${storedMetadata.url}`
        );
        
        res.json({
            success: true,
            message: 'تم رفع الملف بنجاح',
            fileId: storedMetadata.id,
            metadata: storedMetadata,
            telegram: telegramData ? {
                sent: true,
                messageId: telegramMessage.message_id,
                link: telegramData.telegramLink,
                data: telegramData
            } : {
                sent: false,
                error: 'فشل إرسال إلى Telegram'
            },
            storageNote: '📦 الملف مخزن في ذاكرة البوت، فقط الرابط مخزن في Firebase'
        });
        
    } catch (error) {
        console.error('خطأ في رفع الملف:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 9.2 الحصول على ملف
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

// 9.3 تحميل ملف
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

// ==================== [ 10. دوال مساعدة ] ====================

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

// ==================== [ 11. المسارات الجديدة للملفات والبحث ] ====================

// 11.1 البحث في الملفات
app.get('/api/files/search', async (req, res) => {
    try {
        if (!firebaseInitialized || !db) {
            return res.status(500).json({ success: false, error: 'قاعدة البيانات غير متصلة' });
        }
        
        const { query, type, dateFrom, dateTo, limit = 50 } = req.query;
        
        let filesRef = db.ref('file_storage');
        
        // تطبيق الفلاتر
        const snapshot = await filesRef.orderByChild('uploadedAt').limitToLast(parseInt(limit)).once('value');
        let files = [];
        
        snapshot.forEach((childSnapshot) => {
            const file = childSnapshot.val();
            
            // فلترة حسب الاستعلام
            if (query && !file.originalName.toLowerCase().includes(query.toLowerCase())) {
                return;
            }
            
            // فلترة حسب النوع
            if (type && !file.mimeType.includes(type)) {
                return;
            }
            
            // فلترة حسب التاريخ
            if (dateFrom && file.uploadedAt < parseInt(dateFrom)) {
                return;
            }
            if (dateTo && file.uploadedAt > parseInt(dateTo)) {
                return;
            }
            
            files.push(file);
        });
        
        res.json({
            success: true,
            count: files.length,
            files: files
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 11.2 إحصائيات الملفات
app.get('/api/files/stats', async (req, res) => {
    try {
        if (!firebaseInitialized || !db) {
            // إحصائيات من الملفات المحلية
            const stats = await getLocalStats();
            return res.json({
                success: true,
                source: 'local',
                ...stats
            });
        }
        
        const [fileSnapshot, telegramSnapshot] = await Promise.all([
            db.ref('file_storage').once('value'),
            db.ref('telegram_files').once('value')
        ]);
        
        const files = fileSnapshot.val() || {};
        const telegramFiles = telegramSnapshot.val() || {};
        
        const fileArray = Object.values(files);
        const telegramArray = Object.values(telegramFiles);
        
        const stats = {
            totalFiles: fileArray.length,
            totalSize: fileArray.reduce((sum, file) => sum + (file.size || 0), 0),
            telegramFiles: telegramArray.length,
            byType: {},
            byFolder: {},
            recentUploads: fileArray
                .sort((a, b) => b.uploadedAt - a.uploadedAt)
                .slice(0, 10)
        };
        
        fileArray.forEach(file => {
            // حسب النوع
            const type = file.mimeType.split('/')[0];
            stats.byType[type] = (stats.byType[type] || 0) + 1;
            
            // حسب المجلد
            stats.byFolder[file.folder] = (stats.byFolder[file.folder] || 0) + 1;
        });
        
        res.json({
            success: true,
            source: 'firebase',
            ...stats
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 11.3 حذف ملف
app.delete('/api/files/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const { adminKey } = req.query;
        
        if (adminKey !== CONFIG.ADMIN_ID) {
            return res.status(403).json({ success: false, error: 'غير مصرح' });
        }
        
        if (!firebaseInitialized || !db) {
            return res.status(500).json({ success: false, error: 'قاعدة البيانات غير متصلة' });
        }
        
        // الحصول على معلومات الملف
        const fileRef = db.ref(`file_storage/${fileId}`);
        const telegramRef = db.ref(`telegram_files`).orderByChild('fileName').equalTo(fileId);
        
        const [fileSnapshot, telegramSnapshot] = await Promise.all([
            fileRef.once('value'),
            telegramRef.once('value')
        ]);
        
        const file = fileSnapshot.val();
        
        if (!file) {
            return res.status(404).json({ success: false, error: 'الملف غير موجود' });
        }
        
        // حذف من التخزين المحلي
        try {
            const filePath = path.join(STORAGE_BASE, file.folder, file.fileName);
            await fs.unlink(filePath);
            
            // حذف الصورة المصغرة إذا كانت موجودة
            if (file.thumbnailUrl) {
                const thumbPath = path.join(STORAGE_BASE, file.folder, `thumb_${file.fileName}`);
                try {
                    await fs.unlink(thumbPath);
                } catch (thumbError) {
                    console.warn('⚠️ لم يتم العثور على الصورة المصغرة:', thumbPath);
                }
            }
        } catch (fsError) {
            console.warn(`⚠️ لم يتم العثور على الملف محلياً: ${file.fileName}`);
        }
        
        // حذف من قاعدة البيانات
        await fileRef.remove();
        
        // حذف معلومات Telegram إذا كانت موجودة
        telegramSnapshot.forEach((childSnapshot) => {
            childSnapshot.ref.remove();
        });
        
        // إرسال إشعار إلى Telegram
        await sendTelegramNotification(
            `🗑️ ملف تم حذفه\n` +
            `📄 الاسم: ${file.originalName}\n` +
            `📊 الحجم: ${formatFileSize(file.size)}\n` +
            `📁 المجلد: ${file.folder}\n` +
            `👨‍💼 تم الحذف بواسطة: ${adminKey}\n` +
            `🆔 معرف الملف: ${fileId}`
        );
        
        res.json({
            success: true,
            message: 'تم حذف الملف بنجاح',
            deletedFile: {
                id: fileId,
                name: file.originalName,
                size: file.size,
                folder: file.folder
            }
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

async function getLocalStats() {
    try {
        const stats = {
            totalFiles: 0,
            totalSize: 0,
            byFolder: {},
            byType: {}
        };
        
        // حساب إحصائيات من جميع المجلدات
        for (const folder of Object.values(FOLDERS)) {
            const folderPath = path.join(STORAGE_BASE, folder);
            try {
                const files = await fs.readdir(folderPath);
                const folderFiles = files.filter(f => !f.startsWith('thumb_'));
                
                stats.byFolder[folder] = folderFiles.length;
                stats.totalFiles += folderFiles.length;
                
                // حساب حجم الملفات
                for (const file of folderFiles) {
                    try {
                        const filePath = path.join(folderPath, file);
                        const stat = await fs.stat(filePath);
                        stats.totalSize += stat.size;
                        
                        // حسب نوع الملف
                        const ext = path.extname(file).toLowerCase();
                        if (ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp') {
                            stats.byType['image'] = (stats.byType['image'] || 0) + 1;
                        } else if (ext === '.pdf') {
                            stats.byType['pdf'] = (stats.byType['pdf'] || 0) + 1;
                        } else if (ext === '.mp4' || ext === '.webm') {
                            stats.byType['video'] = (stats.byType['video'] || 0) + 1;
                        } else {
                            stats.byType['other'] = (stats.byType['other'] || 0) + 1;
                        }
                    } catch (err) {
                        // تجاهل الملفات التي لا يمكن قراءتها
                    }
                }
            } catch (err) {
                // تجاهل المجلدات التي لا يمكن قراءتها
            }
        }
        
        return stats;
    } catch (error) {
        console.error('خطأ في حساب الإحصائيات المحلية:', error);
        return { totalFiles: 0, totalSize: 0, byFolder: {}, byType: {} };
    }
}

// ==================== [ 12. تهيئة النظام الكاملة ] ====================
async function initializeSystem() {
    console.log('🚀 بدء تهيئة النظام الشاملة...');
    
    // 1. تحميل الإعدادات من Hugging Face
    const huggingFaceLoaded = await loadConfigFromHuggingFace();
    
    // 2. تهيئة Firebase
    await initializeFirebase();
    
    // 3. تهيئة Telegram Bot
    await initializeTelegramBot();
    
    // 4. فحص النظام
    console.log('\n📊 حالة النظام النهائية:');
    console.log(`✅ Hugging Face: ${huggingFaceLoaded ? 'محمل' : 'استخدام البديل'}`);
    console.log(`✅ Telegram Bot: ${telegramInitialized ? 'جاهز' : 'غير جاهز'}`);
    console.log(`✅ Firebase: ${firebaseInitialized ? 'متصل' : 'غير متصل'}`);
    console.log(`✅ OpenAI: ${CONFIG.OPENAI_API_KEY ? 'جاهز' : 'غير جاهز'}`);
    console.log(`✅ التخزين المحلي: جاهز (${STORAGE_BASE})`);
    console.log(`✅ WebSocket: جاهز للمحادثات المباشرة`);
    
    // 5. إرسال رسالة بدء التشغيل إلى Telegram
    if (telegramInitialized) {
        try {
            await telegramBot.telegram.sendMessage(
                CONFIG.TELEGRAM_CHAT_ID,
                `🚀 النظام بدأ التشغيل بنجاح!\n\n` +
                `🕒 الوقت: ${new Date().toLocaleString('ar-SA')}\n` +
                `🌐 السيرفر: ${process.env.BOT_URL || `http://localhost:${port}`}\n` +
                `📊 الحالة: جميع الأنظمة تعمل\n\n` +
                `🎥 البث المباشر: جاهز\n` +
                `📚 المكتبة: جاهزة\n` +
                `🤖 المساعد الذكي: ${CONFIG.OPENAI_API_KEY ? 'جاهز' : 'غير متاح'}\n` +
                `💳 نظام الدفع: جاهز`
            );
        } catch (error) {
            console.error('❌ فشل إرسال رسالة البدء إلى Telegram:', error.message);
        }
    }
    
    console.log('\n🎉 النظام جاهز للاستخدام بكامل ميزاته!');
}

// ==================== [ 13. الصفحة الرئيسية ] ====================

app.get('/', (req, res) => {
    res.json({
        name: 'Smart Education Platform + Telegram Bot',
        version: '4.0.0',
        description: 'منصة التعليم الذكي - بث مباشر جماعي + مساعد ذكي + نظام دفع + ربط Telegram',
        admin: {
            name: CONFIG.ADMIN_NAME,
            account: CONFIG.ADMIN_BANK_ACCOUNT,
            id: CONFIG.ADMIN_ID ? '****' + CONFIG.ADMIN_ID.slice(-4) : 'غير محدد'
        },
        pricing: {
            student_weekly: CONFIG.WEEKLY_SUBSCRIPTION,
            teacher_monthly: CONFIG.TEACHER_MONTHLY_FEE,
            free_trial_days: CONFIG.FREE_TRIAL_DAYS,
            free_teacher_months: CONFIG.FREE_TEACHER_MONTHS
        },
        limits: {
            daily_ai_questions: CONFIG.MAX_DAILY_QUESTIONS
        },
        system_status: {
            telegram_bot: telegramInitialized ? '🟢 نشط' : '🔴 غير نشط',
            firebase: firebaseInitialized ? '🟢 متصل' : '🔴 غير متصل',
            openai: CONFIG.OPENAI_API_KEY ? '🟢 جاهز' : '🔴 غير متاح',
            websocket: '🟢 جاهز',
            huggingface: CONFIG.TELEGRAM_BOT_TOKEN ? '🟢 محمل' : '🔴 غير محمل'
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
            
            // الملفات مع Telegram
            upload_file: 'POST /api/upload/:folder',
            get_file: 'GET /api/file/:folder/:filename',
            download: 'GET /api/download/:folder/:filename',
            search_files: 'GET /api/files/search',
            files_stats: 'GET /api/files/stats',
            delete_file: 'DELETE /api/files/:fileId?adminKey=ADMIN_ID'
        },
        telegram: {
            bot_ready: telegramInitialized,
            chat_id: CONFIG.TELEGRAM_CHAT_ID || 'غير محدد',
            notifications: CONFIG.TELEGRAM_NOTIFICATIONS_CHAT_ID ? 'مفعل' : 'غير مفعل'
        },
        websocket: `ws://${req.headers.host}/socket.io/`,
        note: '🚀 النظام يعتمد على WebSocket للبث المباشر والتواصل الفوري + Telegram لإرسال الملفات والإشعارات'
    });
});

// ==================== [ 14. تشغيل السيرفر ] ====================

server.listen(port, '0.0.0.0', async () => {
    console.log(`\n🚀 سيرفر التعليم الذكي يعمل على المنفذ ${port}`);
    console.log(`🔗 الواجهة الرئيسية: http://localhost:${port}`);
    console.log(`🔌 WebSocket: ws://localhost:${port}`);
    console.log(`🤖 Telegram Bot: ${telegramInitialized ? 'جاهز' : 'غير جاهز'}`);
    console.log(`🏦 حساب الإدمن: ${CONFIG.ADMIN_BANK_ACCOUNT} (${CONFIG.ADMIN_NAME})`);
    console.log('🎥 نظام البث الجماعي جاهز!');
    console.log('🤖 المساعد الذكي محدود بـ ' + CONFIG.MAX_DAILY_QUESTIONS + ' سؤال/يوم');
    console.log('📤 نظام رفع الملفات إلى Telegram جاهز!\n');
    
    // تهيئة النظام
    await initializeSystem();
    
    // جدولة تحديث الإعدادات كل ساعة
    setInterval(async () => {
        console.log('🔄 تحديث الإعدادات من Hugging Face...');
        await loadConfigFromHuggingFace();
    }, 60 * 60 * 1000); // كل ساعة
    
    // جدولة إرسال إحصائيات يومية إلى Telegram
    setInterval(async () => {
        if (telegramInitialized && CONFIG.TELEGRAM_NOTIFICATIONS_CHAT_ID) {
            await sendDailyStats();
        }
    }, 24 * 60 * 60 * 1000); // كل 24 ساعة
});

// دالة إرسال الإحصائيات اليومية
async function sendDailyStats() {
    try {
        if (!db || !telegramInitialized) return;
        
        const today = moment().format('YYYY-MM-DD');
        const yesterday = moment().subtract(1, 'day').format('YYYY-MM-DD');
        
        // الحصول على الإحصائيات
        const [usersSnapshot, booksSnapshot, paymentsSnapshot] = await Promise.all([
            db.ref('users').once('value'),
            db.ref('books').once('value'),
            db.ref('payments').once('value')
        ]);
        
        const users = usersSnapshot.val() || {};
        const books = booksSnapshot.val() || {};
        const payments = paymentsSnapshot.val() || {};
        
        let todayRevenue = 0;
        let newUsers = 0;
        let newBooks = 0;
        
        // حساب إيرادات اليوم
        Object.values(payments).forEach(userPayments => {
            Object.values(userPayments).forEach(payment => {
                const paymentDate = moment(payment.timestamp).format('YYYY-MM-DD');
                if (paymentDate === today && payment.status === 'verified') {
                    todayRevenue += payment.amount || 0;
                }
            });
        });
        
        // حساب المستخدمين الجدد
        Object.values(users).forEach(user => {
            if (moment(user.joinDate).format('YYYY-MM-DD') === today) {
                newUsers++;
            }
        });
        
        // حساب الكتب الجديدة
        Object.values(books).forEach(book => {
            if (moment(book.uploadDate).format('YYYY-MM-DD') === today) {
                newBooks++;
            }
        });
        
        // إرسال الإحصائيات
        await telegramBot.telegram.sendMessage(
            CONFIG.TELEGRAM_NOTIFICATIONS_CHAT_ID,
            `📊 الإحصائيات اليومية - ${today}\n\n` +
            `👤 المستخدمين: ${Object.keys(users).length}\n` +
            `🆕 مستخدمين جدد: ${newUsers}\n` +
            `📚 الكتب: ${Object.keys(books).length}\n` +
            `🆕 كتب جديدة: ${newBooks}\n` +
            `💰 إيرادات اليوم: ${todayRevenue}\n` +
            `💳 إجمالي الإيرادات: ${Object.values(payments).reduce((total, userPayments) => {
                return total + Object.values(userPayments)
                    .filter(p => p.status === 'verified')
                    .reduce((sum, p) => sum + (p.amount || 0), 0);
            }, 0)}\n\n` +
            `🕒 وقت التقرير: ${new Date().toLocaleTimeString('ar-SA')}`
        );
        
    } catch (error) {
        console.error('❌ خطأ في إرسال الإحصائيات اليومية:', error.message);
    }
}

// معالجة الإغلاق الأنسب
process.on('SIGINT', async () => {
    console.log('\n🛑 إيقاف النظام بأمان...');
    
    if (telegramBot) {
        try {
            await telegramBot.stop();
            console.log('✅ Telegram Bot متوقف');
        } catch (error) {
            console.error('❌ خطأ في إيقاف Telegram Bot:', error.message);
        }
    }
    
    if (server) {
        server.close(() => {
            console.log('✅ السيرفر متوقف');
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});

process.on('uncaughtException', (error) => {
    console.error('❌ خطأ غير متوقع:', error);
    
    // إرسال إشعار إلى Telegram عن الخطأ
    if (telegramInitialized && CONFIG.TELEGRAM_ADMIN_CHAT_ID) {
        telegramBot.telegram.sendMessage(
            CONFIG.TELEGRAM_ADMIN_CHAT_ID,
            `🚨 خطأ غير متوقع في النظام:\n\n` +
            `📝 ${error.message}\n` +
            `📂 ${error.stack ? error.stack.split('\n')[1] : 'لا يوجد stack trace'}\n\n` +
            `🕒 ${new Date().toLocaleString('ar-SA')}`
        ).catch(() => {});
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ وعد مرفوض غير معالج:', reason);
});
