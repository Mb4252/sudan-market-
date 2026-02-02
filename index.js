const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const admin = require('firebase-admin');
// تم استبدال image-thumbnail بـ sharp
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

const port = process.env.PORT || 10000; // ✅ تم التعديل هنا

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

// تم تعطيل جلب البيانات من Hugging Face ليعمل النظام على إعدادات البيئة مباشرة
async function loadConfigFromHuggingFace() {
    console.log('ℹ️ تم ضبط النظام للعمل بالإعدادات المحلية/البيئة مباشرة.');
    return true; 
}

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
        console.warn('⚠️ تعذر إنشاء صورة مصغرة:', error.message);
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
    return metadata;
}

// ==================== [ المسارات الأساسية ] ====================
app.post('/api/upload/:folder?', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'لم يتم رفع أي ملف' });
        }

        const folder = req.params.folder || FOLDERS.IMAGES;
        const uploadedBy = req.body.userId || 'anonymous';
        const filePath = req.file.path;
        
        // --- [ الجزء الجديد: إرسال الملف إلى تليجرام للتخزين ] ---
        try {
            const botToken = CONFIG.TELEGRAM_BOT_TOKEN;
            const chatId = CONFIG.TELEGRAM_ADMIN_CHAT_ID || CONFIG.TELEGRAM_CHAT_ID;

            if (botToken && chatId) {
                const form = new FormData();
                form.append('chat_id', chatId);
                form.append('document', fs.createReadStream(filePath)); // نرسله كمستند للحفاظ على الجودة
                form.append('caption', `📂 ملف جديد مرفوع:\n👤 بواسطة: ${uploadedBy}\n📁 المجلد: ${folder}\n📄 الاسم: ${req.file.originalname}`);

                // إرسال الملف إلى تليجرام عبر API
                await axios.post(`https://api.telegram.org/bot${botToken}/sendDocument`, form, {
                    headers: form.getHeaders()
                });
                console.log('✅ تم إرسال نسخة من الملف إلى تليجرام بنجاح');
            }
        } catch (tgError) {
            console.error('⚠️ فشل إرسال الملف لتليجرام، لكن تم حفظه محلياً:', tgError.message);
        }
        // --- [ نهاية التعديل ] ---

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
            message: 'تم رفع الملف بنجاح وحفظ نسخة في تليجرام',
            fileId: storedMetadata.id,
            metadata: storedMetadata
        });
        
    } catch (error) {
        console.error('خطأ في رفع الملف:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== [ نقاط نهاية جديدة ] ====================
app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: '✅ الخادم يعمل!', 
        time: new Date().toISOString(),
        server: 'Smart Education Platform',
        port: port
    });
});

app.get('/api/hello', (req, res) => {
    res.json({ 
        success: true, 
        message: 'مرحباً! النظام جاهز',
        endpoints: ['/api/test', '/api/books', '/api/upload/:folder']
    });
});

app.get('/api/books', (req, res) => {
    res.json({
        success: true,
        books: [
            { id: '1', title: 'الرياضيات للصف الأول', author: 'وزارة التربية', grade: 'الأول الابتدائي', subject: 'الرياضيات' },
            { id: '2', title: 'العلوم للصف الثاني', author: 'وزارة التربية', grade: 'الثاني الابتدائي', subject: 'العلوم' }
        ]
    });
});

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
        
        res.setHeader('Content-Type', contentType);
        res.sendFile(filePath);
        
    } catch (error) {
        res.status(404).json({ success: false, error: 'الملف غير موجود' });
    }
});

// ==================== [ تشغيل السيرفر ] ====================

server.listen(port, '0.0.0.0', async () => {
    console.log(`\n🚀 سيرفر التعليم الذكي يعمل على المنفذ ${port}`);
    console.log(`🔗 الواجهة الرئيسية: http://localhost:${port}`);
    
    try {
        await loadConfigFromHuggingFace();
        console.log('✅ النظام جاهز للاستخدام!');
    } catch (error) {
        console.log('⚠️ النظام يعمل بتهيئة افتراضية');
    }
});

process.on('SIGINT', () => {
    console.log('\n🛑 إيقاف النظام...');
    process.exit(0);
});
