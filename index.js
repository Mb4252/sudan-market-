const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const admin = require('firebase-admin');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const moment = require('moment');
const { OpenAI } = require('openai');
const socketIO = require('socket.io');
const { Telegraf } = require('telegraf');
const http = require('http');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const port = process.env.PORT || 10000;
const BOT_URL = process.env.BOT_URL || 'https://sdm-security-bot.onrender.com';

// ==================== [ إعداد CORS ] ====================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// ==================== [ تهيئة المفاتيح ] ====================
let CONFIG = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
    TELEGRAM_ADMIN_CHAT_ID: process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '',
    TELEGRAM_NOTIFICATIONS_CHAT_ID: process.env.TELEGRAM_NOTIFICATIONS_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '',
    TELEGRAM_STORAGE_CHANNEL: process.env.TELEGRAM_STORAGE_CHANNEL || process.env.TELEGRAM_CHAT_ID || '',
    FIREBASE_JSON: process.env.FIREBASE_ADMIN_JSON ? JSON.parse(process.env.FIREBASE_ADMIN_JSON) : {},
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
    ADMIN_ID: process.env.ADMIN_ID || '',
    ADMIN_BANK_ACCOUNT: process.env.ADMIN_BANK_ACCOUNT || "4426148",
    ADMIN_NAME: process.env.ADMIN_NAME || "محمد عبدالمعطي علي",
    ADMIN_PHONE: process.env.ADMIN_PHONE || "+249XXXXXXXXX",
    // نظام الاشتراكات
    FREE_TRIAL_DAYS: parseInt(process.env.FREE_TRIAL_DAYS) || 7,
    WEEKLY_SUBSCRIPTION: parseInt(process.env.WEEKLY_SUBSCRIPTION) || 7000,
    MONTHLY_SUBSCRIPTION: parseInt(process.env.MONTHLY_SUBSCRIPTION) || 25000,
    TEACHER_MONTHLY_FEE: parseInt(process.env.TEACHER_MONTHLY_FEE) || 30000,
    MAX_DAILY_QUESTIONS: {
        trial: parseInt(process.env.MAX_DAILY_QUESTIONS_TRIAL) || 50,
        free: parseInt(process.env.MAX_DAILY_QUESTIONS_FREE) || 20,
        paid: parseInt(process.env.MAX_DAILY_QUESTIONS_PAID) || 500
    },
    PAYMENT_METHODS: process.env.PAYMENT_METHODS ? process.env.PAYMENT_METHODS.split(',') : ["حساب بنكي", "فودافون كاش", "زين كاش", "مصرفي"],
    AUTO_APPROVE_PAYMENTS: process.env.AUTO_APPROVE_PAYMENTS === 'true',
    STORAGE_MODE: process.env.STORAGE_MODE || "TELEGRAM_AND_SERVER",
    MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || (50 * 1024 * 1024),
    AUTO_DELETE_LOCAL_AFTER_UPLOAD: process.env.AUTO_DELETE_LOCAL_AFTER_UPLOAD === 'true'
};

// ==================== [ تهيئة بوت Telegram ] ====================
let telegramBot = null;
let telegramStorageChannel = CONFIG.TELEGRAM_STORAGE_CHANNEL;

if (CONFIG.TELEGRAM_BOT_TOKEN && CONFIG.TELEGRAM_BOT_TOKEN.length > 10) {
    try {
        telegramBot = new Telegraf(CONFIG.TELEGRAM_BOT_TOKEN);
        console.log('✅ Telegram Bot initialized successfully');
        
        setTimeout(async () => {
            try {
                console.log('🔄 Setting up Telegram bot with webhook...');
                await telegramBot.telegram.deleteWebhook({ drop_pending_updates: true });
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                const webhookUrl = `${BOT_URL}/bot${CONFIG.TELEGRAM_BOT_TOKEN}`;
                console.log(`🔗 Setting webhook to: ${webhookUrl.substring(0, 40)}...`);
                
                await telegramBot.telegram.setWebhook(webhookUrl, {
                    drop_pending_updates: true,
                    allowed_updates: ['message', 'callback_query', 'inline_query']
                });
                
                console.log('✅ Telegram bot configured with webhook');
                
                // إخفاء التوكن من السجلات في route handler
                const webhookPath = `/bot${CONFIG.TELEGRAM_BOT_TOKEN}`;
                app.post(webhookPath, (req, res) => {
                    telegramBot.handleUpdate(req.body, res);
                });
                
                console.log(`🤖 Telegram Bot Webhook is ready at ${webhookPath.substring(0, 15)}...`);
                
                // أوامر Telegram
                telegramBot.command('start', (ctx) => {
                    const welcomeMessage = `
🤖 **Smart Education Platform**

🎯 *منصة التعليم الذكي مع DeepSeek AI*

📚 *المميزات:*
• مساعد ذكي للأسئلة التعليمية
• مكتبة كتب تعليمية
• بث مباشر تفاعلي
• نظام اشتراكات متكامل

📞 *للتواصل:* ${CONFIG.ADMIN_PHONE}
🏦 *رقم الحساب:* ${CONFIG.ADMIN_BANK_ACCOUNT}

⚡ *الأوامر المتاحة:*
/start - عرض هذه الرسالة
/subscribe - خطط الاشتراك
/status - حالة البوت
/help - المساعدة
                    `;
                    ctx.reply(welcomeMessage, { 
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: "💰 خطط الاشتراك", callback_data: "show_subscription" },
                                    { text: "📚 المكتبة", callback_data: "show_books" }
                                ],
                                [
                                    { text: "🎥 البث المباشر", callback_data: "live_stream" },
                                    { text: "🧠 اسأل AI", callback_data: "ask_ai" }
                                ],
                                [
                                    { text: "📞 الدعم الفني", url: `tel:${CONFIG.ADMIN_PHONE.replace('+', '')}` }
                                ]
                            ]
                        }
                    });
                });
                
                telegramBot.command('subscribe', (ctx) => {
                    const message = `
💰 **خطط الاشتراك:**

🎁 *تجربة مجانية:* ${CONFIG.FREE_TRIAL_DAYS} يوم (${CONFIG.MAX_DAILY_QUESTIONS.trial} سؤال/يوم)
📦 *أسبوعي:* ${CONFIG.WEEKLY_SUBSCRIPTION} SDG (${CONFIG.MAX_DAILY_QUESTIONS.paid} سؤال/يوم)
📅 *شهري:* ${CONFIG.MONTHLY_SUBSCRIPTION} SDG (${CONFIG.MAX_DAILY_QUESTIONS.paid} سؤال/يوم)
👨‍🏫 *معلم شهري:* ${CONFIG.TEACHER_MONTHLY_FEE} SDG (${CONFIG.MAX_DAILY_QUESTIONS.paid} سؤال/يوم)

💳 **طرق الدفع:** ${CONFIG.PAYMENT_METHODS.join(', ')}
🏦 **رقم الحساب:** ${CONFIG.ADMIN_BANK_ACCOUNT}
👤 **اسم صاحب الحساب:** ${CONFIG.ADMIN_NAME}
📞 **للتواصل:** ${CONFIG.ADMIN_PHONE}

🔗 **رابط المنصة:** ${BOT_URL}
                    `;
                    ctx.reply(message, { 
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: "💳 إرسال إيصال دفع", callback_data: "send_payment" },
                                    { text: "📋 شروط الاستخدام", callback_data: "terms" }
                                ],
                                [
                                    { text: "🌐 زيارة المنصة", url: BOT_URL },
                                    { text: "📞 الاتصال بالدعم", url: `tel:${CONFIG.ADMIN_PHONE.replace('+', '')}` }
                                ]
                            ]
                        }
                    });
                });
                
                telegramBot.command('status', (ctx) => {
                    const activeRooms = Array.from(liveRooms.values());
                    const totalParticipants = activeRooms.reduce((acc, room) => acc + room.participants.size, 0);
                    
                    const statusMessage = `
✅ **حالة النظام:**

🤖 *البوت:* 🟢 يعمل
🌐 *السيرفر:* ${BOT_URL}
📅 *الوقت:* ${new Date().toLocaleString('ar-SA')}
👥 *المستخدمون النشطون:* ${totalParticipants}
🎥 *الغرف النشطة:* ${activeRooms.length}

🔧 *الخدمات:*
• DeepSeek AI: ${deepseekClient ? '🟢 نشط' : '🔴 غير نشط'}
• Firebase: ${isFirebaseInitialized ? '🟢 متصل' : '🔴 غير متصل'}
• التخزين: ${telegramBot ? '🟢 متاح' : '🔴 غير متاح'}
                    `;
                    ctx.reply(statusMessage, { parse_mode: 'Markdown' });
                });
                
                telegramBot.command('help', (ctx) => {
                    const helpMessage = `
🆘 **مركز المساعدة:**

📞 *الدعم الفني:* ${CONFIG.ADMIN_PHONE}

🔗 **الروابط المهمة:**
• المنصة الرئيسية: ${BOT_URL}
• حالة الخدمة: ${BOT_URL}/health

⚡ **نصائح سريعة:**
1. جرب الأمر /start لرؤية البداية
2. /subscribe لعرض خطط الاشتراك
3. أرسل سؤالك مباشرة للبوت للحصول على إجابة

🔄 **في حالة وجود مشكلة:**
• تأكد من اتصال الإنترنت
• حاول إعادة تشغيل البوت
• تواصل مع الدعم الفني
                    `;
                    ctx.reply(helpMessage, { parse_mode: 'Markdown' });
                });
                
                // معالجة موافقات الأدمن
                telegramBot.on('callback_query', async (ctx) => {
                    const callbackData = ctx.callbackQuery.data;
                    
                    if (callbackData.startsWith('approve_')) {
                        const paymentId = callbackData.replace('approve_', '');
                        const result = await approvePayment(paymentId, 'telegram_admin', 'موافقة عبر Telegram');
                        
                        if (result.success) {
                            ctx.answerCbQuery('✅ تمت الموافقة على الدفع');
                            ctx.editMessageText(`💰 **تمت الموافقة على الدفع**\n\n🆔 ${paymentId}\n👤 ${result.userId}\n📅 ${result.subscriptionDays} يوم\n✅ ${result.message}`);
                        } else {
                            ctx.answerCbQuery('❌ فشلت الموافقة');
                        }
                    }
                    else if (callbackData.startsWith('reject_')) {
                        const paymentId = callbackData.replace('reject_', '');
                        const result = await rejectPayment(paymentId, 'telegram_admin', 'مرفوض عبر Telegram');
                        
                        if (result.success) {
                            ctx.answerCbQuery('❌ تم رفض الدفع');
                            ctx.editMessageText(`❌ **تم رفض الدفع**\n\n🆔 ${paymentId}\n📌 السبب: مرفوض عبر Telegram`);
                        } else {
                            ctx.answerCbQuery('❌ فشل الرفض');
                        }
                    }
                    else if (callbackData === 'show_subscription') {
                        ctx.answerCbQuery('عرض خطط الاشتراك');
                        ctx.reply(`💰 **خطط الاشتراك:**\n\n🎁 تجربة مجانية: ${CONFIG.FREE_TRIAL_DAYS} أيام\n📦 أسبوعي: ${CONFIG.WEEKLY_SUBSCRIPTION} SDG\n📅 شهري: ${CONFIG.MONTHLY_SUBSCRIPTION} SDG\n👨‍🏫 معلم: ${CONFIG.TEACHER_MONTHLY_FEE} SDG\n\n${BOT_URL}`, {
                            parse_mode: 'Markdown'
                        });
                    }
                    else if (callbackData === 'ask_ai') {
                        ctx.answerCbQuery('اسأل الذكاء الاصطناعي');
                        ctx.reply(`🧠 **مساعد DeepSeek الذكي**\n\nيمكنك استخدام المساعد الذكي من خلال:\n\n1. زيارة ${BOT_URL}\n2. استخدام زر "اسأل AI"\n3. إرسال سؤالك التعليمي مباشرة\n\nللاستفادة الكاملة، يرجى الاشتراك في إحدى الخطط.`, {
                            parse_mode: 'Markdown'
                        });
                    }
                });
                
                // معالجة الرسائل النصية
                telegramBot.on('text', (ctx) => {
                    const text = ctx.message.text;
                    if (!text.startsWith('/')) {
                        ctx.reply(`📝 *رسالتك:* ${text}\n\nللاستفادة من خدمات المنصة التعليمية، يرجى:\n\n1. زيارة ${BOT_URL}\n2. استخدام /subscribe لعرض خطط الاشتراك\n3. التواصل مع الدعم: ${CONFIG.ADMIN_PHONE}`, {
                            parse_mode: 'Markdown'
                        });
                    }
                });
                
                // معالجة الصور (لإيصالات الدفع)
                telegramBot.on('photo', async (ctx) => {
                    const photo = ctx.message.photo[ctx.message.photo.length - 1];
                    
                    ctx.reply(`📸 **تم استلام صورة**\n\nإذا كانت هذه إيصال دفع، يرجى:\n\n1. إرسال رقم المعاملة\n2. طريقة الدفع\n3. المبلغ المدفوع\n4. رقم هاتفك\n\nأو تواصل مع الدعم: ${CONFIG.ADMIN_PHONE}`, {
                        parse_mode: 'Markdown'
                    });
                });
                
            } catch (err) {
                console.error('❌ Error setting up Telegram webhook');
                telegramBot = null;
            }
        }, 8000);
        
    } catch (error) {
        console.error('❌ Failed to initialize Telegram Bot');
        telegramBot = null;
    }
} else {
    console.log('⚠️ Telegram Bot Token not provided or invalid');
}

// ==================== [ تهيئة Firebase Admin ] ====================
let isFirebaseInitialized = false;
let isBooksInitialized = false;

if (CONFIG.FIREBASE_JSON && Object.keys(CONFIG.FIREBASE_JSON).length > 0) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(CONFIG.FIREBASE_JSON),
            databaseURL: process.env.FIREBASE_DATABASE_URL || "https://sudan-market-6b122-default-rtdb.firebaseio.com",
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "sudan-market-6b122.appspot.com"
        });
        console.log('✅ Firebase Admin initialized successfully');
        isFirebaseInitialized = true;
        
        setTimeout(async () => {
            try {
                const db = admin.database();
                const snapshot = await db.ref('books').once('value');
                const existingBooks = snapshot.val() || {};
                
                if (Object.keys(existingBooks).length === 0) {
                    console.log('📚 No books found, initializing database...');
                    await initializeBooksDatabase();
                } else {
                    console.log(`📚 Books already exist in database (${Object.keys(existingBooks).length} books)`);
                    isBooksInitialized = true;
                }
                
                // إنشاء جدول المستخدمين إذا لم يكن موجودًا
                const usersSnapshot = await db.ref('users').once('value');
                if (!usersSnapshot.exists()) {
                    await db.ref('users').set({});
                    console.log('👥 Users table created');
                }
                
                // إنشاء جدول المدفوعات
                const paymentsSnapshot = await db.ref('payments').once('value');
                if (!paymentsSnapshot.exists()) {
                    await db.ref('payments').set({});
                    console.log('💰 Payments table created');
                }
                
            } catch (error) {
                console.error('❌ Error checking books');
            }
        }, 3000);
        
    } catch (error) {
        console.error('❌ Failed to initialize Firebase Admin');
    }
} else {
    console.log('⚠️ Firebase Admin JSON not provided');
}

// ==================== [ تهيئة DeepSeek API ] ====================
let deepseekClient = null;
if (CONFIG.DEEPSEEK_API_KEY && CONFIG.DEEPSEEK_API_KEY.length > 10) {
    try {
        deepseekClient = new OpenAI({
            apiKey: CONFIG.DEEPSEEK_API_KEY,
            baseURL: 'https://api.deepseek.com/v1'
        });
        console.log('✅ DeepSeek API initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize DeepSeek API');
    }
} else {
    console.log('⚠️ DeepSeek API Key not provided - AI features disabled');
}

// ==================== [ متغيرات التخزين ] ====================
const liveRooms = new Map();
const uploadedFiles = new Map();
const userSessions = new Map();

// ==================== [ إعدادات تخزين الملفات ] ====================
const STORAGE_BASE = './smart_storage';
const FOLDERS = {
    IMAGES: 'images',
    BOOKS: 'books',
    VIDEOS: 'videos',
    AVATARS: 'avatars',
    TEACHER_IDS: 'teacher_ids',
    LIVE_RECORDINGS: 'live_recordings',
    TEMP: 'temp'
};

(async () => {
    try {
        await fs.mkdir(STORAGE_BASE, { recursive: true });
        for (const folder of Object.values(FOLDERS)) {
            await fs.mkdir(path.join(STORAGE_BASE, folder), { recursive: true });
        }
        console.log('✅ Storage folders created successfully');
        await cleanupTempFiles();
    } catch (error) {
        console.error('❌ Error creating storage folders');
    }
})();

// ==================== [ Middleware للتسجيل الآمن ] ====================
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const method = req.method;
    let url = req.url;
    
    // إخفاء التوكن من السجلات إذا كان في URL
    if (url.includes('/bot') && CONFIG.TELEGRAM_BOT_TOKEN) {
        const botPath = `/bot${CONFIG.TELEGRAM_BOT_TOKEN}`;
        url = url.replace(CONFIG.TELEGRAM_BOT_TOKEN, '***TOKEN***');
    }
    
    console.log(`${method} ${url} - ${timestamp}`);
    next();
});

// ==================== [ تكوين Multer للرفع ] ====================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const folder = req.params.folder || 'images';
        cb(null, path.join(STORAGE_BASE, FOLDERS.TEMP));
    },
    filename: (req, file, cb) => {
        const uniqueId = crypto.randomBytes(8).toString('hex');
        const ext = path.extname(file.originalname);
        const fileName = `${Date.now()}_${uniqueId}${ext}`;
        cb(null, fileName);
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
            'image/gif': 'images',
            'application/pdf': 'books',
            'application/msword': 'books',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'books',
            'text/plain': 'books',
            'video/mp4': 'videos',
            'video/webm': 'videos',
            'video/quicktime': 'videos',
            'audio/mpeg': 'videos'
        };
        
        if (allowedTypes[file.mimetype]) {
            cb(null, true);
        } else {
            cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
        }
    }
});

// ==================== [ دوال مساعدة ] ====================
async function storeFileMetadata(fileInfo) {
    if (!isFirebaseInitialized) {
        console.warn('⚠️ Firebase not initialized - skipping metadata storage');
        return fileInfo;
    }

    try {
        const fileId = `file_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const metadata = {
            id: fileId,
            originalName: fileInfo.originalName,
            fileName: fileInfo.fileName,
            folder: fileInfo.folder,
            telegramUrl: fileInfo.telegramUrl,
            serverUrl: fileInfo.serverUrl,
            telegramFileId: fileInfo.telegramFileId,
            telegramMessageId: fileInfo.telegramMessageId,
            size: fileInfo.size,
            uploadedBy: fileInfo.uploadedBy || 'anonymous',
            uploadedAt: fileInfo.uploadedAt,
            isPublic: fileInfo.isPublic !== false,
            storageMode: fileInfo.storageMode || 'SERVER_ONLY',
            localPath: fileInfo.localPath,
            publicUrl: fileInfo.publicUrl,
            ...(fileInfo.bookInfo || {})
        };
        
        const db = admin.database();
        await db.ref(`file_storage/${fileId}`).set(metadata);
        
        console.log(`✅ File metadata saved to Firebase: ${fileId}`);
        
        if (fileInfo.folder === 'books' && fileInfo.bookInfo) {
            const bookId = `book_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
            const bookData = {
                id: bookId,
                title: fileInfo.bookInfo.title || fileInfo.originalName,
                author: fileInfo.bookInfo.author || 'غير معروف',
                grade: fileInfo.bookInfo.grade || 'عام',
                subject: fileInfo.bookInfo.subject || 'عام',
                description: fileInfo.bookInfo.description || '',
                pages: fileInfo.bookInfo.pages || 0,
                fileName: fileInfo.fileName,
                fileSize: fileInfo.size,
                downloadUrl: fileInfo.publicUrl,
                telegramUrl: fileInfo.telegramUrl,
                thumbnailUrl: fileInfo.thumbnailUrl,
                uploadedBy: fileInfo.uploadedBy,
                uploadedAt: fileInfo.uploadedAt,
                downloads: 0,
                views: 0,
                isFree: true,
                language: 'العربية',
                curriculum: 'المنهج السوداني'
            };
            
            await db.ref(`books/${bookId}`).set(bookData);
            console.log(`📚 Book saved to database: ${bookData.title}`);
        }
        
        return { ...fileInfo, firebaseId: fileId };
        
    } catch (error) {
        console.error('❌ Error saving metadata to Firebase');
        return fileInfo;
    }
}

async function createThumbnail(filePath, fileName) {
    try {
        const thumbFileName = `thumb_${path.parse(fileName).name}.webp`;
        const thumbPath = path.join(STORAGE_BASE, 'images', thumbFileName);
        
        await sharp(filePath)
            .resize(200, 200, { fit: 'cover' })
            .webp({ quality: 80 })
            .toFile(thumbPath);
        
        const thumbUrl = `${BOT_URL}/api/file/images/${thumbFileName}`;
        
        if (telegramBot && telegramStorageChannel) {
            await uploadToTelegram(thumbPath, thumbFileName, 'images');
        }
        
        return thumbUrl;
    } catch (error) {
        console.warn('⚠️ Failed to create thumbnail');
        return null;
    }
}

async function extractPDFInfo(filePath) {
    try {
        if (path.extname(filePath).toLowerCase() !== '.pdf') {
            return { pages: 0, hasText: false, optimized: false };
        }
        
        const pdfBytes = await fs.readFile(filePath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPageCount();
        return { 
            pages, 
            hasText: pages > 0, 
            optimized: pages <= 50,
            fileSize: pdfBytes.length
        };
    } catch (error) {
        return { pages: 0, hasText: false, optimized: false, fileSize: 0 };
    }
}

// ==================== [ دوال التخزين في Telegram ] ====================
async function uploadToTelegram(filePath, fileName, fileType) {
    if (!telegramBot || !telegramStorageChannel) {
        console.log('⚠️ Telegram storage not available');
        return null;
    }

    try {
        const fileStats = await fs.stat(filePath);
        
        if (fileStats.size > CONFIG.MAX_FILE_SIZE) {
            console.log(`⚠️ File too large for Telegram (${(fileStats.size/1024/1024).toFixed(2)}MB)`);
            return null;
        }
        
        console.log(`📤 Uploading to Telegram: ${fileName} (${(fileStats.size/1024/1024).toFixed(2)}MB)`);
        
        let caption = `📁 ${fileName}\n📦 ${(fileStats.size/1024/1024).toFixed(2)}MB\n⏰ ${new Date().toLocaleString()}\n🔗 ${BOT_URL}`;
        
        let message;
        const ext = path.extname(fileName).toLowerCase();
        
        if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
            message = await telegramBot.telegram.sendPhoto(
                telegramStorageChannel,
                { source: filePath },
                { caption: caption }
            );
        } else if (['.pdf', '.doc', '.docx', '.txt', '.epub'].includes(ext)) {
            message = await telegramBot.telegram.sendDocument(
                telegramStorageChannel,
                { source: filePath, filename: fileName },
                { caption: caption }
            );
        } else if (['.mp4', '.avi', '.mov', '.mkv', '.webm'].includes(ext)) {
            if (fileStats.size > 20 * 1024 * 1024) {
                console.log('⚠️ Video file too large for Telegram');
                return null;
            }
            message = await telegramBot.telegram.sendVideo(
                telegramStorageChannel,
                { source: filePath },
                { caption: caption }
            );
        } else {
            message = await telegramBot.telegram.sendDocument(
                telegramStorageChannel,
                { source: filePath, filename: fileName },
                { caption: caption }
            );
        }
        
        let fileUrl = null;
        if (message.document) {
            const fileId = message.document.file_id;
            const fileInfo = await telegramBot.telegram.getFile(fileId);
            fileUrl = `https://api.telegram.org/file/bot${CONFIG.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;
        } else if (message.photo && message.photo.length > 0) {
            const fileId = message.photo[message.photo.length - 1].file_id;
            const fileInfo = await telegramBot.telegram.getFile(fileId);
            fileUrl = `https://api.telegram.org/file/bot${CONFIG.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;
        } else if (message.video) {
            const fileId = message.video.file_id;
            const fileInfo = await telegramBot.telegram.getFile(fileId);
            fileUrl = `https://api.telegram.org/file/bot${CONFIG.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;
        }
        
        console.log(`✅ Uploaded to Telegram: ${fileName}`);
        
        const fileInfo = {
            telegramFileId: message.document?.file_id || message.photo?.[0]?.file_id || message.video?.file_id,
            telegramMessageId: message.message_id,
            telegramUrl: fileUrl,
            localPath: filePath,
            fileName: fileName,
            uploadedAt: Date.now(),
            downloadUrl: `${BOT_URL}/api/file/${fileType}/${fileName}`
        };
        
        uploadedFiles.set(fileName, fileInfo);
        
        if (CONFIG.AUTO_DELETE_LOCAL_AFTER_UPLOAD) {
            try {
                await fs.unlink(filePath);
                console.log(`🗑️ Deleted local file: ${fileName}`);
            } catch (error) {
                console.warn(`⚠️ Could not delete local file`);
            }
        }
        
        return fileInfo;
        
    } catch (error) {
        console.error(`❌ Error uploading to Telegram`);
        return null;
    }
}

async function uploadToBoth(fileBuffer, fileName, folder, originalName) {
    const results = {
        telegram: null,
        server: null,
        combined: {}
    };
    
    const tempFileName = `temp_${Date.now()}_${fileName}`;
    const tempPath = path.join(STORAGE_BASE, FOLDERS.TEMP, tempFileName);
    
    try {
        await fs.writeFile(tempPath, fileBuffer);
        
        if (telegramBot && telegramStorageChannel) {
            results.telegram = await uploadToTelegram(tempPath, originalName || fileName, folder);
        }
        
        const finalPath = path.join(STORAGE_BASE, folder, fileName);
        
        if (CONFIG.AUTO_DELETE_LOCAL_AFTER_UPLOAD && results.telegram) {
            results.server = {
                localPath: finalPath,
                serverUrl: results.telegram.telegramUrl,
                fileName: fileName,
                uploadedAt: Date.now()
            };
        } else {
            await fs.copyFile(tempPath, finalPath);
            const stats = await fs.stat(finalPath);
            const serverUrl = `${BOT_URL}/api/file/${folder}/${fileName}`;
            
            results.server = {
                localPath: finalPath,
                serverUrl: serverUrl,
                fileName: fileName,
                size: stats.size,
                uploadedAt: Date.now()
            };
        }
        
        results.combined = {
            fileName: fileName,
            originalName: originalName || fileName,
            folder: folder,
            telegramUrl: results.telegram?.telegramUrl || null,
            serverUrl: results.server.serverUrl,
            telegramFileId: results.telegram?.telegramFileId || null,
            telegramMessageId: results.telegram?.telegramMessageId || null,
            localPath: results.server.localPath,
            size: results.server.size || fileBuffer.length,
            uploadedAt: Date.now(),
            storageMode: results.telegram ? 'TELEGRAM_AND_SERVER' : 'SERVER_ONLY',
            publicUrl: `${BOT_URL}/api/file/${folder}/${fileName}`
        };
        
        try {
            await fs.unlink(tempPath);
        } catch (error) {
            console.warn(`⚠️ Could not delete temp file`);
        }
        
        return results.combined;
        
    } catch (error) {
        console.error(`❌ Error in dual upload`);
        try {
            await fs.unlink(tempPath);
        } catch (cleanupError) {}
        throw error;
    }
}

async function cleanupTempFiles() {
    try {
        const tempDir = path.join(STORAGE_BASE, FOLDERS.TEMP);
        const files = await fs.readdir(tempDir);
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        
        for (const file of files) {
            const filePath = path.join(tempDir, file);
            const stats = await fs.stat(filePath);
            
            if (now - stats.mtimeMs > oneHour) {
                await fs.unlink(filePath);
                console.log(`🧹 Cleaned up old temp file: ${file}`);
            }
        }
    } catch (error) {}
}

// ==================== [ تهيئة قاعدة بيانات الكتب ] ====================
async function initializeBooksDatabase() {
    if (isBooksInitialized) {
        console.log('📚 Books already initialized in this session');
        return;
    }
    
    try {
        if (!isFirebaseInitialized) {
            console.log('⚠️ Firebase not connected - skipping book initialization');
            return;
        }

        const db = admin.database();
        const snapshot = await db.ref('books').once('value');
        const existingBooks = snapshot.val() || {};
        
        if (Object.keys(existingBooks).length > 0) {
            console.log(`📚 Books already exist in database (${Object.keys(existingBooks).length} books)`);
            isBooksInitialized = true;
            return;
        }

        console.log('📚 Initializing educational books database...');
        
        const allBooks = getAllEducationalBooks();
        
        let addedCount = 0;
        for (const book of allBooks) {
            const bookId = book.id;
            
            const bookWithStorage = {
                ...book,
                storageMode: 'SYSTEM_GENERATED',
                telegramUrl: null,
                serverUrl: book.downloadUrl || `${BOT_URL}/api/file/books/${book.fileName}`,
                uploadedAt: Date.now(),
                isFree: true,
                publicUrl: `${BOT_URL}/api/file/books/${book.fileName}`
            };
            
            await db.ref(`books/${bookId}`).set(bookWithStorage);
            addedCount++;
            
            if (addedCount % 10 === 0) {
                console.log(`📚 Added ${addedCount}/${allBooks.length} books...`);
            }
        }
        
        isBooksInitialized = true;
        console.log(`✅ Successfully added ${addedCount} educational books to database`);
        
    } catch (error) {
        console.error('❌ Error initializing books database');
    }
}

function getAllEducationalBooks() {
    const allBooks = [];
    let bookCounter = 1;
    
    function createBook(grade, subject, title, description = '', pages = 100) {
        return {
            id: `book_${grade.replace(/\s+/g, '_')}_${subject.replace(/\s+/g, '_')}_${bookCounter++}`,
            title: title,
            author: 'وزارة التربية والتعليم السودانية',
            grade: grade,
            subject: subject,
            description: description || `${title} - المنهج السوداني للصف ${grade}`,
            year: 2024,
            pages: pages,
            fileName: `${grade.replace(/\s+/g, '_')}_${subject.replace(/\s+/g, '_')}.pdf`,
            fileSize: Math.floor(Math.random() * 5000000) + 1000000,
            uploadedBy: 'system',
            isFree: true,
            language: 'العربية',
            curriculum: 'المنهج السوداني',
            downloadUrl: `${BOT_URL}/api/file/books/${grade.replace(/\s+/g, '_')}_${subject.replace(/\s+/g, '_')}.pdf`
        };
    }

    const elementaryGrades = ['الأول الابتدائي', 'الثاني الابتدائي', 'الثالث الابتدائي', 'الرابع الابتدائي', 'الخامس الابتدائي', 'السادس الابتدائي'];
    const elementarySubjects = ['الرياضيات', 'اللغة العربية', 'العلوم', 'التربية الإسلامية', 'الاجتماعيات', 'اللغة الإنجليزية'];

    const intermediateGrades = ['الأول المتوسط', 'الثاني المتوسط', 'الثالث المتوسط'];
    const intermediateSubjects = ['الرياضيات', 'العلوم', 'اللغة العربية', 'اللغة الإنجليزية', 'الاجتماعيات', 'التربية الإسلامية', 'الحاسوب'];

    const secondaryGrades = ['الأول الثانوي', 'الثاني الثانوي', 'الثالث الثانوي'];
    const secondarySubjects = ['الرياضيات', 'الفيزياء', 'الكيمياء', 'الأحياء', 'اللغة العربية', 'اللغة الإنجليزية', 'التاريخ', 'الجغرافيا', 'الفلسفة'];

    for (const grade of elementaryGrades) {
        for (const subject of elementarySubjects) {
            allBooks.push(createBook(grade, subject, `${subject} للصف ${grade}`, `${subject} للمرحلة الابتدائية`, 80));
        }
    }

    for (const grade of intermediateGrades) {
        for (const subject of intermediateSubjects) {
            allBooks.push(createBook(grade, subject, `${subject} للصف ${grade}`, `${subject} للمرحلة المتوسطة`, 120));
        }
    }

    for (const grade of secondaryGrades) {
        for (const subject of secondarySubjects) {
            allBooks.push(createBook(grade, subject, `${subject} للصف ${grade}`, `${subject} للمرحلة الثانوية`, 150));
        }
    }

    const aiBooks = [
        createBook('جميع المراحل', 'تعليم الذكاء الاصطناعي', 'مقدمة في الذكاء الاصطناعي للطلاب', 'كتاب تعليمي مبسط عن الذكاء الاصطناعي', 60),
        createBook('الثانوي', 'البرمجة', 'أساسيات البرمجة بلغة بايثون', 'تعلم البرمجة من الصفر', 90),
        createBook('المتوسط', 'المهارات الرقمية', 'المهارات الرقمية للطلاب', 'تنمية المهارات الرقمية', 70)
    ];
    
    return [...allBooks, ...aiBooks];
}

// ==================== [ Socket.IO للبث المباشر ] ====================
io.on('connection', (socket) => {
    console.log('👤 User connected:', socket.id);
    
    // إنشاء جلسة للمستخدم
    userSessions.set(socket.id, {
        userId: null,
        userName: null,
        roomId: null,
        lastActivity: Date.now()
    });

    socket.on('join-room', (roomData) => {
        const { roomId, userId, userName, role } = roomData;
        
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userId = userId;
        socket.userName = userName;
        
        // تحديث الجلسة
        const session = userSessions.get(socket.id);
        if (session) {
            session.userId = userId;
            session.userName = userName;
            session.roomId = roomId;
            session.lastActivity = Date.now();
        }
        
        if (!liveRooms.has(roomId)) {
            liveRooms.set(roomId, {
                id: roomId,
                participants: new Map(),
                teacherId: role === 'teacher' ? userId : null,
                isRecording: false,
                createdAt: Date.now(),
                lastActivity: Date.now()
            });
        }
        
        const room = liveRooms.get(roomId);
        room.participants.set(userId, { userName, role, socketId: socket.id });
        room.lastActivity = Date.now();
        
        socket.to(roomId).emit('participant-joined', { userId, userName, role });
        
        socket.emit('room-info', {
            participants: Array.from(room.participants.entries()).map(([id, data]) => ({
                userId: id,
                userName: data.userName,
                role: data.role
            })),
            isRecording: room.isRecording,
            roomId: roomId,
            serverUrl: BOT_URL
        });
        
        console.log(`🚪 ${userName} joined room ${roomId}`);
        
        if (isFirebaseInitialized) {
            try {
                const db = admin.database();
                db.ref(`live_rooms/${roomId}/participants/${userId}`).set({
                    userName,
                    role,
                    joinedAt: Date.now(),
                    socketId: socket.id
                });
                
                // تحديث آخر نشاط
                db.ref(`live_rooms/${roomId}`).update({
                    lastActivity: Date.now(),
                    participantCount: room.participants.size
                });
            } catch (error) {
                console.error('Error updating Firebase');
            }
        }
    });

    socket.on('signal', (data) => {
        socket.to(data.target).emit('signal', {
            from: socket.userId,
            signal: data.signal,
            serverUrl: BOT_URL
        });
    });

    socket.on('chat-message', (data) => {
        const { roomId, message } = data;
        const chatMessage = {
            from: socket.userId,
            fromName: socket.userName,
            message,
            timestamp: Date.now(),
            serverUrl: BOT_URL
        };
        
        io.to(roomId).emit('chat-message', chatMessage);
        
        if (isFirebaseInitialized && roomId) {
            try {
                const db = admin.database();
                const messageId = `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
                db.ref(`live_chats/${roomId}/${messageId}`).set(chatMessage);
            } catch (error) {
                console.error('Error saving chat message');
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
                        userId: socket.userId,
                        serverUrl: BOT_URL
                    });
                }
            }
        }
        
        // حذف الجلسة
        userSessions.delete(socket.id);
        
        console.log('👋 User disconnected:', socket.id);
    });
});

// ==================== [ نظام الاشتراكات والدفع ] ====================
async function checkSubscription(userId) {
    if (!isFirebaseInitialized) {
        return { 
            hasAccess: true, 
            isTrial: true, 
            remainingDays: CONFIG.FREE_TRIAL_DAYS,
            dailyLimit: CONFIG.MAX_DAILY_QUESTIONS.trial,
            type: 'trial',
            status: 'active',
            serverUrl: BOT_URL
        };
    }

    try {
        const db = admin.database();
        const userRef = await db.ref(`users/${userId}`).once('value');
        let userData = userRef.val() || {};
        
        if (!userData.subscription) {
            const trialEnd = Date.now() + (CONFIG.FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000);
            const subscriptionData = {
                type: 'trial',
                startDate: Date.now(),
                endDate: trialEnd,
                status: 'active',
                paymentStatus: 'free_trial',
                serverUrl: BOT_URL
            };
            
            await db.ref(`users/${userId}/subscription`).set(subscriptionData);
            
            userData.subscription = subscriptionData;
            userData.createdAt = userData.createdAt || Date.now();
            
            await db.ref(`users/${userId}`).update({
                createdAt: userData.createdAt,
                lastActive: Date.now(),
                serverUrl: BOT_URL
            });
            
            console.log(`🎁 Started free trial for user: ${userId}`);
            
            return {
                hasAccess: true,
                isTrial: true,
                remainingDays: CONFIG.FREE_TRIAL_DAYS,
                dailyLimit: CONFIG.MAX_DAILY_QUESTIONS.trial,
                type: 'trial',
                status: 'active',
                startDate: new Date(subscriptionData.startDate).toLocaleDateString('ar-SA'),
                endDate: new Date(trialEnd).toLocaleDateString('ar-SA'),
                serverUrl: BOT_URL
            };
        }

        const subscription = userData.subscription;
        const now = Date.now();
        
        const remainingDays = Math.max(0, Math.ceil((subscription.endDate - now) / (24 * 60 * 60 * 1000)));
        
        let isActive = subscription.status === 'active' && subscription.endDate > now;
        
        let dailyLimit = CONFIG.MAX_DAILY_QUESTIONS.free;
        if (subscription.type === 'trial') {
            dailyLimit = CONFIG.MAX_DAILY_QUESTIONS.trial;
        } else if (subscription.type === 'paid' && isActive) {
            dailyLimit = CONFIG.MAX_DAILY_QUESTIONS.paid;
        }
        
        await db.ref(`users/${userId}/lastActive`).set(Date.now());

        return {
            hasAccess: isActive,
            isTrial: subscription.type === 'trial',
            remainingDays: remainingDays,
            dailyLimit: dailyLimit,
            type: subscription.type,
            status: subscription.status,
            paymentStatus: subscription.paymentStatus || 'pending',
            startDate: new Date(subscription.startDate).toLocaleDateString('ar-SA'),
            endDate: new Date(subscription.endDate).toLocaleDateString('ar-SA'),
            paymentMethod: subscription.paymentMethod,
            transactionId: subscription.transactionId,
            serverUrl: BOT_URL
        };

    } catch (error) {
        console.error('Error checking subscription');
        return { 
            hasAccess: true, 
            isTrial: true, 
            remainingDays: CONFIG.FREE_TRIAL_DAYS,
            dailyLimit: CONFIG.MAX_DAILY_QUESTIONS.trial,
            type: 'trial',
            status: 'active',
            serverUrl: BOT_URL
        };
    }
}

async function checkDailyUsage(userId) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const dailyKey = `daily_usage_${userId}_${today}`;
        
        if (!isFirebaseInitialized) {
            return { used: 0, limit: CONFIG.MAX_DAILY_QUESTIONS.trial, remaining: CONFIG.MAX_DAILY_QUESTIONS.trial, serverUrl: BOT_URL };
        }
        
        const db = admin.database();
        const usageRef = await db.ref(`usage/${dailyKey}`).once('value');
        const usage = usageRef.val() || { count: 0 };
        
        const subscription = await checkSubscription(userId);
        const limit = subscription.dailyLimit || CONFIG.MAX_DAILY_QUESTIONS.free;
        const remaining = Math.max(0, limit - usage.count);
        
        return {
            used: usage.count,
            limit: limit,
            remaining: remaining,
            canAsk: remaining > 0,
            serverUrl: BOT_URL
        };
        
    } catch (error) {
        console.error('Error checking daily usage');
        return { used: 0, limit: 50, remaining: 50, canAsk: true, serverUrl: BOT_URL };
    }
}

async function updateDailyUsage(userId) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const dailyKey = `daily_usage_${userId}_${today}`;
        
        if (isFirebaseInitialized) {
            const db = admin.database();
            const usageRef = db.ref(`usage/${dailyKey}`);
            const snapshot = await usageRef.once('value');
            const current = snapshot.val() || { count: 0, userId: userId };
            
            await usageRef.set({
                count: current.count + 1,
                userId: userId,
                lastUsed: Date.now(),
                date: today,
                serverUrl: BOT_URL
            });
        }
    } catch (error) {
        console.error('Error updating daily usage');
    }
}

async function createPaymentRequest(userData) {
    try {
        const { userId, userName, phone, amount, paymentMethod, transactionId, screenshotUrl } = userData;
        const paymentId = `pay_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        
        const paymentData = {
            id: paymentId,
            userId,
            userName: userName || `user_${userId.substring(0, 8)}`,
            phone: phone || 'غير معروف',
            amount: parseInt(amount),
            paymentMethod,
            transactionId,
            screenshotUrl,
            status: 'pending',
            adminApproved: false,
            adminId: null,
            adminNote: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            serverUrl: BOT_URL
        };
        
        if (isFirebaseInitialized) {
            const db = admin.database();
            await db.ref(`payments/${paymentId}`).set(paymentData);
            await db.ref(`users/${userId}/lastPayment`).set({
                paymentId,
                amount,
                status: 'pending',
                date: Date.now(),
                serverUrl: BOT_URL
            });
            
            console.log(`💰 Payment request created: ${paymentId} for user ${userId}`);
            
            await notifyAdminAboutPayment(paymentData);
        }
        
        return { success: true, paymentId, ...paymentData };
        
    } catch (error) {
        console.error('Error creating payment request');
        return { success: false, error: error.message };
    }
}

async function notifyAdminAboutPayment(paymentData) {
    try {
        if (!telegramBot || !CONFIG.TELEGRAM_ADMIN_CHAT_ID) {
            console.log('⚠️ Telegram bot not available for admin notifications');
            return false;
        }
        
        const message = `
💰 **طلب دفع جديد يحتاج موافقة**

👤 **المستخدم:** ${paymentData.userName}
📞 **الهاتف:** ${paymentData.phone}
🆔 **رقم المستخدم:** ${paymentData.userId}

💳 **بيانات الدفع:**
• المبلغ: ${paymentData.amount} SDG
• طريقة الدفع: ${paymentData.paymentMethod}
• رقم المعاملة: ${paymentData.transactionId}
• الوقت: ${new Date(paymentData.createdAt).toLocaleString('ar-SA')}
• الرابط: ${BOT_URL}

🆔 **رقم الطلب:** ${paymentData.id}

📸 **إيصال الدفع:** ${paymentData.screenshotUrl || 'لم يرفع'}

✅ **للموافقة:** /approve_${paymentData.id}
❌ **للرفض:** /reject_${paymentData.id}

🔍 **لعرض التفاصيل:** /payment_${paymentData.id}
        `;
        
        await telegramBot.telegram.sendMessage(CONFIG.TELEGRAM_ADMIN_CHAT_ID, message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "✅ الموافقة", callback_data: `approve_${paymentData.id}` },
                        { text: "❌ الرفض", callback_data: `reject_${paymentData.id}` }
                    ],
                    [
                        { text: "👤 عرض الملف", callback_data: `user_${paymentData.userId}` },
                        { text: "🌐 زيارة المنصة", url: BOT_URL }
                    ]
                ]
            }
        });
        
        console.log(`📨 Payment notification sent to admin for ${paymentData.id}`);
        return true;
        
    } catch (error) {
        console.error('Error notifying admin');
        return false;
    }
}

async function approvePayment(paymentId, adminId, note = '') {
    try {
        if (!isFirebaseInitialized) {
            return { success: false, error: 'Firebase not initialized' };
        }
        
        const db = admin.database();
        const paymentRef = await db.ref(`payments/${paymentId}`).once('value');
        const payment = paymentRef.val();
        
        if (!payment) {
            return { success: false, error: 'Payment not found' };
        }
        
        if (payment.status !== 'pending') {
            return { success: false, error: `Payment already ${payment.status}` };
        }
        
        const userId = payment.userId;
        
        let subscriptionDays = 0;
        let subscriptionType = 'weekly';
        
        if (payment.amount >= CONFIG.TEACHER_MONTHLY_FEE) {
            subscriptionDays = 30;
            subscriptionType = 'teacher_monthly';
        } else if (payment.amount >= CONFIG.MONTHLY_SUBSCRIPTION) {
            subscriptionDays = 30;
            subscriptionType = 'monthly';
        } else if (payment.amount >= CONFIG.WEEKLY_SUBSCRIPTION) {
            subscriptionDays = 7;
            subscriptionType = 'weekly';
        } else {
            return { success: false, error: 'المبلغ غير كافي لأي اشتراك' };
        }
        
        const endDate = Date.now() + (subscriptionDays * 24 * 60 * 60 * 1000);
        
        await db.ref(`payments/${paymentId}`).update({
            status: 'approved',
            adminApproved: true,
            adminId: adminId,
            adminNote: note || 'تمت الموافقة',
            approvedAt: Date.now(),
            updatedAt: Date.now(),
            subscriptionDays: subscriptionDays,
            subscriptionType: subscriptionType,
            endDate: endDate,
            serverUrl: BOT_URL
        });
        
        await db.ref(`users/${userId}/subscription`).set({
            type: subscriptionType,
            startDate: Date.now(),
            endDate: endDate,
            status: 'active',
            paymentStatus: 'paid',
            paymentId: paymentId,
            paymentMethod: payment.paymentMethod,
            transactionId: payment.transactionId,
            amount: payment.amount,
            adminApproved: true,
            adminId: adminId,
            serverUrl: BOT_URL
        });
        
        await notifyUserAboutPaymentApproval(userId, paymentId, subscriptionDays);
        
        console.log(`✅ Payment approved: ${paymentId} for user ${userId}, ${subscriptionDays} days`);
        
        return {
            success: true,
            paymentId,
            userId,
            subscriptionDays,
            subscriptionType,
            endDate: new Date(endDate).toLocaleDateString('ar-SA'),
            message: 'تمت الموافقة على الدفع وتفعيل الاشتراك',
            serverUrl: BOT_URL
        };
        
    } catch (error) {
        console.error('Error approving payment');
        return { success: false, error: error.message };
    }
}

async function rejectPayment(paymentId, adminId, reason = '') {
    try {
        if (!isFirebaseInitialized) {
            return { success: false, error: 'Firebase not initialized' };
        }
        
        const db = admin.database();
        const paymentRef = await db.ref(`payments/${paymentId}`).once('value');
        const payment = paymentRef.val();
        
        if (!payment) {
            return { success: false, error: 'Payment not found' };
        }
        
        await db.ref(`payments/${paymentId}`).update({
            status: 'rejected',
            adminApproved: false,
            adminId: adminId,
            adminNote: reason || 'مرفوض',
            rejectedAt: Date.now(),
            updatedAt: Date.now(),
            serverUrl: BOT_URL
        });
        
        await notifyUserAboutPaymentRejection(payment.userId, paymentId, reason);
        
        console.log(`❌ Payment rejected: ${paymentId}, reason: ${reason}`);
        
        return { success: true, paymentId, message: 'تم رفض الدفع', serverUrl: BOT_URL };
        
    } catch (error) {
        console.error('Error rejecting payment');
        return { success: false, error: error.message };
    }
}

async function notifyUserAboutPaymentApproval(userId, paymentId, days) {
    try {
        if (!isFirebaseInitialized) return;
        
        const db = admin.database();
        const userRef = await db.ref(`users/${userId}`).once('value');
        const user = userRef.val();
        
        const message = `
🎉 **تمت الموافقة على دفعتك!**

✅ **تم تفعيل اشتراكك بنجاح**
📅 **مدة الاشتراك:** ${days} يوم
🆔 **رقم المعاملة:** ${paymentId}
⏰ **وقت الموافقة:** ${new Date().toLocaleString('ar-SA')}
🔗 **المنصة:** ${BOT_URL}

📚 **مميزات الاشتراك:**
• ${CONFIG.MAX_DAILY_QUESTIONS.paid} سؤال يومي
• وصول كامل للمكتبة
• بث مباشر غير محدود
• دعم فني مميز

شكراً لثقتك بمنصتنا التعليمية! 🚀
        `;
        
        const notificationId = `notif_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        await db.ref(`notifications/${userId}/${notificationId}`).set({
            id: notificationId,
            type: 'payment_approved',
            title: 'تمت الموافقة على الدفع',
            message: message,
            paymentId: paymentId,
            read: false,
            createdAt: Date.now(),
            serverUrl: BOT_URL
        });
        
        if (telegramBot && user && user.telegramId) {
            try {
                await telegramBot.telegram.sendMessage(user.telegramId, message, {
                    parse_mode: 'Markdown'
                });
            } catch (tgError) {
                console.log('Could not send Telegram notification');
            }
        }
        
    } catch (error) {
        console.error('Error notifying user');
    }
}

async function notifyUserAboutPaymentRejection(userId, paymentId, reason) {
    try {
        if (!isFirebaseInitialized) return;
        
        const db = admin.database();
        
        const message = `
❌ **تم رفض دفعتك**

📌 **السبب:** ${reason || 'غير محدد'}
🆔 **رقم المعاملة:** ${paymentId}
⏰ **وقت الرفض:** ${new Date().toLocaleString('ar-SA')}
🔗 **المنصة:** ${BOT_URL}

⚠️ **إذا كنت تعتقد أن هذا خطأ، يرجى:**
1. التحقق من رقم المعاملة
2. التأكد من صورة الإيصال
3. التواصل مع الدعم الفني

للإعادة المحاولة، أرسل دفعة جديدة مع التأكد من:
• صحة رقم الحساب
• وضوح صورة الإيصال
• مطابقة المبلغ
        `;
        
        const notificationId = `notif_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        await db.ref(`notifications/${userId}/${notificationId}`).set({
            id: notificationId,
            type: 'payment_rejected',
            title: 'تم رفض الدفع',
            message: message,
            paymentId: paymentId,
            reason: reason,
            read: false,
            createdAt: Date.now(),
            serverUrl: BOT_URL
        });
        
    } catch (error) {
        console.error('Error notifying user about rejection');
    }
}

// ==================== [ دوال AI ] ====================
async function askDeepSeek(question, subject, grade) {
    try {
        const context = subject && grade ? 
            `السؤال في مادة ${subject} للصف ${grade}.` : 
            'هذا سؤال تعليمي عام.';
        
        const prompt = `أنت مساعد تعليمي عربي ذكي في منصة تعليمية.
        
        ${context}
        
        السؤال: ${question}
        
        قدم إجابة تعليمية واضحة ودقيقة.`;
        
        const response = await deepseekClient.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { 
                    role: "system", 
                    content: "أنت مساعد تعليمي عربي ذكي في منصة تعليمية. هدفك مساعدة الطلاب في فهم المواد التعليمية وإجابة أسئلتهم بدقة ووضوح." 
                },
                { role: "user", content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 1500
        });
        
        return {
            answer: response.choices[0].message.content,
            isEducational: true,
            subject: subject || 'عام',
            grade: grade || 'جميع المراحل',
            source: 'deepseek',
            serverUrl: BOT_URL
        };
        
    } catch (error) {
        console.error('DeepSeek ask error');
        throw error;
    }
}

// ==================== [ نقاط النهاية الرئيسية ] ====================
app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: '✅ Server is running!', 
        time: new Date().toISOString(),
        server: 'Smart Education Platform v4.0',
        baseUrl: BOT_URL,
        features: ['DeepSeek AI', 'Subscription System', 'Live Streaming', 'Digital Library', 'Payment System'],
        status: 'active',
        version: '4.0.0'
    });
});

app.get('/health', (req, res) => {
    const activeUsers = Array.from(liveRooms.values()).reduce((acc, room) => acc + room.participants.size, 0);
    const activeRooms = liveRooms.size;
    const storageUsage = Array.from(uploadedFiles.values()).reduce((acc, file) => acc + (file.size || 0), 0);
    
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        baseUrl: BOT_URL,
        server: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            platform: process.platform,
            node: process.version
        },
        services: {
            server: '✅ Running',
            telegram: telegramBot ? '✅ Connected' : '❌ Disconnected',
            firebase: isFirebaseInitialized ? '✅ Connected' : '❌ Disconnected',
            deepseek: deepseekClient ? '✅ Connected' : '❌ Disconnected'
        },
        stats: {
            activeUsers: activeUsers,
            activeRooms: activeRooms,
            uploadedFiles: uploadedFiles.size,
            storageUsage: `${(storageUsage / 1024 / 1024).toFixed(2)} MB`,
            userSessions: userSessions.size
        }
    });
});

// ==================== [ نقاط نهاية نظام الاشتراكات ] ====================
app.get('/api/subscription/status/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const subscription = await checkSubscription(userId);
        const usage = await checkDailyUsage(userId);
        
        res.json({
            success: true,
            userId,
            subscription,
            usage,
            pricing: {
                freeTrial: `${CONFIG.FREE_TRIAL_DAYS} يوم مجاناً`,
                weekly: `${CONFIG.WEEKLY_SUBSCRIPTION} SDG (أسبوع)`,
                monthly: `${CONFIG.MONTHLY_SUBSCRIPTION} SDG (شهر)`,
                teacherMonthly: `${CONFIG.TEACHER_MONTHLY_FEE} SDG (معلم/شهر)`,
                paymentMethods: CONFIG.PAYMENT_METHODS,
                adminAccount: CONFIG.ADMIN_BANK_ACCOUNT,
                adminName: CONFIG.ADMIN_NAME,
                adminPhone: CONFIG.ADMIN_PHONE
            },
            serverUrl: BOT_URL,
            apiVersion: '1.0'
        });
        
    } catch (error) {
        console.error('Subscription status error');
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في التحقق من الاشتراك',
            serverUrl: BOT_URL 
        });
    }
});

app.post('/api/payment/request', async (req, res) => {
    try {
        const { userId, userName, phone, amount, paymentMethod, transactionId, screenshotUrl } = req.body;
        
        if (!userId || !amount || !paymentMethod || !transactionId) {
            return res.status(400).json({ 
                success: false, 
                error: 'بيانات الدفع غير مكتملة. يلزم: userId, amount, paymentMethod, transactionId',
                serverUrl: BOT_URL 
            });
        }
        
        const minAmount = Math.min(
            CONFIG.WEEKLY_SUBSCRIPTION,
            CONFIG.MONTHLY_SUBSCRIPTION,
            CONFIG.TEACHER_MONTHLY_FEE
        );
        
        if (parseInt(amount) < minAmount) {
            return res.status(400).json({ 
                success: false, 
                error: `المبلغ غير كافي. الحد الأدنى: ${minAmount} SDG`,
                serverUrl: BOT_URL 
            });
        }
        
        if (!CONFIG.PAYMENT_METHODS.includes(paymentMethod)) {
            return res.status(400).json({ 
                success: false, 
                error: `طريقة دفع غير مدعومة. الاختيارات: ${CONFIG.PAYMENT_METHODS.join(', ')}`,
                serverUrl: BOT_URL 
            });
        }
        
        const result = await createPaymentRequest({
            userId, userName, phone, amount, paymentMethod, transactionId, screenshotUrl
        });
        
        if (result.success) {
            res.json({
                success: true,
                message: 'تم إنشاء طلب الدفع بنجاح وتم إرساله للأدمن للموافقة',
                paymentId: result.paymentId,
                status: 'pending',
                note: 'سيتم تفعيل اشتراكك بعد موافقة الأدمن على الدفع',
                serverUrl: BOT_URL
            });
        } else {
            res.status(500).json({ 
                success: false, 
                error: result.error,
                serverUrl: BOT_URL 
            });
        }
        
    } catch (error) {
        console.error('Payment request error');
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في إنشاء طلب الدفع',
            serverUrl: BOT_URL 
        });
    }
});

app.get('/api/payment/status/:paymentId', async (req, res) => {
    try {
        const { paymentId } = req.params;
        
        if (!isFirebaseInitialized) {
            return res.json({ 
                success: true, 
                paymentId,
                status: 'unknown',
                note: 'Firebase not connected',
                serverUrl: BOT_URL
            });
        }
        
        const db = admin.database();
        const paymentRef = await db.ref(`payments/${paymentId}`).once('value');
        const payment = paymentRef.val();
        
        if (!payment) {
            return res.status(404).json({ 
                success: false, 
                error: 'طلب الدفع غير موجود',
                serverUrl: BOT_URL 
            });
        }
        
        res.json({
            success: true,
            payment,
            humanStatus: payment.status === 'pending' ? 'بانتظار موافقة الأدمن' : 
                        payment.status === 'approved' ? 'مقبول ومفعل' : 'مرفوض',
            serverUrl: BOT_URL
        });
        
    } catch (error) {
        console.error('Payment status error');
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في التحقق من حالة الدفع',
            serverUrl: BOT_URL 
        });
    }
});

app.post('/api/ai/ask', async (req, res) => {
    try {
        const { userId, question, subject, grade } = req.body;
        
        if (!question) {
            return res.status(400).json({ 
                success: false, 
                error: 'السؤال مطلوب',
                serverUrl: BOT_URL 
            });
        }
        
        // التحقق من الاشتراك
        if (userId) {
            const subscription = await checkSubscription(userId);
            if (!subscription.hasAccess) {
                return res.status(403).json({
                    success: false,
                    error: 'اشتراكك منتهي. يرجى تجديد الاشتراك.',
                    subscriptionStatus: subscription,
                    serverUrl: BOT_URL
                });
            }
            
            // التحقق من الاستخدام اليومي
            const usage = await checkDailyUsage(userId);
            if (!usage.canAsk) {
                return res.status(429).json({
                    success: false,
                    error: `تجاوزت الحد اليومي (${usage.limit} سؤال). يتبقى ${usage.remaining} سؤال اليوم.`,
                    usage,
                    serverUrl: BOT_URL
                });
            }
            
            // تحديث الاستخدام
            await updateDailyUsage(userId);
        }
        
        let response;
        
        if (deepseekClient) {
            response = await askDeepSeek(question, subject, grade);
        } else {
            response = {
                answer: `أنا مساعد DeepSeek التعليمي. حالياً أنا في وضع التجربة. يمكنني الإجابة على أسئلتك التعليمية في مختلف المجالات.\n\n🔗 ${BOT_URL}`,
                isEducational: true,
                subject: subject || 'عام',
                grade: grade || 'جميع المراحل',
                source: 'mock',
                serverUrl: BOT_URL
            };
        }
        
        res.json({
            success: true,
            question: question,
            answer: response.answer,
            metadata: {
                subject: response.subject,
                grade: response.grade,
                isEducational: response.isEducational,
                aiProvider: deepseekClient ? 'DeepSeek' : 'Mock',
                userId: userId,
                timestamp: new Date().toISOString(),
                serverUrl: BOT_URL
            }
        });
        
    } catch (error) {
        console.error('Error in AI ask');
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ في معالجة السؤال',
            serverUrl: BOT_URL 
        });
    }
});

// ==================== [ نقاط نهاية الملفات والكتب ] ====================
app.post('/api/upload/dual/:folder', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                error: 'No file uploaded',
                serverUrl: BOT_URL 
            });
        }
        
        const folder = req.params.folder || 'images';
        const { originalname, path: tempPath, size } = req.file;
        
        const fileBuffer = await fs.readFile(tempPath);
        const uniqueId = crypto.randomBytes(8).toString('hex');
        const ext = path.extname(originalname);
        const fileName = `${Date.now()}_${uniqueId}${ext}`;
        
        console.log(`📤 Uploading: ${originalname} (${(size/1024/1024).toFixed(2)}MB)`);
        
        const uploadResult = await uploadToBoth(fileBuffer, fileName, folder, originalname);
        
        let bookInfo = null;
        if (folder === 'books' && ext.toLowerCase() === '.pdf') {
            const pdfInfo = await extractPDFInfo(uploadResult.localPath);
            bookInfo = {
                title: req.body.title || originalname.replace(ext, ''),
                author: req.body.author || 'غير معروف',
                grade: req.body.grade || 'عام',
                subject: req.body.subject || 'عام',
                description: req.body.description || '',
                pages: pdfInfo.pages,
                hasText: pdfInfo.hasText,
                optimized: pdfInfo.optimized
            };
        }
        
        const fileInfo = {
            ...uploadResult,
            originalName: originalname,
            folder: folder,
            size: size,
            uploadedBy: req.body.uploadedBy || 'anonymous',
            uploadedAt: Date.now(),
            bookInfo: bookInfo
        };
        
        const savedMetadata = await storeFileMetadata(fileInfo);
        
        try {
            await fs.unlink(tempPath);
        } catch (error) {
            console.warn('Could not delete temp file');
        }
        
        res.json({
            success: true,
            message: 'File uploaded successfully',
            file: {
                id: savedMetadata.firebaseId || uploadResult.fileName,
                originalName: originalname,
                fileName: uploadResult.fileName,
                size: size,
                telegramUrl: uploadResult.telegramUrl,
                serverUrl: uploadResult.serverUrl,
                publicUrl: uploadResult.publicUrl,
                storageMode: uploadResult.storageMode,
                uploadedAt: new Date(uploadResult.uploadedAt).toISOString(),
                serverUrl: BOT_URL
            }
        });
        
    } catch (error) {
        console.error('❌ Upload error');
        
        if (req.file && req.file.path) {
            try {
                await fs.unlink(req.file.path);
            } catch (cleanupError) {
                console.warn('Could not cleanup temp file');
            }
        }
        
        res.status(500).json({ 
            success: false, 
            error: error.message,
            serverUrl: BOT_URL
        });
    }
});

app.get('/api/books', async (req, res) => {
    try {
        const { grade, subject, search, page = 1, limit = 20 } = req.query;
        
        let books = [];
        
        if (isFirebaseInitialized) {
            const db = admin.database();
            const snapshot = await db.ref('books').once('value');
            const allBooks = snapshot.val() || {};
            
            books = Object.entries(allBooks).map(([id, book]) => ({
                id,
                ...book,
                downloadUrl: `${BOT_URL}/api/file/books/${book.fileName}`,
                publicUrl: `${BOT_URL}/api/file/books/${book.fileName}`
            }));
        } else {
            books = getAllEducationalBooks().map(book => ({
                ...book,
                downloadUrl: `${BOT_URL}/api/file/books/${book.fileName}`,
                publicUrl: `${BOT_URL}/api/file/books/${book.fileName}`
            }));
        }
        
        let filteredBooks = books;
        
        if (grade) {
            filteredBooks = filteredBooks.filter(book => book.grade.includes(grade));
        }
        
        if (subject) {
            filteredBooks = filteredBooks.filter(book => book.subject.includes(subject));
        }
        
        if (search) {
            const searchLower = search.toLowerCase();
            filteredBooks = filteredBooks.filter(book => 
                book.title.toLowerCase().includes(searchLower) ||
                book.subject.toLowerCase().includes(searchLower)
            );
        }
        
        const total = filteredBooks.length;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const startIndex = (pageNum - 1) * limitNum;
        const endIndex = startIndex + limitNum;
        const paginatedBooks = filteredBooks.slice(startIndex, endIndex);
        
        res.json({ 
            success: true, 
            books: paginatedBooks,
            stats: {
                totalBooks: total,
                showing: paginatedBooks.length,
                page: pageNum,
                totalPages: Math.ceil(total / limitNum),
                serverUrl: BOT_URL
            }
        });
        
    } catch (error) {
        console.error('Error fetching books');
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch books',
            serverUrl: BOT_URL 
        });
    }
});

app.get('/api/file/:folder/:filename', async (req, res) => {
    try {
        const { folder, filename } = req.params;
        const filePath = path.join(STORAGE_BASE, folder, filename);
        
        try {
            await fs.access(filePath);
        } catch (error) {
            return res.status(404).json({ 
                success: false, 
                error: 'File not found on server',
                serverUrl: BOT_URL
            });
        }
        
        res.download(filePath, filename, (err) => {
            if (err) {
                console.error('Download error');
                if (!res.headersSent) {
                    res.status(500).json({ 
                        success: false, 
                        error: 'Download failed',
                        serverUrl: BOT_URL 
                    });
                }
            }
        });
        
    } catch (error) {
        console.error('File serve error');
        res.status(500).json({ 
            success: false, 
            error: 'Failed to serve file',
            serverUrl: BOT_URL 
        });
    }
});

app.get('/api/live/rooms', (req, res) => {
    const rooms = Array.from(liveRooms.values()).map(room => ({
        id: room.id,
        participants: Array.from(room.participants.entries()).map(([id, data]) => ({
            userId: id,
            userName: data.userName,
            role: data.role
        })),
        teacherId: room.teacherId,
        isRecording: room.isRecording,
        createdAt: new Date(room.createdAt).toISOString(),
        lastActivity: new Date(room.lastActivity).toISOString(),
        active: room.participants.size > 0,
        participantCount: room.participants.size,
        serverUrl: BOT_URL
    }));
    
    res.json({ 
        success: true, 
        rooms,
        stats: {
            totalRooms: rooms.length,
            activeRooms: rooms.filter(r => r.active).length,
            totalParticipants: rooms.reduce((acc, room) => acc + room.participantCount, 0),
            serverUrl: BOT_URL
        }
    });
});

app.get('/api/stats', (req, res) => {
    const stats = {
        server: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            platform: process.platform,
            node: process.version
        },
        services: {
            telegram: !!telegramBot,
            firebase: isFirebaseInitialized,
            deepseek: !!deepseekClient,
            booksInitialized: isBooksInitialized
        },
        live: {
            activeRooms: liveRooms.size,
            totalParticipants: Array.from(liveRooms.values()).reduce((acc, room) => acc + room.participants.size, 0),
            userSessions: userSessions.size
        },
        storage: {
            uploadedFiles: uploadedFiles.size,
            folders: Object.values(FOLDERS)
        },
        config: {
            freeTrialDays: CONFIG.FREE_TRIAL_DAYS,
            subscriptionTypes: ['weekly', 'monthly', 'teacher_monthly'],
            paymentMethods: CONFIG.PAYMENT_METHODS,
            maxFileSize: `${CONFIG.MAX_FILE_SIZE / 1024 / 1024} MB`
        },
        urls: {
            server: BOT_URL,
            apiDocs: `${BOT_URL}`
        }
    };
    
    res.json({ success: true, stats });
});

// ==================== [ نقطة نهاية root للوصول ] ====================
app.get('/', (req, res) => {
    const stats = {
        activeRooms: liveRooms.size,
        totalParticipants: Array.from(liveRooms.values()).reduce((acc, room) => acc + room.participants.size, 0),
        uploadedFiles: uploadedFiles.size,
        booksCount: getAllEducationalBooks().length
    };
    
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Smart Education Platform - منصة التعليم الذكي</title>
            <style>
                :root {
                    --primary: #4361ee;
                    --secondary: #3a0ca3;
                    --accent: #7209b7;
                    --success: #4cc9f0;
                    --light: #f8f9fa;
                    --dark: #212529;
                    --gradient: linear-gradient(135deg, #4361ee 0%, #3a0ca3 50%, #7209b7 100%);
                }
                
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                }
                
                body {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    min-height: 100vh;
                    padding: 20px;
                }
                
                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                    background: rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(10px);
                    border-radius: 20px;
                    padding: 40px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                }
                
                header {
                    text-align: center;
                    margin-bottom: 40px;
                    padding-bottom: 20px;
                    border-bottom: 2px solid rgba(255, 255, 255, 0.2);
                }
                
                h1 {
                    font-size: 3rem;
                    margin-bottom: 10px;
                    background: var(--gradient);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                }
                
                .subtitle {
                    font-size: 1.2rem;
                    opacity: 0.9;
                    margin-bottom: 30px;
                }
                
                .url-display {
                    background: rgba(0, 0, 0, 0.3);
                    padding: 15px;
                    border-radius: 10px;
                    margin: 20px 0;
                    word-break: break-all;
                    font-family: monospace;
                    border-left: 4px solid var(--success);
                }
                
                .status-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 20px;
                    margin: 30px 0;
                }
                
                .status-card {
                    background: rgba(255, 255, 255, 0.1);
                    padding: 25px;
                    border-radius: 15px;
                    text-align: center;
                    transition: transform 0.3s;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                }
                
                .status-card:hover {
                    transform: translateY(-5px);
                    background: rgba(255, 255, 255, 0.15);
                }
                
                .status-card i {
                    font-size: 2.5rem;
                    margin-bottom: 15px;
                }
                
                .status-card h3 {
                    margin-bottom: 10px;
                    color: var(--success);
                }
                
                .status-badge {
                    display: inline-block;
                    padding: 5px 15px;
                    border-radius: 20px;
                    font-size: 0.9rem;
                    margin-top: 10px;
                }
                
                .status-online {
                    background: rgba(76, 201, 240, 0.2);
                    color: var(--success);
                    border: 1px solid var(--success);
                }
                
                .status-offline {
                    background: rgba(220, 53, 69, 0.2);
                    color: #dc3545;
                    border: 1px solid #dc3545;
                }
                
                .features {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 20px;
                    margin: 40px 0;
                }
                
                .feature-item {
                    background: rgba(255, 255, 255, 0.05);
                    padding: 20px;
                    border-radius: 10px;
                    text-align: center;
                }
                
                .btn-container {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 15px;
                    justify-content: center;
                    margin: 40px 0;
                }
                
                .btn {
                    padding: 12px 30px;
                    border-radius: 50px;
                    text-decoration: none;
                    font-weight: bold;
                    transition: all 0.3s;
                    display: inline-flex;
                    align-items: center;
                    gap: 10px;
                }
                
                .btn-primary {
                    background: var(--primary);
                    color: white;
                    border: 2px solid var(--primary);
                }
                
                .btn-primary:hover {
                    background: transparent;
                    color: var(--primary);
                }
                
                .btn-secondary {
                    background: transparent;
                    color: white;
                    border: 2px solid white;
                }
                
                .btn-secondary:hover {
                    background: white;
                    color: var(--dark);
                }
                
                .pricing-section {
                    background: rgba(0, 0, 0, 0.2);
                    padding: 30px;
                    border-radius: 15px;
                    margin: 40px 0;
                }
                
                .pricing-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 20px;
                    margin-top: 20px;
                }
                
                .pricing-card {
                    background: rgba(255, 255, 255, 0.1);
                    padding: 25px;
                    border-radius: 15px;
                    text-align: center;
                }
                
                .pricing-card.highlight {
                    background: var(--gradient);
                    transform: scale(1.05);
                }
                
                footer {
                    text-align: center;
                    margin-top: 50px;
                    padding-top: 20px;
                    border-top: 1px solid rgba(255, 255, 255, 0.2);
                    opacity: 0.8;
                }
                
                .contact-info {
                    background: rgba(0, 0, 0, 0.2);
                    padding: 20px;
                    border-radius: 10px;
                    margin: 20px 0;
                }
                
                @media (max-width: 768px) {
                    .container {
                        padding: 20px;
                    }
                    
                    h1 {
                        font-size: 2rem;
                    }
                    
                    .btn {
                        width: 100%;
                        justify-content: center;
                    }
                }
            </style>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        </head>
        <body>
            <div class="container">
                <header>
                    <h1><i class="fas fa-robot"></i> Smart Education Platform</h1>
                    <p class="subtitle">منصة التعليم الذكي مع DeepSeek AI - نظام متكامل للتعليم الإلكتروني</p>
                    
                    <div class="url-display">
                        <i class="fas fa-link"></i> <strong>Server URL:</strong> ${BOT_URL}
                    </div>
                </header>
                
                <div class="status-grid">
                    <div class="status-card">
                        <i class="fas fa-server"></i>
                        <h3>حالة السيرفر</h3>
                        <p>🟢 يعمل بنظام 24/7</p>
                        <span class="status-badge status-online">Online</span>
                    </div>
                    
                    <div class="status-card">
                        <i class="fas fa-brain"></i>
                        <h3>DeepSeek AI</h3>
                        <p>${deepseekClient ? '🟢 متصل' : '🔴 وضع التجربة'}</p>
                        <span class="status-badge ${deepseekClient ? 'status-online' : 'status-offline'}">
                            ${deepseekClient ? 'Connected' : 'Mock Mode'}
                        </span>
                    </div>
                    
                    <div class="status-card">
                        <i class="fab fa-telegram"></i>
                        <h3>Telegram Bot</h3>
                        <p>${telegramBot ? '🟢 نشط' : '🔴 غير متصل'}</p>
                        <span class="status-badge ${telegramBot ? 'status-online' : 'status-offline'}">
                            ${telegramBot ? 'Active' : 'Disabled'}
                        </span>
                    </div>
                    
                    <div class="status-card">
                        <i class="fas fa-database"></i>
                        <h3>Firebase Database</h3>
                        <p>${isFirebaseInitialized ? '🟢 متصل' : '🔴 غير متصل'}</p>
                        <span class="status-badge ${isFirebaseInitialized ? 'status-online' : 'status-offline'}">
                            ${isFirebaseInitialized ? 'Connected' : 'Disabled'}
                        </span>
                    </div>
                </div>
                
                <div class="features">
                    <div class="feature-item">
                        <i class="fas fa-book-reader"></i>
                        <h4>مكتبة الكتب</h4>
                        <p>${getAllEducationalBooks().length}+ كتاب تعليمي</p>
                    </div>
                    
                    <div class="feature-item">
                        <i class="fas fa-comments"></i>
                        <h4>مساعد ذكي</h4>
                        <p>DeepSeek AI للأسئلة التعليمية</p>
                    </div>
                    
                    <div class="feature-item">
                        <i class="fas fa-video"></i>
                        <h4>بث مباشر</h4>
                        <p>${liveRooms.size} غرفة نشطة</p>
                    </div>
                    
                    <div class="feature-item">
                        <i class="fas fa-credit-card"></i>
                        <h4>نظام دفع</h4>
                        <p>${CONFIG.PAYMENT_METHODS.length} طرق دفع</p>
                    </div>
                </div>
                
                <div class="btn-container">
                    <a href="/health" class="btn btn-primary">
                        <i class="fas fa-heart-pulse"></i> Health Check
                    </a>
                    <a href="/api/test" class="btn btn-secondary">
                        <i class="fas fa-vial"></i> API Test
                    </a>
                    <a href="/api/books" class="btn btn-primary">
                        <i class="fas fa-book"></i> المكتبة
                    </a>
                    <a href="/api/live/rooms" class="btn btn-secondary">
                        <i class="fas fa-video"></i> الغرف النشطة
                    </a>
                    <a href="/api/stats" class="btn btn-primary">
                        <i class="fas fa-chart-bar"></i> الإحصائيات
                    </a>
                </div>
                
                <div class="pricing-section">
                    <h2 style="text-align: center; margin-bottom: 20px;">
                        <i class="fas fa-tags"></i> خطط الاشتراك
                    </h2>
                    
                    <div class="pricing-grid">
                        <div class="pricing-card">
                            <h3>🎁 تجربة مجانية</h3>
                            <p>${CONFIG.FREE_TRIAL_DAYS} أيام</p>
                            <p><strong>${CONFIG.MAX_DAILY_QUESTIONS.trial} سؤال/يوم</strong></p>
                            <p>مجاناً</p>
                        </div>
                        
                        <div class="pricing-card">
                            <h3>📦 أسبوعي</h3>
                            <p>7 أيام</p>
                            <p><strong>${CONFIG.MAX_DAILY_QUESTIONS.paid} سؤال/يوم</strong></p>
                            <p>${CONFIG.WEEKLY_SUBSCRIPTION} SDG</p>
                        </div>
                        
                        <div class="pricing-card highlight">
                            <h3>📅 شهري</h3>
                            <p>30 يوم</p>
                            <p><strong>${CONFIG.MAX_DAILY_QUESTIONS.paid} سؤال/يوم</strong></p>
                            <p>${CONFIG.MONTHLY_SUBSCRIPTION} SDG</p>
                            <p style="font-size: 0.9em; opacity: 0.8;">الأكثر شعبية</p>
                        </div>
                        
                        <div class="pricing-card">
                            <h3>👨‍🏫 معلم شهري</h3>
                            <p>30 يوم</p>
                            <p><strong>${CONFIG.MAX_DAILY_QUESTIONS.paid} سؤال/يوم</strong></p>
                            <p>${CONFIG.TEACHER_MONTHLY_FEE} SDG</p>
                        </div>
                    </div>
                </div>
                
                <div class="contact-info">
                    <h3 style="margin-bottom: 15px;">
                        <i class="fas fa-headset"></i> معلومات الدعم
                    </h3>
                    <p><strong>📞 الدعم الفني:</strong> ${CONFIG.ADMIN_PHONE}</p>
                    <p><strong>🌐 الموقع:</strong> ${BOT_URL}</p>
                </div>
                
                <h3 style="margin: 30px 0 20px 0;">
                    <i class="fas fa-code"></i> نقاط نهاية API
                </h3>
                <div style="background: rgba(0,0,0,0.3); padding: 20px; border-radius: 10px; font-family: monospace;">
                    <p>POST ${BOT_URL}/api/ai/ask - اسأل DeepSeek AI</p>
                    <p>GET ${BOT_URL}/api/subscription/status/:userId - حالة الاشتراك</p>
                    <p>GET ${BOT_URL}/api/books - المكتبة التعليمية</p>
                    <p>GET ${BOT_URL}/api/live/rooms - الغرف النشطة</p>
                </div>
                
                <footer>
                    <p>© 2024 Smart Education Platform v4.0 - جميع الحقوق محفوظة</p>
                    <p style="margin-top: 10px; font-size: 0.9em;">
                        <i class="fas fa-globe"></i> ${BOT_URL} | 
                        <i class="fas fa-clock"></i> ${new Date().toLocaleString('ar-SA')}
                    </p>
                </footer>
            </div>
        </body>
        </html>
    `);
});

// ==================== [ نقطة نهاية 404 ] ====================
app.use((req, res) => {
    let url = req.url;
    // إخفاء التوكن من رسالة الخطأ
    if (url.includes('/bot') && CONFIG.TELEGRAM_BOT_TOKEN) {
        url = url.replace(CONFIG.TELEGRAM_BOT_TOKEN, '***TOKEN***');
    }
    
    res.status(404).json({
        success: false,
        error: 'Route not found',
        serverUrl: BOT_URL,
        availableEndpoints: {
            GET: [
                '/',
                '/health',
                '/api/test',
                '/api/books',
                '/api/subscription/status/:userId',
                '/api/payment/status/:paymentId',
                '/api/file/:folder/:filename',
                '/api/live/rooms',
                '/api/stats'
            ],
            POST: [
                '/api/ai/ask',
                '/api/payment/request',
                '/api/upload/dual/:folder'
            ]
        }
    });
});

// ==================== [ تشغيل السيرفر ] ====================
server.listen(port, '0.0.0.0', () => {
    console.log(`
    🚀 Smart Education Platform Server v4.0
    🔗 Running on port: ${port}
    📡 Local: http://localhost:${port}
    🌐 Public: ${BOT_URL}
    
    🧠 DEEPSEEK AI SYSTEM:
    • Status: ${deepseekClient ? '✅ Connected' : '⚠️ Mock Mode'}
    • Model: deepseek-chat
    
    💰 SUBSCRIPTION SYSTEM:
    • Free Trial: ${CONFIG.FREE_TRIAL_DAYS} days
    • Weekly: ${CONFIG.WEEKLY_SUBSCRIPTION} SDG
    • Monthly: ${CONFIG.MONTHLY_SUBSCRIPTION} SDG
    • Teacher: ${CONFIG.TEACHER_MONTHLY_FEE} SDG
    
    📊 STORAGE:
    • Telegram: ${telegramBot ? '✅ Active' : '❌ Disabled'}
    • Firebase: ${isFirebaseInitialized ? '✅ Connected' : '❌ Disabled'}
    • Local Storage: ${STORAGE_BASE}
    
    🎯 MAIN ENDPOINTS:
    • Home: GET ${BOT_URL}/
    • Health: GET ${BOT_URL}/health
    • API Test: GET ${BOT_URL}/api/test
    • AI Ask: POST ${BOT_URL}/api/ai/ask
    • Books: GET ${BOT_URL}/api/books
    • Live Rooms: GET ${BOT_URL}/api/live/rooms
    
    📞 ADMIN CONTACT:
    • Phone: ${CONFIG.ADMIN_PHONE}
    
    ⚡ SYSTEM READY! All services initialized successfully.
    `);
});

// تنظيف الجلسات القديمة كل 5 دقائق
setInterval(() => {
    const now = Date.now();
    const timeout = 30 * 60 * 1000;
    
    for (const [socketId, session] of userSessions.entries()) {
        if (now - session.lastActivity > timeout) {
            userSessions.delete(socketId);
            console.log(`🧹 Cleaned up expired session: ${socketId}`);
        }
    }
}, 5 * 60 * 1000);

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection');
});

setInterval(() => {
    cleanupTempFiles();
}, 60 * 60 * 1000);
