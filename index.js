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
    TELEGRAM_STORAGE_CHANNEL: process.env.TELEGRAM_STORAGE_CHANNEL || process.env.TELEGRAM_CHAT_ID || '',
    FIREBASE_JSON: process.env.FIREBASE_ADMIN_JSON ? JSON.parse(process.env.FIREBASE_ADMIN_JSON) : {},
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    ADMIN_ID: process.env.ADMIN_ID || '',
    ADMIN_BANK_ACCOUNT: "4426148",
    ADMIN_NAME: "محمد عبدالمعطي علي",
    WEEKLY_SUBSCRIPTION: 7000,
    TEACHER_MONTHLY_FEE: 30000,
    FREE_TRIAL_DAYS: 1,
    FREE_TEACHER_MONTHS: 1,
    MAX_DAILY_QUESTIONS: 100,
    STORAGE_MODE: "TELEGRAM_AND_SERVER", // TELEGRAM_AND_SERVER, SERVER_ONLY, TELEGRAM_ONLY
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB لـ Telegram
    AUTO_DELETE_LOCAL_AFTER_UPLOAD: false // حذف الملفات المحلية بعد رفعها لـ Telegram
};

// ==================== [ تهيئة بوت Telegram ] ====================
let telegramBot = null;
let telegramStorageChannel = CONFIG.TELEGRAM_STORAGE_CHANNEL;

if (CONFIG.TELEGRAM_BOT_TOKEN) {
    try {
        telegramBot = new Telegraf(CONFIG.TELEGRAM_BOT_TOKEN);
        console.log('✅ Telegram Bot initialized successfully');
        
        // بدء البوت
        telegramBot.launch().then(() => {
            console.log('🤖 Telegram Bot is running...');
        }).catch(err => {
            console.error('❌ Failed to launch Telegram bot:', err.message);
        });
        
        // أمر بسيط للتحقق
        telegramBot.command('start', (ctx) => {
            ctx.reply('🤖 **Smart Education Storage Bot**\n\n' +
                     'أنا بوت التخزين للنظام التعليمي الذكي.\n' +
                     'جميع الملفات تخزن هنا وفي السيرفر.\n' +
                     '📁 الملفات: كتب، صور، فيديوهات\n' +
                     '🔗 الروابط فقط تخزن في Firebase');
        });
        
    } catch (error) {
        console.error('❌ Failed to initialize Telegram Bot:', error.message);
        telegramBot = null;
    }
} else {
    console.log('⚠️ Telegram Bot Token not provided - Telegram storage disabled');
}

// ==================== [ تهيئة Firebase Admin ] ====================
let isFirebaseInitialized = false;
let isBooksInitialized = false; // لمنع تكرار تهيئة الكتب

if (CONFIG.FIREBASE_JSON && Object.keys(CONFIG.FIREBASE_JSON).length > 0) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(CONFIG.FIREBASE_JSON),
            databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com",
            storageBucket: "sudan-market-6b122.appspot.com"
        });
        console.log('✅ Firebase Admin initialized successfully');
        isFirebaseInitialized = true;
        
        // تهيئة الكتب عند بدء التشغيل (مرة واحدة فقط)
        setTimeout(async () => {
            try {
                const db = admin.database();
                const snapshot = await db.ref('books').once('value');
                const existingBooks = snapshot.val() || {};
                
                // ⚠️ التصحيح المهم: نتحقق إذا كان هناك كتب أم لا
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
const liveRooms = new Map();
const uploadedFiles = new Map(); // تتبع الملفات المرفوعة حديثاً

// ==================== [ إعدادات تخزين الملفات ] ====================
const STORAGE_BASE = './smart_storage';
const FOLDERS = {
    IMAGES: 'images',
    BOOKS: 'books',
    VIDEOS: 'videos',
    AVATARS: 'avatars',
    TEACHER_IDS: 'teacher_ids',
    LIVE_RECORDINGS: 'live_recordings',
    TEMP: 'temp' // للملفات المؤقتة
};

// إنشاء مجلدات التخزين
(async () => {
    try {
        await fs.mkdir(STORAGE_BASE, { recursive: true });
        for (const folder of Object.values(FOLDERS)) {
            await fs.mkdir(path.join(STORAGE_BASE, folder), { recursive: true });
        }
        console.log('✅ Storage folders created successfully');
        
        // تنظيف الملفات المؤقتة القديمة
        await cleanupTempFiles();
        
    } catch (error) {
        console.error('❌ Error creating storage folders:', error);
    }
})();

// ==================== [ دوال التخزين في Telegram ] ====================

/**
 * رفع الملف إلى قناة Telegram التخزينية
 */
async function uploadToTelegram(filePath, fileName, fileType) {
    if (!telegramBot || !telegramStorageChannel) {
        console.log('⚠️ Telegram storage not available');
        return null;
    }

    try {
        const fileStats = await fs.stat(filePath);
        
        // التحقق من حجم الملف (Telegram limit: 50MB للبوتات)
        if (fileStats.size > CONFIG.MAX_FILE_SIZE) {
            console.log(`⚠️ File too large for Telegram (${(fileStats.size/1024/1024).toFixed(2)}MB)`);
            return null;
        }
        
        console.log(`📤 Uploading to Telegram: ${fileName} (${(fileStats.size/1024/1024).toFixed(2)}MB)`);
        
        // تحديد نوع المحتوى بناءً على الامتداد
        let caption = `📁 ${fileName}\n📦 Size: ${(fileStats.size/1024/1024).toFixed(2)}MB\n⏰ ${new Date().toLocaleString()}`;
        
        let message;
        const ext = path.extname(fileName).toLowerCase();
        
        if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
            // صورة
            message = await telegramBot.telegram.sendPhoto(
                telegramStorageChannel,
                { source: filePath },
                { caption: caption }
            );
        } else if (['.pdf', '.doc', '.docx', '.txt', '.epub'].includes(ext)) {
            // مستند
            message = await telegramBot.telegram.sendDocument(
                telegramStorageChannel,
                { source: filePath, filename: fileName },
                { caption: caption }
            );
        } else if (['.mp4', '.avi', '.mov', '.mkv', '.webm'].includes(ext)) {
            // فيديو (مقيد بحجم أصغر)
            if (fileStats.size > 20 * 1024 * 1024) { // 20MB limit للفيديو
                console.log('⚠️ Video file too large for Telegram');
                return null;
            }
            message = await telegramBot.telegram.sendVideo(
                telegramStorageChannel,
                { source: filePath },
                { caption: caption }
            );
        } else if (['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) {
            // صوت
            message = await telegramBot.telegram.sendAudio(
                telegramStorageChannel,
                { source: filePath },
                { caption: caption }
            );
        } else {
            // ملف عام
            message = await telegramBot.telegram.sendDocument(
                telegramStorageChannel,
                { source: filePath, filename: fileName },
                { caption: caption }
            );
        }
        
        // الحصول على رابط الملف من Telegram
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
        
        // حفظ معلومات الملف في الذاكرة
        const fileInfo = {
            telegramFileId: message.document?.file_id || message.photo?.[0]?.file_id || message.video?.file_id,
            telegramMessageId: message.message_id,
            telegramUrl: fileUrl,
            localPath: filePath,
            fileName: fileName,
            uploadedAt: Date.now()
        };
        
        uploadedFiles.set(fileName, fileInfo);
        
        // حذف الملف المحلي إذا تم ضبط الإعداد
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

/**
 * رفع الملف إلى السيرفر المحلي
 */
async function uploadToLocalServer(fileBuffer, fileName, folder) {
    try {
        const filePath = path.join(STORAGE_BASE, folder, fileName);
        await fs.writeFile(filePath, fileBuffer);
        
        const stats = await fs.stat(filePath);
        const serverUrl = `${process.env.BOT_URL || 'http://localhost:' + port}/api/file/${folder}/${fileName}`;
        
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

/**
 * رفع الملف المزدوج (Telegram + السيرفر)
 */
async function uploadToBoth(fileBuffer, fileName, folder, originalName) {
    const results = {
        telegram: null,
        server: null,
        combined: {}
    };
    
    // حفظ محلي أولاً
    const tempFileName = `temp_${Date.now()}_${fileName}`;
    const tempPath = path.join(STORAGE_BASE, FOLDERS.TEMP, tempFileName);
    
    try {
        // 1. حفظ في الملف المؤقت
        await fs.writeFile(tempPath, fileBuffer);
        
        // 2. رفع إلى Telegram
        if (telegramBot && telegramStorageChannel) {
            results.telegram = await uploadToTelegram(tempPath, originalName || fileName, folder);
        }
        
        // 3. نسخ إلى الموقع النهائي (إذا لم يتم حذفه)
        const finalPath = path.join(STORAGE_BASE, folder, fileName);
        
        if (CONFIG.AUTO_DELETE_LOCAL_AFTER_UPLOAD && results.telegram) {
            // إذا حذفنا الملف المحلي بعد رفعه لـ Telegram
            results.server = {
                localPath: finalPath,
                serverUrl: results.telegram.telegramUrl, // نستخدم رابط Telegram
                fileName: fileName,
                uploadedAt: Date.now()
            };
        } else {
            // نسخ الملف للموقع النهائي
            await fs.copyFile(tempPath, finalPath);
            const stats = await fs.stat(finalPath);
            const serverUrl = `${process.env.BOT_URL || 'http://localhost:' + port}/api/file/${folder}/${fileName}`;
            
            results.server = {
                localPath: finalPath,
                serverUrl: serverUrl,
                fileName: fileName,
                size: stats.size,
                uploadedAt: Date.now()
            };
        }
        
        // 4. إنشاء كائن موحد
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
        
        // 5. تنظيف الملف المؤقت
        try {
            await fs.unlink(tempPath);
        } catch (error) {
            console.warn(`⚠️ Could not delete temp file: ${error.message}`);
        }
        
        return results.combined;
        
    } catch (error) {
        console.error(`❌ Error in dual upload: ${error.message}`);
        
        // تنظيف الملف المؤقت في حالة الخطأ
        try {
            await fs.unlink(tempPath);
        } catch (cleanupError) {
            // تجاهل خطأ التنظيف
        }
        
        throw error;
    }
}

/**
 * تنظيف الملفات المؤقتة القديمة
 */
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
    } catch (error) {
        // تجاهل الخطأ إذا المجلد غير موجود
    }
}

// ==================== [ تكوين Multer للرفع ] ====================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const folder = req.params.folder || 'images';
        cb(null, path.join(STORAGE_BASE, FOLDERS.TEMP)); // نستخدم TEMP أولاً
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
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit للسيرفر
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

/**
 * تخزين ميتاداتا الملف في Firebase
 */
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
            // معلومات إضافية للكتب
            ...(fileInfo.bookInfo || {})
        };
        
        const db = admin.database();
        await db.ref(`file_storage/${fileId}`).set(metadata);
        
        console.log(`✅ File metadata saved to Firebase: ${fileId}`);
        
        // إذا كان كتاباً، نخزنه في قسم الكتب أيضاً
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

/**
 * إنشاء ثمبنييل للصور
 */
async function createThumbnail(filePath, fileName) {
    try {
        const thumbFileName = `thumb_${path.parse(fileName).name}.webp`;
        const thumbPath = path.join(STORAGE_BASE, 'images', thumbFileName);
        
        await sharp(filePath)
            .resize(200, 200, { fit: 'cover' })
            .webp({ quality: 80 })
            .toFile(thumbPath);
        
        const thumbUrl = `${process.env.BOT_URL || 'http://localhost:' + port}/api/file/images/${thumbFileName}`;
        
        // رفع الثمبنييل لـ Telegram أيضاً
        if (telegramBot && telegramStorageChannel) {
            await uploadToTelegram(thumbPath, thumbFileName, 'images');
        }
        
        return thumbUrl;
    } catch (error) {
        console.warn('⚠️ Failed to create thumbnail:', error.message);
        return null;
    }
}

/**
 * استخراج معلومات PDF
 */
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
        
        // ⚠️ التصحيح المهم: نتحقق إذا كان هناك كتب أم لا
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
            
            // نضيف معلومات التخزين
            const bookWithStorage = {
                ...book,
                storageMode: 'SYSTEM_GENERATED',
                telegramUrl: null, // هذه الكتب لا توجد في Telegram
                serverUrl: book.downloadUrl || `/api/file/books/${book.fileName}`,
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

    // المرحلة الابتدائية
    const elementaryGrades = ['الأول الابتدائي', 'الثاني الابتدائي', 'الثالث الابتدائي', 'الرابع الابتدائي', 'الخامس الابتدائي', 'السادس الابتدائي'];
    const elementarySubjects = ['الرياضيات', 'اللغة العربية', 'العلوم', 'التربية الإسلامية', 'الاجتماعيات', 'اللغة الإنجليزية'];

    // المرحلة المتوسطة
    const intermediateGrades = ['الأول المتوسط', 'الثاني المتوسط', 'الثالث المتوسط'];
    const intermediateSubjects = ['الرياضيات', 'العلوم', 'اللغة العربية', 'اللغة الإنجليزية', 'الاجتماعيات', 'التربية الإسلامية', 'الحاسوب'];

    // المرحلة الثانوية
    const secondaryGrades = ['الأول الثانوي', 'الثاني الثانوي', 'الثالث الثانوي'];
    const secondarySubjects = ['الرياضيات', 'الفيزياء', 'الكيمياء', 'الأحياء', 'اللغة العربية', 'اللغة الإنجليزية', 'التاريخ', 'الجغرافيا', 'الفلسفة'];

    // إضافة كتب المرحلة الابتدائية
    for (const grade of elementaryGrades) {
        for (const subject of elementarySubjects) {
            allBooks.push(createBook(grade, subject, `${subject} للصف ${grade}`, `${subject} للمرحلة الابتدائية`, 80));
        }
    }

    // إضافة كتب المرحلة المتوسطة
    for (const grade of intermediateGrades) {
        for (const subject of intermediateSubjects) {
            allBooks.push(createBook(grade, subject, `${subject} للصف ${grade}`, `${subject} للمرحلة المتوسطة`, 120));
        }
    }

    // إضافة كتب المرحلة الثانوية
    for (const grade of secondaryGrades) {
        for (const subject of secondarySubjects) {
            allBooks.push(createBook(grade, subject, `${subject} للصف ${grade}`, `${subject} للمرحلة الثانوية`, 150));
        }
    }

    // كتب إضافية
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
        
        // حفظ في Firebase
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

// 1. نقطة اختبار النظام
app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: '✅ Server is running!', 
        time: new Date().toISOString(),
        server: 'Smart Education Platform',
        version: '3.0.0',
        storage: {
            mode: CONFIG.STORAGE_MODE,
            telegram: telegramBot ? 'Connected' : 'Not Connected',
            firebase: isFirebaseInitialized ? 'Connected' : 'Not Connected',
            local: 'Active'
        },
        features: ['Dual Storage', 'Live Streaming', 'AI Assistant', 'Library', 'Payments'],
        config: {
            maxFileSize: `${CONFIG.MAX_FILE_SIZE/1024/1024}MB`,
            autoDeleteLocal: CONFIG.AUTO_DELETE_LOCAL_AFTER_UPLOAD,
            telegramChannel: telegramStorageChannel || 'Not Set'
        },
        stats: {
            uploadedFiles: uploadedFiles.size,
            liveRooms: liveRooms.size
        }
    });
});

// 2. جلب معلومات التخزين
app.get('/api/storage/info', (req, res) => {
    res.json({
        success: true,
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
        note: '⚠️ Actual files are stored in Telegram and Local Server. Firebase stores only links.'
    });
});

// 3. رفع ملف مزدوج (Telegram + Server)
app.post('/api/upload/dual/:folder', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }
        
        const folder = req.params.folder || 'images';
        const { originalname, path: tempPath, size, mimetype } = req.file;
        const uploadedBy = req.body.uploadedBy || 'anonymous';
        const isPublic = req.body.isPublic !== 'false';
        
        // قراءة الملف المؤقت
        const fileBuffer = await fs.readFile(tempPath);
        
        // إنشاء اسم فريد للملف النهائي
        const uniqueId = crypto.randomBytes(8).toString('hex');
        const ext = path.extname(originalname);
        const fileName = `${Date.now()}_${uniqueId}${ext}`;
        
        console.log(`📤 Starting dual upload: ${originalname} (${(size/1024/1024).toFixed(2)}MB)`);
        
        // الرفع المزدوج
        const uploadResult = await uploadToBoth(fileBuffer, fileName, folder, originalname);
        
        // معلومات إضافية للكتب
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
            
            // إنشاء غلاف للكتاب
            if (req.body.createThumbnail === 'true') {
                try {
                    thumbnailUrl = await createThumbnail(uploadResult.localPath, fileName);
                    uploadResult.thumbnailUrl = thumbnailUrl;
                } catch (error) {
                    console.warn('Could not create thumbnail:', error.message);
                }
            }
        }
        
        // تحضير معلومات الملف للتخزين
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
        
        // تخزين الميتاداتا في Firebase
        const savedMetadata = await storeFileMetadata(fileInfo);
        
        // تنظيف الملف المؤقت
        try {
            await fs.unlink(tempPath);
        } catch (error) {
            console.warn('Could not delete temp file:', error.message);
        }
        
        res.json({
            success: true,
            message: 'File uploaded successfully to both Telegram and Server',
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
                    firebaseId: savedMetadata.firebaseId
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
        
        // تنظيف الملف المؤقت في حالة الخطأ
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
            note: 'File may be too large for Telegram (max 50MB)' 
        });
    }
});

// 4. جلب الملفات المحفوظة
app.get('/api/files', async (req, res) => {
    try {
        const { type, folder, limit = 50, page = 1 } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        
        let files = [];
        
        // إذا كان Firebase يعمل، نجلب من هناك
        if (isFirebaseInitialized) {
            const db = admin.database();
            const snapshot = await db.ref('file_storage').once('value');
            const allFiles = snapshot.val() || {};
            
            files = Object.entries(allFiles).map(([id, file]) => ({
                id,
                ...file
            }));
        } else {
            // نجلب من الذاكرة المحلية
            files = Array.from(uploadedFiles.values()).map(fileInfo => ({
                id: fileInfo.fileName,
                fileName: fileInfo.fileName,
                telegramUrl: fileInfo.telegramUrl,
                serverUrl: fileInfo.serverUrl || fileInfo.localPath,
                size: fileInfo.size,
                uploadedAt: fileInfo.uploadedAt,
                storageMode: fileInfo.telegramUrl ? 'TELEGRAM_AND_SERVER' : 'SERVER_ONLY'
            }));
        }
        
        // تطبيق الفلاتر
        let filteredFiles = files;
        
        if (folder) {
            filteredFiles = filteredFiles.filter(file => file.folder === folder);
        }
        
        if (type === 'telegram') {
            filteredFiles = filteredFiles.filter(file => file.telegramUrl);
        } else if (type === 'local') {
            filteredFiles = filteredFiles.filter(file => !file.telegramUrl);
        }
        
        // الترتيب زمنياً (الأحدث أولاً)
        filteredFiles.sort((a, b) => b.uploadedAt - a.uploadedAt);
        
        // التقسيم إلى صفحات
        const total = filteredFiles.length;
        const startIndex = (pageNum - 1) * limitNum;
        const endIndex = startIndex + limitNum;
        const paginatedFiles = filteredFiles.slice(startIndex, endIndex);
        
        // إحصائيات
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
            }
        });
        
    } catch (error) {
        console.error('Error fetching files:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch files' });
    }
});

// 5. جلب ملف محدد
app.get('/api/files/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        let file = null;
        
        if (isFirebaseInitialized) {
            const db = admin.database();
            const snapshot = await db.ref(`file_storage/${fileId}`).once('value');
            file = snapshot.val();
        }
        
        if (!file) {
            // البحث في الملفات المحلية
            const fileInfo = uploadedFiles.get(fileId);
            if (fileInfo) {
                file = {
                    id: fileId,
                    fileName: fileInfo.fileName,
                    telegramUrl: fileInfo.telegramUrl,
                    serverUrl: fileInfo.serverUrl || fileInfo.localPath,
                    size: fileInfo.size,
                    uploadedAt: fileInfo.uploadedAt,
                    storageMode: fileInfo.telegramUrl ? 'TELEGRAM_AND_SERVER' : 'SERVER_ONLY'
                };
            }
        }
        
        if (!file) {
            return res.status(404).json({ success: false, error: 'File not found' });
        }
        
        // زيادة عداد المشاهدات
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
                direct: file.serverUrl,
                local: file.localPath
            }
        });
        
    } catch (error) {
        console.error('Error fetching file:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch file' });
    }
});

// 6. جلب الكتب
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
                ...book
            }));
        } else {
            books = getAllEducationalBooks();
        }
        
        // تطبيق الفلاتر
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
        
        // التقسيم إلى صفحات
        const total = filteredBooks.length;
        const startIndex = (pageNum - 1) * limitNum;
        const endIndex = startIndex + limitNum;
        const paginatedBooks = filteredBooks.slice(startIndex, endIndex);
        
        // إحصائيات
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
            books: paginatedBooks,
            stats,
            message: `Found ${total} books`
        });
        
    } catch (error) {
        console.error('Error fetching books:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch books' });
    }
});

// 7. تحميل ملف مباشر من السيرفر
app.get('/api/file/:folder/:filename', async (req, res) => {
    try {
        const { folder, filename } = req.params;
        const filePath = path.join(STORAGE_BASE, folder, filename);
        
        // التحقق من وجود الملف
        try {
            await fs.access(filePath);
        } catch (error) {
            return res.status(404).json({ 
                success: false, 
                error: 'File not found on server',
                note: 'File may be stored only in Telegram or has been deleted locally'
            });
        }
        
        // إرسال الملف
        res.download(filePath, filename, (err) => {
            if (err) {
                console.error('Download error:', err);
                if (!res.headersSent) {
                    res.status(500).json({ success: false, error: 'Download failed' });
                }
            }
            
            // تحديث عداد التحميلات في Firebase
            if (isFirebaseInitialized) {
                try {
                    const db = admin.database();
                    
                    // البحث عن الملف في قاعدة البيانات
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
                } catch (error) {
                    // تجاهل الأخطاء في تحديث العداد
                }
            }
        });
        
    } catch (error) {
        console.error('File serve error:', error);
        res.status(500).json({ success: false, error: 'Failed to serve file' });
    }
});

// 8. تنظيف الملفات المكررة من Firebase
app.get('/api/cleanup/duplicates', async (req, res) => {
    try {
        if (!isFirebaseInitialized) {
            return res.json({ success: false, error: 'Firebase not connected' });
        }

        const db = admin.database();
        const snapshot = await db.ref('books').once('value');
        const books = snapshot.val() || {};
        
        const seenTitles = {};
        const duplicates = [];
        const uniqueBooks = {};
        
        Object.entries(books).forEach(([id, book]) => {
            const key = `${book.title}_${book.grade}_${book.subject}`;
            
            if (seenTitles[key]) {
                duplicates.push({ id, title: book.title });
            } else {
                seenTitles[key] = true;
                uniqueBooks[id] = book;
            }
        });
        
        if (duplicates.length > 0) {
            await db.ref('books').set(uniqueBooks);
            console.log(`🧹 Deleted ${duplicates.length} duplicate books`);
        }
        
        res.json({
            success: true,
            message: `Found ${duplicates.length} duplicate books`,
            deleted: duplicates,
            remaining: Object.keys(uniqueBooks).length,
            note: 'Books cleaned up successfully'
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 9. رابط الصحة
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
            server: '✅ Running',
            telegram: telegramBot ? '✅ Connected' : '❌ Disconnected',
            firebase: isFirebaseInitialized ? '✅ Connected' : '❌ Disconnected',
            storage: '✅ Active'
        },
        storageInfo: {
            mode: CONFIG.STORAGE_MODE,
            uploadedFiles: uploadedFiles.size,
            liveRooms: liveRooms.size
        }
    });
});

// 10. صفحة البداية
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Smart Education Platform</title>
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
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🤖 Smart Education Platform</h1>
                <p><strong>Version 3.0.0</strong> - Dual Storage System</p>
                
                <div class="status ${telegramBot ? 'success' : 'error'}">
                    <strong>Telegram Storage:</strong> ${telegramBot ? '✅ Connected' : '❌ Disconnected'}
                </div>
                
                <div class="status ${isFirebaseInitialized ? 'success' : 'warning'}">
                    <strong>Firebase Database:</strong> ${isFirebaseInitialized ? '✅ Connected (Metadata only)' : '⚠️ Limited'}
                </div>
                
                <div class="status success">
                    <strong>Local Server Storage:</strong> ✅ Active
                </div>
                
                <h2>📊 Storage System</h2>
                <p>Files are stored in both:</p>
                <ul>
                    <li><strong>Telegram Channels</strong> (For backup & distribution)</li>
                    <li><strong>Local Server</strong> (For fast access)</li>
                    <li><strong>Firebase</strong> (Stores links and metadata only)</li>
                </ul>
                
                <h2>🔗 API Endpoints</h2>
                
                <div class="endpoint">
                    <code>GET /api/test</code> - System status
                </div>
                
                <div class="endpoint">
                    <code>GET /api/storage/info</code> - Storage information
                </div>
                
                <div class="endpoint">
                    <code>POST /api/upload/dual/:folder</code> - Upload to Telegram & Server
                </div>
                
                <div class="endpoint">
                    <code>GET /api/books</code> - Get all books
                </div>
                
                <div class="endpoint">
                    <code>GET /api/file/:folder/:filename</code> - Download file
                </div>
                
                <h2>📚 Features</h2>
                <ul>
                    <li>Dual Storage (Telegram + Server)</li>
                    <li>Live Classrooms</li>
                    <li>AI Assistant</li>
                    <li>Digital Library</li>
                    <li>Payment System</li>
                </ul>
                
                <p><strong>Note:</strong> Actual files are NOT stored in Firebase. Firebase stores only links and metadata.</p>
            </div>
        </body>
        </html>
    `);
});

// ==================== [ تشغيل السيرفر ] ====================
server.listen(port, '0.0.0.0', () => {
    console.log(`
    🚀 Smart Education Platform Server v3.0
    🔗 Running on port: ${port}
    📡 Local: http://localhost:${port}
    🌐 Public: ${process.env.BOT_URL || 'Set BOT_URL in environment'}
    
    📊 STORAGE SYSTEM:
    • Telegram: ${telegramBot ? '✅ Active' : '❌ Disabled'}
    • Local Server: ✅ Active (${path.resolve(STORAGE_BASE)})
    • Firebase: ${isFirebaseInitialized ? '✅ Metadata only' : '❌ Disabled'}
    
    ⚠️ IMPORTANT: Files are stored in Telegram & Local Server ONLY!
    ⚠️ Firebase stores LINKS and METADATA only!
    
    📚 Total Books: ${getAllEducationalBooks().length}
    🤖 Telegram Bot: ${telegramBot ? 'Running' : 'Not configured'}
    
    🔗 Health Check: ${process.env.BOT_URL || 'http://localhost:' + port}/health
    🎯 API Test: ${process.env.BOT_URL || 'http://localhost:' + port}/api/test
    📁 Storage Info: ${process.env.BOT_URL || 'http://localhost:' + port}/api/storage/info
    `);
});

// ==================== [ معالجة الأخطاء ] ====================
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// تنظيف دوري للملفات المؤقتة
setInterval(() => {
    cleanupTempFiles();
}, 60 * 60 * 1000); // كل ساعة
