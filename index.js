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
    ADMIN_BANK_ACCOUNT: "4426148",
    ADMIN_NAME: "محمد عبدالمعطي علي",
    WEEKLY_SUBSCRIPTION: 7000,
    TEACHER_MONTHLY_FEE: 30000,
    FREE_TRIAL_DAYS: 1,
    FREE_TEACHER_MONTHS: 1,
    MAX_DAILY_QUESTIONS: 100,
    STORAGE_MODE: "TELEGRAM_AND_SERVER",
    MAX_FILE_SIZE: 50 * 1024 * 1024,
    AUTO_DELETE_LOCAL_AFTER_UPLOAD: false
};

// ==================== [ متغيرات عامة ] ====================
let telegramBot = null;
let telegramStorageChannel = CONFIG.TELEGRAM_STORAGE_CHANNEL;
let isTelegramActive = false;
let isFirebaseInitialized = false;
let isBooksInitialized = false;
let deepseekClient = null;

// ==================== [ تهيئة بوت Telegram ] ====================
if (CONFIG.TELEGRAM_BOT_TOKEN) {
    try {
        telegramBot = new Telegraf(CONFIG.TELEGRAM_BOT_TOKEN);
        isTelegramActive = true;
        console.log('✅ Telegram Bot initialized successfully');
        
        // تأخير بدء البوت
        setTimeout(async () => {
            try {
                console.log('🔄 Setting up Telegram bot with webhook...');
                
                // 1. مسح أي ويب هوك سابق
                await telegramBot.telegram.deleteWebhook({ drop_pending_updates: true });
                console.log('🧹 Cleared previous webhook with pending updates');
                
                // 2. الانتظار قليلاً
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // 3. إعداد ويب هوك جديد
                const webhookUrl = `${BOT_URL}/bot${CONFIG.TELEGRAM_BOT_TOKEN}`;
                
                console.log(`🔗 Setting webhook to: ${webhookUrl}`);
                
                await telegramBot.telegram.setWebhook(webhookUrl, {
                    drop_pending_updates: true,
                    allowed_updates: ['message', 'callback_query']
                });
                
                console.log('✅ Telegram bot configured with webhook');
                
                // 4. إضافة route لمعالجة webhook
                app.post(`/bot${CONFIG.TELEGRAM_BOT_TOKEN}`, (req, res) => {
                    telegramBot.handleUpdate(req.body, res);
                });
                
                console.log('🤖 Telegram Bot Webhook is ready!');
                
                // 5. إضافة أمر start للتحقق
                telegramBot.command('start', (ctx) => {
                    ctx.reply('🤖 **Smart Education Storage Bot**\n\n' +
                             'أنا بوت التخزين للنظام التعليمي الذكي.\n' +
                             '📁 الملفات: كتب، صور، فيديوهات\n' +
                             '🔗 النظام يعمل مع webhook على: ' + webhookUrl);
                });
                
                telegramBot.command('status', (ctx) => {
                    ctx.reply('✅ البوت يعمل بنظام webhook\n' +
                             '📅 التاريخ: ' + new Date().toLocaleString() + '\n' +
                             '🌐 الخادم: ' + BOT_URL);
                });
                
                telegramBot.on('text', (ctx) => {
                    ctx.reply('📝 للتحقق من البوت:\n' +
                             '/start - معلومات البوت\n' +
                             '/status - حالة البوت\n\n' +
                             '🚀 المنصة: ' + BOT_URL);
                });
                
            } catch (err) {
                console.error('❌ Error setting up Telegram webhook:', err.message);
                console.log('⚠️ Bot will work in limited mode (no Telegram storage)');
                telegramBot = null;
                isTelegramActive = false;
            }
        }, 8000);
        
    } catch (error) {
        console.error('❌ Failed to initialize Telegram Bot:', error.message);
        telegramBot = null;
        isTelegramActive = false;
    }
} else {
    console.log('⚠️ Telegram Bot Token not provided - Telegram storage disabled');
}

// ==================== [ تهيئة Firebase Admin ] ====================
if (CONFIG.FIREBASE_JSON && Object.keys(CONFIG.FIREBASE_JSON).length > 0) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(CONFIG.FIREBASE_JSON),
            databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com",
            storageBucket: "sudan-market-6b122.appspot.com"
        });
        console.log('✅ Firebase Admin initialized successfully');
        isFirebaseInitialized = true;
        
        // تهيئة الكتب عند بدء التشغيل
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
            } catch (error) {
                console.error('❌ Error checking books:', error);
            }
        }, 3000);
        
    } catch (error) {
        console.error('❌ Failed to initialize Firebase Admin:', error.message);
    }
} else {
    console.log('⚠️ Firebase Admin JSON not provided - Firebase features will be limited');
}

// ==================== [ تهيئة DeepSeek API ] ====================
if (CONFIG.DEEPSEEK_API_KEY) {
    try {
        deepseekClient = new OpenAI({
            apiKey: CONFIG.DEEPSEEK_API_KEY,
            baseURL: 'https://api.deepseek.com/v1'
        });
        console.log('✅ DeepSeek API initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize DeepSeek API:', error.message);
    }
} else {
    console.log('⚠️ DeepSeek API Key not provided - AI features disabled');
}

// ==================== [ متغيرات التخزين ] ====================
const liveRooms = new Map();
const uploadedFiles = new Map();

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

// إنشاء مجلدات التخزين
(async () => {
    try {
        await fs.mkdir(STORAGE_BASE, { recursive: true });
        for (const folder of Object.values(FOLDERS)) {
            await fs.mkdir(path.join(STORAGE_BASE, folder), { recursive: true });
        }
        console.log('✅ Storage folders created successfully');
        
        await cleanupTempFiles();
        
    } catch (error) {
        console.error('❌ Error creating storage folders:', error);
    }
})();

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
        
        let caption = `📁 ${fileName}\n📦 Size: ${(fileStats.size/1024/1024).toFixed(2)}MB\n⏰ ${new Date().toLocaleString()}`;
        
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
        } else if (['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) {
            message = await telegramBot.telegram.sendAudio(
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
        console.log(`🔗 Telegram File URL: ${fileUrl}`);
        
        const fileInfo = {
            telegramFileId: message.document?.file_id || message.photo?.[0]?.file_id || message.video?.file_id,
            telegramMessageId: message.message_id,
            telegramUrl: fileUrl,
            localPath: filePath,
            fileName: fileName,
            uploadedAt: Date.now()
        };
        
        uploadedFiles.set(fileName, fileInfo);
        
        if (CONFIG.AUTO_DELETE_LOCAL_AFTER_UPLOAD) {
            try {
                await fs.unlink(filePath);
                console.log(`🗑️ Deleted local file: ${fileName}`);
            } catch (error) {
                console.warn(`⚠️ Could not delete local file: ${error.message}`);
            }
        }
        
        return fileInfo;
        
    } catch (error) {
        console.error(`❌ Error uploading to Telegram: ${error.message}`);
        return null;
    }
}

async function uploadToLocalServer(fileBuffer, fileName, folder) {
    try {
        const filePath = path.join(STORAGE_BASE, folder, fileName);
        await fs.writeFile(filePath, fileBuffer);
        
        const stats = await fs.stat(filePath);
        const serverUrl = `${BOT_URL}/api/file/${folder}/${fileName}`;
        
        console.log(`📁 Saved locally: ${filePath} (${(stats.size/1024/1024).toFixed(2)}MB)`);
        
        return {
            localPath: filePath,
            serverUrl: serverUrl,
            fileName: fileName,
            size: stats.size,
            uploadedAt: Date.now()
        };
    } catch (error) {
        console.error(`❌ Error saving locally: ${error.message}`);
        throw error;
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
            storageMode: results.telegram ? 'TELEGRAM_AND_SERVER' : 'SERVER_ONLY'
        };
        
        try {
            await fs.unlink(tempPath);
        } catch (error) {
            console.warn(`⚠️ Could not delete temp file: ${error.message}`);
        }
        
        return results.combined;
        
    } catch (error) {
        console.error(`❌ Error in dual upload: ${error.message}`);
        
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
            'audio/mpeg': 'videos',
            'audio/wav': 'videos'
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
                downloadUrl: fileInfo.serverUrl,
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
        console.error('❌ Error saving metadata to Firebase:', error.message);
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
        console.warn('⚠️ Failed to create thumbnail:', error.message);
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

// ==================== [ 1. تهيئة قاعدة بيانات الكتب ] ====================
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
                isFree: true
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
        console.error('❌ Error initializing books database:', error);
    }
}

// ==================== [ 2. قائمة الكتب التعليمية ] ====================
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
            curriculum: 'المنهج السوداني'
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

    socket.on('join-room', (roomData) => {
        const { roomId, userId, userName, role } = roomData;
        
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userId = userId;
        socket.userName = userName;
        
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
        
        socket.to(roomId).emit('participant-joined', { userId, userName, role });
        
        socket.emit('room-info', {
            participants: Array.from(room.participants.entries()).map(([id, data]) => ({
                userId: id,
                userName: data.userName,
                role: data.role
            })),
            isRecording: room.isRecording
        });
        
        console.log(`🚪 ${userName} joined room ${roomId}`);
        
        if (isFirebaseInitialized) {
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
        
        io.to(roomId).emit('chat-message', chatMessage);
        
        if (isFirebaseInitialized && roomId) {
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

app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: '✅ Server is running!', 
        time: new Date().toISOString(),
        server: 'Smart Education Platform with DeepSeek',
        version: '4.0.0',
        baseUrl: BOT_URL,
        storage: {
            mode: CONFIG.STORAGE_MODE,
            telegram: telegramBot ? 'Connected' : 'Not Connected',
            firebase: isFirebaseInitialized ? 'Connected' : 'Not Connected',
            local: 'Active'
        },
        ai: {
            provider: 'DeepSeek',
            status: deepseekClient ? 'Connected' : 'Mock Mode',
            dailyLimit: CONFIG.MAX_DAILY_QUESTIONS
        },
        config: {
            maxFileSize: `${CONFIG.MAX_FILE_SIZE/1024/1024}MB`,
            autoDeleteLocal: CONFIG.AUTO_DELETE_LOCAL_AFTER_UPLOAD,
            telegramChannel: telegramStorageChannel || 'Not Set'
        },
        stats: {
            uploadedFiles: uploadedFiles.size,
            liveRooms: liveRooms.size
        },
        endpoints: {
            health: `${BOT_URL}/health`,
            storageInfo: `${BOT_URL}/api/storage/info`,
            aiAsk: `${BOT_URL}/api/ai/ask`,
            aiQuiz: `${BOT_URL}/api/ai/generate-quiz`,
            books: `${BOT_URL}/api/books`,
            upload: `${BOT_URL}/api/upload/dual/:folder`
        }
    });
});

app.get('/api/storage/info', (req, res) => {
    res.json({
        success: true,
        baseUrl: BOT_URL,
        storage: {
            primary: 'Telegram & Local Server',
            telegram: {
                status: telegramBot ? '✅ Active' : '❌ Inactive',
                channel: telegramStorageChannel || 'Not set',
                maxSize: `${CONFIG.MAX_FILE_SIZE/1024/1024}MB`
            },
            local: {
                status: '✅ Active',
                path: path.resolve(STORAGE_BASE),
                folders: Object.values(FOLDERS)
            },
            firebase: {
                status: isFirebaseInitialized ? '✅ Active (Metadata only)' : '❌ Inactive',
                purpose: 'Stores file links and metadata only'
            }
        },
        uploadedFiles: Array.from(uploadedFiles.entries()).map(([name, info]) => ({
            name,
            telegramUrl: info.telegramUrl ? '✅ Yes' : '❌ No',
            localPath: info.localPath,
            size: info.size ? `${(info.size/1024/1024).toFixed(2)}MB` : 'Unknown'
        })),
        note: '⚠️ Actual files are stored in Telegram and Local Server. Firebase stores only links.',
        endpoints: {
            download: `${BOT_URL}/api/file/:folder/:filename`,
            upload: `${BOT_URL}/api/upload/dual/:folder`
        }
    });
});

app.post('/api/upload/dual/:folder', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }
        
        const folder = req.params.folder || 'images';
        const { originalname, path: tempPath, size, mimetype } = req.file;
        const uploadedBy = req.body.uploadedBy || 'anonymous';
        const isPublic = req.body.isPublic !== 'false';
        
        const fileBuffer = await fs.readFile(tempPath);
        
        const uniqueId = crypto.randomBytes(8).toString('hex');
        const ext = path.extname(originalname);
        const fileName = `${Date.now()}_${uniqueId}${ext}`;
        
        console.log(`📤 Starting dual upload: ${originalname} (${(size/1024/1024).toFixed(2)}MB)`);
        
        const uploadResult = await uploadToBoth(fileBuffer, fileName, folder, originalname);
        
        let bookInfo = null;
        let thumbnailUrl = null;
        
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
            
            if (req.body.createThumbnail === 'true') {
                try {
                    thumbnailUrl = await createThumbnail(uploadResult.localPath, fileName);
                    uploadResult.thumbnailUrl = thumbnailUrl;
                } catch (error) {
                    console.warn('Could not create thumbnail:', error.message);
                }
            }
        }
        
        const fileInfo = {
            ...uploadResult,
            originalName: originalname,
            folder: folder,
            mimeType: mimetype,
            size: size,
            uploadedBy: uploadedBy,
            uploadedAt: Date.now(),
            isPublic: isPublic,
            thumbnailUrl: thumbnailUrl,
            bookInfo: bookInfo
        };
        
        const savedMetadata = await storeFileMetadata(fileInfo);
        
        try {
            await fs.unlink(tempPath);
        } catch (error) {
            console.warn('Could not delete temp file:', error.message);
        }
        
        res.json({
            success: true,
            message: 'File uploaded successfully to both Telegram and Server',
            baseUrl: BOT_URL,
            file: {
                id: savedMetadata.firebaseId || uploadResult.fileName,
                originalName: originalname,
                fileName: uploadResult.fileName,
                size: size,
                telegramUrl: uploadResult.telegramUrl,
                serverUrl: uploadResult.serverUrl,
                thumbnailUrl: uploadResult.thumbnailUrl,
                storageMode: uploadResult.storageMode,
                uploadedAt: new Date(uploadResult.uploadedAt).toISOString(),
                bookInfo: bookInfo,
                downloadLinks: {
                    telegram: uploadResult.telegramUrl,
                    direct: uploadResult.serverUrl,
                    firebaseId: savedMetadata.firebaseId,
                    directUrl: `${BOT_URL}/api/file/${folder}/${uploadResult.fileName}`
                }
            },
            storage: {
                telegram: uploadResult.telegramUrl ? '✅ Uploaded' : '❌ Failed',
                server: '✅ Uploaded',
                firebase: savedMetadata.firebaseId ? '✅ Metadata saved' : '❌ Failed'
            }
        });
        
    } catch (error) {
        console.error('❌ Upload error:', error);
        
        if (req.file && req.file.path) {
            try {
                await fs.unlink(req.file.path);
            } catch (cleanupError) {
                console.warn('Could not cleanup temp file:', cleanupError.message);
            }
        }
        
        res.status(500).json({ 
            success: false, 
            error: error.message,
            note: 'File may be too large for Telegram (max 50MB)',
            baseUrl: BOT_URL
        });
    }
});

app.get('/api/files', async (req, res) => {
    try {
        const { type, folder, limit = 50, page = 1 } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        
        let files = [];
        
        if (isFirebaseInitialized) {
            const db = admin.database();
            const snapshot = await db.ref('file_storage').once('value');
            const allFiles = snapshot.val() || {};
            
            files = Object.entries(allFiles).map(([id, file]) => ({
                id,
                ...file,
                directUrl: `${BOT_URL}/api/file/${file.folder}/${file.fileName}`
            }));
        } else {
            files = Array.from(uploadedFiles.values()).map(fileInfo => ({
                id: fileInfo.fileName,
                fileName: fileInfo.fileName,
                telegramUrl: fileInfo.telegramUrl,
                serverUrl: fileInfo.serverUrl || fileInfo.localPath,
                directUrl: `${BOT_URL}/api/file/${fileInfo.folder || 'images'}/${fileInfo.fileName}`,
                size: fileInfo.size,
                uploadedAt: fileInfo.uploadedAt,
                storageMode: fileInfo.telegramUrl ? 'TELEGRAM_AND_SERVER' : 'SERVER_ONLY'
            }));
        }
        
        let filteredFiles = files;
        
        if (folder) {
            filteredFiles = filteredFiles.filter(file => file.folder === folder);
        }
        
        if (type === 'telegram') {
            filteredFiles = filteredFiles.filter(file => file.telegramUrl);
        } else if (type === 'local') {
            filteredFiles = filteredFiles.filter(file => !file.telegramUrl);
        }
        
        filteredFiles.sort((a, b) => b.uploadedAt - a.uploadedAt);
        
        const total = filteredFiles.length;
        const startIndex = (pageNum - 1) * limitNum;
        const endIndex = startIndex + limitNum;
        const paginatedFiles = filteredFiles.slice(startIndex, endIndex);
        
        const stats = {
            totalFiles: total,
            withTelegram: files.filter(f => f.telegramUrl).length,
            localOnly: files.filter(f => !f.telegramUrl).length,
            byFolder: {},
            totalSize: files.reduce((sum, file) => sum + (file.size || 0), 0)
        };
        
        files.forEach(file => {
            if (!stats.byFolder[file.folder]) {
                stats.byFolder[file.folder] = 0;
            }
            stats.byFolder[file.folder]++;
        });
        
        res.json({
            success: true,
            baseUrl: BOT_URL,
            files: paginatedFiles,
            stats: {
                ...stats,
                totalSizeMB: (stats.totalSize / 1024 / 1024).toFixed(2)
            },
            pagination: {
                currentPage: pageNum,
                totalPages: Math.ceil(total / limitNum),
                itemsPerPage: limitNum,
                totalItems: total
            },
            downloadBase: `${BOT_URL}/api/file`
        });
        
    } catch (error) {
        console.error('Error fetching files:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch files', baseUrl: BOT_URL });
    }
});

app.get('/api/files/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        let file = null;
        
        if (isFirebaseInitialized) {
            const db = admin.database();
            const snapshot = await db.ref(`file_storage/${fileId}`).once('value');
            file = snapshot.val();
            if (file) {
                file.directUrl = `${BOT_URL}/api/file/${file.folder}/${file.fileName}`;
            }
        }
        
        if (!file) {
            const fileInfo = uploadedFiles.get(fileId);
            if (fileInfo) {
                file = {
                    id: fileId,
                    fileName: fileInfo.fileName,
                    telegramUrl: fileInfo.telegramUrl,
                    serverUrl: fileInfo.serverUrl || fileInfo.localPath,
                    directUrl: `${BOT_URL}/api/file/${fileInfo.folder || 'images'}/${fileInfo.fileName}`,
                    size: fileInfo.size,
                    uploadedAt: fileInfo.uploadedAt,
                    storageMode: fileInfo.telegramUrl ? 'TELEGRAM_AND_SERVER' : 'SERVER_ONLY'
                };
            }
        }
        
        if (!file) {
            return res.status(404).json({ success: false, error: 'File not found', baseUrl: BOT_URL });
        }
        
        if (isFirebaseInitialized && file.id) {
            try {
                const db = admin.database();
                const views = file.views || 0;
                await db.ref(`file_storage/${file.id}/views`).set(views + 1);
                file.views = views + 1;
            } catch (error) {
                console.warn('Could not update view count:', error.message);
            }
        }
        
        res.json({
            success: true,
            file,
            downloadOptions: {
                telegram: file.telegramUrl,
                direct: file.directUrl,
                server: file.serverUrl
            },
            baseUrl: BOT_URL
        });
        
    } catch (error) {
        console.error('Error fetching file:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch file', baseUrl: BOT_URL });
    }
});

app.get('/api/books', async (req, res) => {
    try {
        const { grade, subject, search, page = 1, limit = 20 } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        
        let books = [];
        
        if (isFirebaseInitialized) {
            const db = admin.database();
            const snapshot = await db.ref('books').once('value');
            const allBooks = snapshot.val() || {};
            
            books = Object.entries(allBooks).map(([id, book]) => ({
                id,
                ...book,
                downloadUrl: `${BOT_URL}/api/file/books/${book.fileName}`
            }));
        } else {
            books = getAllEducationalBooks().map(book => ({
                ...book,
                downloadUrl: `${BOT_URL}/api/file/books/${book.fileName}`
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
                book.subject.toLowerCase().includes(searchLower) ||
                book.description.toLowerCase().includes(searchLower)
            );
        }
        
        const total = filteredBooks.length;
        const startIndex = (pageNum - 1) * limitNum;
        const endIndex = startIndex + limitNum;
        const paginatedBooks = filteredBooks.slice(startIndex, endIndex);
        
        const stats = {
            totalBooks: total,
            totalPages: Math.ceil(total / limitNum),
            currentPage: pageNum,
            booksPerPage: limitNum,
            showing: paginatedBooks.length,
            hasMore: endIndex < total
        };
        
        res.json({ 
            success: true, 
            baseUrl: BOT_URL,
            books: paginatedBooks,
            stats,
            message: `Found ${total} books`,
            downloadBase: `${BOT_URL}/api/file/books`
        });
        
    } catch (error) {
        console.error('Error fetching books:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch books', baseUrl: BOT_URL });
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
                baseUrl: BOT_URL,
                note: 'File may be stored only in Telegram or has been deleted locally'
            });
        }
        
        res.download(filePath, filename, (err) => {
            if (err) {
                console.error('Download error:', err);
                if (!res.headersSent) {
                    res.status(500).json({ success: false, error: 'Download failed', baseUrl: BOT_URL });
                }
            }
            
            if (isFirebaseInitialized) {
                try {
                    const db = admin.database();
                    
                    db.ref('file_storage').orderByChild('fileName').equalTo(filename)
                        .once('value')
                        .then(snapshot => {
                            const files = snapshot.val();
                            if (files) {
                                const fileId = Object.keys(files)[0];
                                const downloads = files[fileId].downloads || 0;
                                db.ref(`file_storage/${fileId}/downloads`).set(downloads + 1);
                            }
                        })
                        .catch(error => {
                            console.warn('Could not update download count:', error.message);
                        });
                } catch (error) {}
            }
        });
        
    } catch (error) {
        console.error('File serve error:', error);
        res.status(500).json({ success: false, error: 'Failed to serve file', baseUrl: BOT_URL });
    }
});

// ==================== [ نقاط نهاية DeepSeek AI ] ====================

// 1. مساعد AI للأسئلة العامة
app.post('/api/ai/ask', async (req, res) => {
    try {
        const { question, userId, subject, grade } = req.body;
        
        if (!question) {
            return res.status(400).json({ 
                success: false, 
                error: 'السؤال مطلوب',
                baseUrl: BOT_URL
            });
        }
        
        // التحقق من الحد اليومي
        const canAsk = await checkDailyLimit(userId);
        if (!canAsk.allowed) {
            return res.status(429).json({
                success: false,
                error: `تجاوزت الحد اليومي. يتبقى ${canAsk.remaining} سؤال اليوم`,
                baseUrl: BOT_URL
            });
        }
        
        let response;
        
        if (deepseekClient) {
            // استخدام DeepSeek للإجابة
            response = await askDeepSeek(question, subject, grade);
        } else {
            // استخدام رد افتراضي
            response = {
                answer: "أنا مساعد DeepSeek التعليمي. حالياً أنا في وضع التجربة. يمكنني الإجابة على أسئلتك التعليمية في مختلف المجالات.",
                isEducational: true,
                subject: subject || 'عام',
                grade: grade || 'جميع المراحل',
                source: 'mock'
            };
        }
        
        // تحديث الاستخدام اليومي
        if (userId) {
            await updateDailyUsage(userId);
        }
        
        res.json({
            success: true,
            baseUrl: BOT_URL,
            question: question,
            answer: response.answer,
            metadata: {
                subject: response.subject,
                grade: response.grade,
                isEducational: response.isEducational,
                aiProvider: deepseekClient ? 'DeepSeek' : 'Mock',
                remainingQuestions: canAsk.remaining - 1,
                timestamp: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('Error in AI ask:', error);
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ في معالجة السؤال',
            baseUrl: BOT_URL
        });
    }
});

// 2. إنشاء اختبار ذكي
app.post('/api/ai/generate-quiz', async (req, res) => {
    try {
        const { subject, grade, questionCount = 10, questionTypes = ['mcq'], difficulty = 'medium' } = req.body;
        
        if (!subject || !grade) {
            return res.status(400).json({ 
                success: false, 
                error: 'المادة والصف الدراسي مطلوبان',
                baseUrl: BOT_URL
            });
        }
        
        // إذا كان DeepSeek غير مفعل، نستخدم أسئلة وهمية
        if (!deepseekClient) {
            const mockQuiz = generateMockQuiz(subject, grade, questionCount, questionTypes, difficulty);
            return res.json({
                success: true,
                baseUrl: BOT_URL,
                quiz: mockQuiz,
                instructions: 'أجب على جميع الأسئلة في الوقت المحدد',
                timeLimit: 1800,
                note: 'Mock quiz (DeepSeek not configured)'
            });
        }
        
        // استخدام DeepSeek لإنشاء اختبار حقيقي
        const quiz = await generateDeepSeekQuiz(subject, grade, questionCount, questionTypes, difficulty);
        
        res.json({
            success: true,
            baseUrl: BOT_URL,
            quiz: quiz,
            instructions: 'أجب على جميع الأسئلة في الوقت المحدد',
            timeLimit: 1800,
            aiProvider: 'DeepSeek'
        });
        
    } catch (error) {
        console.error('Error generating quiz:', error);
        const mockQuiz = generateMockQuiz(
            req.body.subject || 'عام', 
            req.body.grade || 'عام', 
            10, 
            ['mcq'],
            req.body.difficulty || 'medium'
        );
        res.json({
            success: true,
            baseUrl: BOT_URL,
            quiz: mockQuiz,
            instructions: 'أجب على جميع الأسئلة في الوقت المحدد',
            timeLimit: 1800,
            note: 'Fallback to mock quiz',
            aiProvider: 'Mock'
        });
    }
});

// 3. شرح مفهوم تعليمي
app.post('/api/ai/explain', async (req, res) => {
    try {
        const { concept, level = 'intermediate', language = 'ar' } = req.body;
        
        if (!concept) {
            return res.status(400).json({ 
                success: false, 
                error: 'المفهوم المطلوب شرحه مطلوب',
                baseUrl: BOT_URL
            });
        }
        
        let explanation;
        
        if (deepseekClient) {
            explanation = await explainWithDeepSeek(concept, level, language);
        } else {
            explanation = {
                concept: concept,
                explanation: `شرح مبسط لمفهوم ${concept}: هذا مفهوم تعليمي مهم. يمكنني تقديم شرح مفصل عنه عندما يكون نظام الذكاء الاصطناعي نشطاً.`,
                examples: [
                    `مثال 1 على ${concept}`,
                    `مثال 2 على ${concept}`
                ],
                keyPoints: [
                    `النقطة الأساسية 1 حول ${concept}`,
                    `النقطة الأساسية 2 حول ${concept}`
                ],
                level: level,
                language: language,
                source: 'mock'
            };
        }
        
        res.json({
            success: true,
            baseUrl: BOT_URL,
            explanation: explanation,
            aiProvider: deepseekClient ? 'DeepSeek' : 'Mock'
        });
        
    } catch (error) {
        console.error('Error explaining concept:', error);
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ في شرح المفهوم',
            baseUrl: BOT_URL
        });
    }
});

// 4. حل مسألة رياضية
app.post('/api/ai/solve-math', async (req, res) => {
    try {
        const { problem, steps = true, grade = 'high school' } = req.body;
        
        if (!problem) {
            return res.status(400).json({ 
                success: false, 
                error: 'المسألة الرياضية مطلوبة',
                baseUrl: BOT_URL
            });
        }
        
        let solution;
        
        if (deepseekClient) {
            solution = await solveMathWithDeepSeek(problem, steps, grade);
        } else {
            solution = {
                problem: problem,
                solution: `حل المسألة الرياضية: ${problem}. الحل سيكون متاحاً عند تفعيل نظام الذكاء الاصطناعي.`,
                steps: steps ? [
                    'الخطوة 1: فهم المعطيات',
                    'الخطوة 2: تطبيق القانون المناسب',
                    'الخطوة 3: إجراء الحسابات',
                    'الخطوة 4: التحقق من النتيجة'
                ] : [],
                grade: grade,
                subject: 'رياضيات',
                source: 'mock'
            };
        }
        
        res.json({
            success: true,
            baseUrl: BOT_URL,
            problem: problem,
            solution: solution,
            aiProvider: deepseekClient ? 'DeepSeek' : 'Mock'
        });
        
    } catch (error) {
        console.error('Error solving math problem:', error);
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ في حل المسألة',
            baseUrl: BOT_URL
        });
    }
});

// 5. تلخيص نص تعليمي
app.post('/api/ai/summarize', async (req, res) => {
    try {
        const { text, length = 'medium', language = 'ar' } = req.body;
        
        if (!text || text.length < 10) {
            return res.status(400).json({ 
                success: false, 
                error: 'النص المطلوب تلخيصه قصير جداً',
                baseUrl: BOT_URL
            });
        }
        
        let summary;
        
        if (deepseekClient) {
            summary = await summarizeWithDeepSeek(text, length, language);
        } else {
            summary = {
                originalLength: text.length,
                summary: `ملخص النص: هذا نص تعليمي يحتاج إلى تلخيص. يمكنني تقديم ملخص مفصل عندما يكون نظام الذكاء الاصطناعي نشطاً.`,
                keyPoints: [
                    'النقطة الرئيسية 1',
                    'النقطة الرئيسية 2',
                    'النقطة الرئيسية 3'
                ],
                length: length,
                language: language,
                source: 'mock'
            };
        }
        
        res.json({
            success: true,
            baseUrl: BOT_URL,
            originalText: text.substring(0, 100) + '...',
            summary: summary,
            aiProvider: deepseekClient ? 'DeepSeek' : 'Mock'
        });
        
    } catch (error) {
        console.error('Error summarizing text:', error);
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ في تلخيص النص',
            baseUrl: BOT_URL
        });
    }
});

// ==================== [ دوال DeepSeek المساعدة ] ====================

async function askDeepSeek(question, subject, grade) {
    try {
        const context = subject && grade ? 
            `السؤال في مادة ${subject} للصف ${grade}.` : 
            'هذا سؤال تعليمي عام.';
        
        const prompt = `أنت مساعد تعليمي عربي ذكي في منصة تعليمية.
        
        ${context}
        
        السؤال: ${question}
        
        المطلوب:
        1. قدم إجابة تعليمية واضحة ودقيقة
        2. إذا كان السؤال يحتاج خطوات، قدمها مرتبة
        3. إذا كان هناك مفاهيم مهمة، اشرحها
        4. استخدم اللغة العربية الفصحى المناسبة للطلاب
        5. كن مفيداً وتعليمياً
        
        أجب بشكل مباشر ومفيد.`;
        
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
            source: 'deepseek'
        };
        
    } catch (error) {
        console.error('DeepSeek ask error:', error);
        throw error;
    }
}

async function generateDeepSeekQuiz(subject, grade, questionCount, questionTypes, difficulty = 'medium') {
    try {
        const prompt = `أنت مساعد تعليمي متخصص في إنشاء اختبارات تعليمية باللغة العربية.
        
        المهمة: أنشئ اختباراً تعليمياً يتكون من ${questionCount} سؤالاً.
        
        التفاصيل:
        - المادة: ${subject}
        - الصف الدراسي: ${grade}
        - مستوى الصعوبة: ${difficulty}
        - أنواع الأسئلة: ${questionTypes.join(', ')}
        
        المتطلبات:
        1. جميع الأسئلة باللغة العربية الفصحى
        2. الأسئلة مناسبة للمستوى التعليمي المحدد
        3. لكل سؤال اختيارات متعددة (4 خيارات لكل سؤال)
        4. حدد الإجابة الصحيحة
        5. قدم شرحاً مختصراً لكل إجابة
        
        أرجو الرد بتنسيق JSON فقط بالهيكل التالي:
        {
            "quizTitle": "عنوان الاختبار",
            "subject": "${subject}",
            "grade": "${grade}",
            "difficulty": "${difficulty}",
            "questions": [
                {
                    "question": "نص السؤال",
                    "type": "mcq",
                    "options": ["الخيار 1", "الخيار 2", "الخيار 3", "الخيار 4"],
                    "correctAnswer": 0,
                    "explanation": "شرح الإجابة الصحيحة"
                }
            ]
        }`;
        
        const response = await deepseekClient.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { 
                    role: "system", 
                    content: "أنت مساعد تعليمي عربي متخصص في إنشاء اختبارات تعليمية دقيقة ومناسبة للمستوى التعليمي. تجيب دائماً بتنسيق JSON فقط." 
                },
                { role: "user", content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 3000,
            response_format: { type: "json_object" }
        });
        
        const quizContent = JSON.parse(response.choices[0].message.content);
        
        return {
            quizId: `quiz_deepseek_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
            title: quizContent.quizTitle || `اختبار ${subject} - الصف ${grade}`,
            subject: quizContent.subject || subject,
            grade: quizContent.grade || grade,
            difficulty: quizContent.difficulty || difficulty,
            questions: quizContent.questions || [],
            totalQuestions: questionCount,
            timeLimit: 1800,
            createdAt: Date.now(),
            source: 'deepseek',
            aiModel: 'deepseek-chat'
        };
        
    } catch (error) {
        console.error('DeepSeek quiz generation error:', error);
        return generateMockQuiz(subject, grade, questionCount, questionTypes, difficulty);
    }
}

async function explainWithDeepSeek(concept, level, language) {
    try {
        const prompt = `أنت مساعد تعليمي عربي متخصص في شرح المفاهيم.
        
        المفهوم: ${concept}
        المستوى: ${level}
        اللغة: ${language}
        
        قدم شرحاً تعليمياً يتضمن:
        1. تعريف المفهوم
        2. أمثلة توضيحية
        3. النقاط الرئيسية
        4. أهمية المفهوم
        
        كن واضحاً ومناسباً للمستوى المحدد.`;
        
        const response = await deepseekClient.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { 
                    role: "system", 
                    content: "أنت خبير تعليمي عربي في شرح المفاهيم العلمية والأدبية. تشرح بطريقة مبسطة ومنظمة." 
                },
                { role: "user", content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 2000
        });
        
        const content = response.choices[0].message.content;
        
        return {
            concept: concept,
            explanation: content,
            examples: extractExamples(content),
            keyPoints: extractKeyPoints(content),
            level: level,
            language: language,
            source: 'deepseek'
        };
        
    } catch (error) {
        console.error('DeepSeek explain error:', error);
        throw error;
    }
}

async function solveMathWithDeepSeek(problem, steps, grade) {
    try {
        const prompt = `أنت مساعد رياضيات عربي متخصص في حل المسائل.
        
        المسألة: ${problem}
        الصف: ${grade}
        عرض الخطوات: ${steps ? 'نعم' : 'لا'}
        
        ${steps ? 'قدم الحل مع عرض جميع الخطوات التفصيلية.' : 'قدم الحل النهائي فقط.'}
        
        تأكد من:
        1. الحل الرياضي الصحيح
        2. الوضوح في الشرح
        3. المناسبة للمستوى التعليمي`;
        
        const response = await deepseekClient.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { 
                    role: "system", 
                    content: "أنت أستاذ رياضيات عربي متخصص في حل المسائل الرياضية بجميع مستويات الصعوبة." 
                },
                { role: "user", content: prompt }
            ],
            temperature: 0.3,
            max_tokens: 2000
        });
        
        const content = response.choices[0].message.content;
        
        return {
            problem: problem,
            solution: content,
            steps: steps ? extractSteps(content) : [],
            grade: grade,
            subject: 'رياضيات',
            source: 'deepseek'
        };
        
    } catch (error) {
        console.error('DeepSeek math solve error:', error);
        throw error;
    }
}

async function summarizeWithDeepSeek(text, length, language) {
    try {
        const lengthMap = {
            'short': 'ملخص مختصر جداً (2-3 جمل)',
            'medium': 'ملخص متوسط (فقرتين)',
            'long': 'ملخص مفصل (عدة فقرات)'
        };
        
        const prompt = `أنت مساعد تعليمي عربي متخصص في تلخيص النصوص.
        
        النص: ${text.substring(0, 4000)}
        
        المطلوب: ${lengthMap[length] || lengthMap.medium}
        
        قدم:
        1. الملخَّص الرئيسي
        2. النقاط الرئيسية
        3. الاستنتاجات المهمة
        
        حافظ على الدقة التعليمية.`;
        
        const response = await deepseekClient.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { 
                    role: "system", 
                    content: "أنت مختص في تلخيص النصوص التعليمية العربية مع الحفاظ على المضمون العلمي والدقة." 
                },
                { role: "user", content: prompt }
            ],
            temperature: 0.5,
            max_tokens: 1000
        });
        
        const content = response.choices[0].message.content;
        
        return {
            originalLength: text.length,
            summary: content,
            keyPoints: extractKeyPoints(content),
            length: length,
            language: language,
            source: 'deepseek'
        };
        
    } catch (error) {
        console.error('DeepSeek summarize error:', error);
        throw error;
    }
}

// ==================== [ دوال مساعدة للتحليل ] ====================

function extractExamples(text) {
    const examplePatterns = [
        /مثال[:\s]\s*(.*?)(?=\n|$)/gi,
        /على سبيل المثال[:\s]\s*(.*?)(?=\n|$)/gi,
        /مثلاً[:\s]\s*(.*?)(?=\n|$)/gi
    ];
    
    const examples = [];
    
    for (const pattern of examplePatterns) {
        const matches = [...text.matchAll(pattern)];
        matches.forEach(match => {
            if (match[1] && match[1].trim()) {
                examples.push(match[1].trim());
            }
        });
    }
    
    return examples.slice(0, 3);
}

function extractKeyPoints(text) {
    const keyPointPatterns = [
        /\d+\.\s*(.*?)(?=\n|$)/g,
        /-\s*(.*?)(?=\n|$)/g,
        /•\s*(.*?)(?=\n|$)/g,
        /أولاً[:\s]\s*(.*?)(?=\n|$)/gi,
        /ثانياً[:\s]\s*(.*?)(?=\n|$)/gi,
        /ثالثاً[:\s]\s*(.*?)(?=\n|$)/gi
    ];
    
    const keyPoints = new Set();
    
    for (const pattern of keyPointPatterns) {
        const matches = [...text.matchAll(pattern)];
        matches.forEach(match => {
            if (match[1] && match[1].trim()) {
                keyPoints.add(match[1].trim());
            }
        });
    }
    
    if (keyPoints.size === 0) {
        const sentences = text.split(/[.!؟]\s+/).filter(s => s.length > 10);
        sentences.slice(0, 5).forEach(sentence => {
            keyPoints.add(sentence.trim());
        });
    }
    
    return Array.from(keyPoints).slice(0, 5);
}

function extractSteps(text) {
    const stepPatterns = [
        /الخطوة\s+\d+[:\s]\s*(.*?)(?=\n|$)/gi,
        /خطوة\s+\d+[:\s]\s*(.*?)(?=\n|$)/gi,
        /\d+[\.\)]\s*(.*?)(?=\n|$)/g
    ];
    
    const steps = [];
    
    for (const pattern of stepPatterns) {
        const matches = [...text.matchAll(pattern)];
        matches.forEach(match => {
            if (match[1] && match[1].trim()) {
                steps.push(match[1].trim());
            }
        });
    }
    
    return steps.length > 0 ? steps : ['الخطوات غير محددة بوضوح في النص'];
}

function generateMockQuiz(subject, grade, questionCount, questionTypes, difficulty) {
    const questions = [];
    
    for (let i = 1; i <= questionCount; i++) {
        let question;
        
        if (questionTypes.includes('mcq')) {
            question = {
                question: `سؤال ${i}: ما هو ناتج ${i} × ${i} في مادة ${subject}؟`,
                type: 'mcq',
                options: [
                    `${i * i}`,
                    `${i + i}`,
                    `${i - i}`,
                    `${i / i}`
                ],
                correctAnswer: 0,
                explanation: `ناتج ${i} × ${i} = ${i * i}`
            };
        } else if (questionTypes.includes('true_false')) {
            question = {
                question: `سؤال ${i}: العبارة "${i} هو عدد زوجي" في ${subject}.`,
                type: 'true_false',
                options: ['صح', 'خطأ'],
                correctAnswer: i % 2 === 0 ? 0 : 1,
                explanation: i % 2 === 0 ? `${i} هو عدد زوجي` : `${i} هو عدد فردي`
            };
        } else {
            question = {
                question: `سؤال ${i}: اشرح مفهوم ${subject} للصف ${grade}.`,
                type: 'essay',
                correctAnswer: null,
                explanation: 'هذا سؤال مقالي يتم تقييمه من قبل المعلم'
            };
        }
        
        questions.push(question);
    }
    
    return {
        quizId: `quiz_mock_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        title: `اختبار ${subject} - الصف ${grade}`,
        subject: subject,
        grade: grade,
        questions: questions,
        totalQuestions: questionCount,
        timeLimit: 1800,
        createdAt: Date.now(),
        source: 'mock'
    };
}

// ==================== [ إدارة الاستخدام اليومي ] ====================

async function checkDailyLimit(userId) {
    if (!userId) {
        return { allowed: true, remaining: CONFIG.MAX_DAILY_QUESTIONS };
    }
    
    if (!isFirebaseInitialized) {
        return { allowed: true, remaining: CONFIG.MAX_DAILY_QUESTIONS };
    }
    
    try {
        const db = admin.database();
        const today = new Date().toISOString().split('T')[0];
        const dailyKey = `ai_questions_${userId}_${today}`;
        
        const snapshot = await db.ref(`ai_usage/${dailyKey}`).once('value');
        const dailyUsage = snapshot.val() || { count: 0 };
        
        const remaining = Math.max(0, CONFIG.MAX_DAILY_QUESTIONS - dailyUsage.count);
        
        return {
            allowed: remaining > 0,
            remaining: remaining,
            usedToday: dailyUsage.count,
            limit: CONFIG.MAX_DAILY_QUESTIONS
        };
        
    } catch (error) {
        console.error('Error checking daily limit:', error);
        return { allowed: true, remaining: CONFIG.MAX_DAILY_QUESTIONS };
    }
}

async function updateDailyUsage(userId) {
    if (!userId || !isFirebaseInitialized) return;
    
    try {
        const db = admin.database();
        const today = new Date().toISOString().split('T')[0];
        const dailyKey = `ai_questions_${userId}_${today}`;
        
        const snapshot = await db.ref(`ai_usage/${dailyKey}`).once('value');
        const dailyUsage = snapshot.val() || { count: 0, userId: userId };
        
        await db.ref(`ai_usage/${dailyKey}`).set({
            count: dailyUsage.count + 1,
            lastUsed: Date.now(),
            userId: userId
        });
        
    } catch (error) {
        console.error('Error updating daily usage:', error);
    }
}

// ==================== [ صفحة البداية ] ====================

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Smart Education Platform with DeepSeek</title>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
                .status { padding: 15px; margin: 10px 0; border-radius: 5px; }
                .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
                .warning { background: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }
                .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
                .endpoint { background: #f8f9fa; padding: 10px; margin: 5px 0; border-left: 4px solid #3498db; }
                code { background: #e9ecef; padding: 2px 5px; border-radius: 3px; }
                a { color: #3498db; text-decoration: none; }
                a:hover { text-decoration: underline; }
                .ai-feature { background: #e8f4fc; padding: 10px; margin: 10px 0; border-radius: 5px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🤖 Smart Education Platform with DeepSeek AI</h1>
                <p><strong>Version 4.0.0</strong> - DeepSeek AI Integration</p>
                <p><strong>Base URL:</strong> ${BOT_URL}</p>
                
                <div class="status ${deepseekClient ? 'success' : 'warning'}">
                    <strong>DeepSeek AI:</strong> ${deepseekClient ? '✅ Connected' : '⚠️ Mock Mode'}
                </div>
                
                <div class="status ${telegramBot ? 'success' : 'error'}">
                    <strong>Telegram Storage:</strong> ${telegramBot ? '✅ Connected' : '❌ Disconnected'}
                </div>
                
                <div class="status ${isFirebaseInitialized ? 'success' : 'warning'}">
                    <strong>Firebase Database:</strong> ${isFirebaseInitialized ? '✅ Connected' : '⚠️ Limited'}
                </div>
                
                <h2>🧠 DeepSeek AI Features</h2>
                
                <div class="ai-feature">
                    <h3>📝 Quiz Generation</h3>
                    <p>Generate intelligent quizzes using DeepSeek AI</p>
                    <code>POST ${BOT_URL}/api/ai/generate-quiz</code>
                </div>
                
                <div class="ai-feature">
                    <h3>❓ Ask Questions</h3>
                    <p>Ask any educational question to DeepSeek AI</p>
                    <code>POST ${BOT_URL}/api/ai/ask</code>
                </div>
                
                <div class="ai-feature">
                    <h3>📚 Explain Concepts</h3>
                    <p>Get detailed explanations of educational concepts</p>
                    <code>POST ${BOT_URL}/api/ai/explain</code>
                </div>
                
                <div class="ai-feature">
                    <h3>🔢 Solve Math Problems</h3>
                    <p>Step-by-step math problem solving</p>
                    <code>POST ${BOT_URL}/api/ai/solve-math</code>
                </div>
                
                <div class="ai-feature">
                    <h3>📄 Text Summarization</h3>
                    <p>Summarize educational texts</p>
                    <code>POST ${BOT_URL}/api/ai/summarize</code>
                </div>
                
                <h2>📊 Daily Limits</h2>
                <p>Each user can ask up to <strong>${CONFIG.MAX_DAILY_QUESTIONS} questions</strong> per day.</p>
                
                <h2>🔗 API Endpoints</h2>
                
                <div class="endpoint">
                    <code>GET ${BOT_URL}/api/test</code> - System status
                </div>
                
                <div class="endpoint">
                    <code>POST ${BOT_URL}/api/ai/ask</code> - Ask DeepSeek AI
                </div>
                
                <div class="endpoint">
                    <code>POST ${BOT_URL}/api/ai/explain</code> - Explain concepts
                </div>
                
                <div class="endpoint">
                    <code>POST ${BOT_URL}/api/ai/solve-math</code> - Solve math problems
                </div>
                
                <div class="endpoint">
                    <code>POST ${BOT_URL}/api/ai/summarize</code> - Summarize text
                </div>
                
                <div class="endpoint">
                    <code>GET ${BOT_URL}/api/books</code> - Get educational books
                </div>
                
                <h2>📚 Test DeepSeek</h2>
                <p>Try these example questions:</p>
                <ul>
                    <li>"ما هو قانون نيوتن الأول؟"</li>
                    <li>"اشرح عملية البناء الضوئي"</li>
                    <li>"حل المعادلة: 2س + 5 = 15"</li>
                    <li>"لخّص أهمية الثورة الصناعية"</li>
                </ul>
                
                <p><strong>AI Provider:</strong> DeepSeek Chat</p>
                <p><strong>Language:</strong> Arabic (Primary)</p>
                <p><strong>Mode:</strong> ${deepseekClient ? 'Real AI' : 'Mock Mode'}</p>
            </div>
        </body>
        </html>
    `);
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        baseUrl: BOT_URL,
        services: {
            server: '✅ Running',
            telegram: telegramBot ? '✅ Connected' : '❌ Disconnected',
            firebase: isFirebaseInitialized ? '✅ Connected' : '❌ Disconnected',
            storage: '✅ Active',
            deepseek: deepseekClient ? '✅ Connected' : '❌ Disconnected'
        },
        storageInfo: {
            mode: CONFIG.STORAGE_MODE,
            uploadedFiles: uploadedFiles.size,
            liveRooms: liveRooms.size
        },
        aiFeatures: {
            askQuestions: '✅ Available',
            quizGeneration: '✅ Available',
            conceptExplanations: '✅ Available',
            mathSolving: '✅ Available',
            textSummarization: '✅ Available',
            dailyLimit: CONFIG.MAX_DAILY_QUESTIONS
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
    • Daily Limit: ${CONFIG.MAX_DAILY_QUESTIONS} questions/user
    • Features: Quiz, Q&A, Explanations, Math, Summarization
    
    📊 STORAGE SYSTEM:
    • Telegram: ${telegramBot ? '✅ Active' : '❌ Disabled'}
    • Local Server: ✅ Active
    • Firebase: ${isFirebaseInitialized ? '✅ Metadata only' : '❌ Disabled'}
    
    🎯 AI ENDPOINTS:
    • Ask Question: POST ${BOT_URL}/api/ai/ask
    • Generate Quiz: POST ${BOT_URL}/api/ai/generate-quiz
    • Explain Concept: POST ${BOT_URL}/api/ai/explain
    • Solve Math: POST ${BOT_URL}/api/ai/solve-math
    • Summarize Text: POST ${BOT_URL}/api/ai/summarize
    
    📚 Total Books: ${getAllEducationalBooks().length}
    
    🔗 Health Check: ${BOT_URL}/health
    🎯 API Test: ${BOT_URL}/api/test
    `);
});

// ==================== [ معالجة الأخطاء ] ====================
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

setInterval(() => {
    cleanupTempFiles();
}, 60 * 60 * 1000);
