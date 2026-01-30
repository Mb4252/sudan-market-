// bot-server.js
const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const admin = require('firebase-admin');
const imageThumbnail = require('image-thumbnail');
const { PDFDocument } = require('pdf-lib');

const app = express();
const port = process.env.PORT || 3001;

// ==================== [ 1. إعدادات تخزين الملفات ] ====================

// مجلدات التخزين المحلي
const STORAGE_BASE = './smart_storage';
const FOLDERS = {
    IMAGES: 'images',
    BOOKS: 'books',
    VIDEOS: 'videos',
    AVATARS: 'avatars',
    TEACHER_IDS: 'teacher_ids',
    LIVE_RECORDINGS: 'live_recordings'
};

// إنشاء المجلدات إذا لم تكن موجودة
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

// تكوين Multer للرفع
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
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB كحد أقصى
    fileFilter: (req, file, cb) => {
        const allowedTypes = {
            'image/jpeg': 'images',
            'image/png': 'images',
            'image/webp': 'images',
            'application/pdf': 'books',
            'video/mp4': 'videos',
            'video/webm': 'videos',
            'application/msword': 'books',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'books'
        };
        
        if (allowedTypes[file.mimetype]) {
            cb(null, true);
        } else {
            cb(new Error(`نوع الملف غير مدعوم: ${file.mimetype}`), false);
        }
    }
});

// ==================== [ 2. إعداد Firebase ] ====================

let firebaseInitialized = false;

const initializeFirebase = () => {
    try {
        if (admin.apps.length === 0) {
            const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_JSON);
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

// استدعاء الإعداد
initializeFirebase();

// قاعدة بيانات Firebase
const db = firebaseInitialized ? admin.database() : null;

// ==================== [ 3. دوال التخزين الذكي ] ====================

/**
 * تخزين ملف في قاعدة البيانات مع إنشاء رابط ذكي
 */
const storeFileMetadata = async (fileInfo) => {
    if (!db) throw new Error('Firebase غير مهيء');
    
    const fileId = `file_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const metadata = {
        id: fileId,
        originalName: fileInfo.originalName,
        fileName: fileInfo.fileName,
        folder: fileInfo.folder,
        mimeType: fileInfo.mimeType,
        size: fileInfo.size,
        url: `${process.env.BOT_URL || 'http://localhost:3001'}/api/file/${fileInfo.folder}/${fileInfo.fileName}`,
        downloadUrl: `${process.env.BOT_URL || 'http://localhost:3001'}/api/download/${fileInfo.folder}/${fileInfo.fileName}`,
        thumbnailUrl: fileInfo.thumbnailUrl || null,
        uploadedBy: fileInfo.uploadedBy,
        uploadedAt: Date.now(),
        isPublic: fileInfo.isPublic !== false
    };
    
    await db.ref(`file_storage/${fileId}`).set(metadata);
    return metadata;
};

/**
 * إنشاء نسخة مصغرة للصور
 */
const createThumbnail = async (filePath, folder, fileName) => {
    try {
        const options = { width: 200, height: 200, responseType: 'base64' };
        const thumbnail = await imageThumbnail(filePath, options);
        
        const thumbFileName = `thumb_${fileName}`;
        const thumbPath = path.join(STORAGE_BASE, folder, thumbFileName);
        
        await fs.writeFile(thumbPath, Buffer.from(thumbnail, 'base64'));
        
        return `${process.env.BOT_URL || 'http://localhost:3001'}/api/file/${folder}/${thumbFileName}`;
    } catch (error) {
        console.warn('⚠️ تعذر إنشاء صورة مصغرة:', error.message);
        return null;
    }
};

/**
 * استخراج معلومات أساسية من PDF
 */
const extractPDFInfo = async (filePath) => {
    try {
        const pdfBytes = await fs.readFile(filePath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPageCount();
        
        return {
            pages,
            hasText: pages > 0,
            optimized: pdfDoc.getPageCount() <= 50 // PDF صغير نسبياً
        };
    } catch (error) {
        return { pages: 0, hasText: false, optimized: false };
    }
};

// ==================== [ 4. المسارات الرئيسية للبوت ] ====================

/**
 * 4.1 رفع ملف وتخزين رابط فقط في Firebase
 */
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
        
        // معالجة خاصة حسب نوع الملف
        if (req.file.mimetype.startsWith('image/')) {
            thumbnailUrl = await createThumbnail(filePath, folder, req.file.filename);
        }
        
        if (req.file.mimetype === 'application/pdf') {
            pdfInfo = await extractPDFInfo(filePath);
        }
        
        // تخزين البيانات الوصفية في Firebase
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
            // إشعار مهم: الملف مخزن محلياً وليس في Firebase
            storageNote: '📦 الملف مخزن في ذاكرة البوت، فقط الرابط مخزن في Firebase'
        });
        
    } catch (error) {
        console.error('خطأ في رفع الملف:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 4.2 رفع كتاب مع معالجة خاصة
 */
app.post('/api/upload-book', upload.single('book'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'لم يتم رفع أي كتاب' });
        }
        
        const bookInfo = {
            title: req.body.title || 'كتاب بدون عنوان',
            author: req.body.author || 'مؤلف غير معروف',
            grade: req.body.grade || 'غير محدد',
            subject: req.body.subject || 'عام',
            description: req.body.description || '',
            price: parseInt(req.body.price) || 0,
            uploadedBy: req.body.uploadedBy || 'anonymous'
        };
        
        // تخزين معلومات الكتاب في Firebase
        const bookId = `book_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const bookMetadata = {
            ...bookInfo,
            id: bookId,
            fileName: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size,
            mimeType: req.file.mimetype,
            url: `${process.env.BOT_URL || 'http://localhost:3001'}/api/file/books/${req.file.filename}`,
            downloadUrl: `${process.env.BOT_URL || 'http://localhost:3001'}/api/download/books/${req.file.filename}`,
            uploadedAt: Date.now(),
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

/**
 * 4.3 الحصول على رابط لملف
 */
app.get('/api/file/:folder/:filename', async (req, res) => {
    try {
        const filePath = path.join(STORAGE_BASE, req.params.folder, req.params.filename);
        
        // التحقق من وجود الملف
        await fs.access(filePath);
        
        // تحديد نوع المحتوى
        const ext = path.extname(req.params.filename).toLowerCase();
        const contentType = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.webp': 'image/webp',
            '.pdf': 'application/pdf',
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }[ext] || 'application/octet-stream';
        
        res.setHeader('Content-Type', contentType);
        res.sendFile(filePath);
        
    } catch (error) {
        res.status(404).json({ success: false, error: 'الملف غير موجود' });
    }
});

/**
 * 4.4 تحميل ملف
 */
app.get('/api/download/:folder/:filename', async (req, res) => {
    try {
        const filePath = path.join(STORAGE_BASE, req.params.folder, req.params.filename);
        await fs.access(filePath);
        
        // زيادة عداد التحميلات إذا كان كتاباً
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

/**
 * 4.5 رفع صورة أستاذ (مع معالجة خاصة)
 */
app.post('/api/upload-teacher-id', upload.single('id_card'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'لم يتم رفع صورة البطاقة' });
        }
        
        const teacherInfo = {
            teacherId: req.body.teacherId,
            teacherName: req.body.teacherName,
            teacherEmail: req.body.teacherEmail,
            uploadedAt: Date.now()
        };
        
        // تخزين رابط الصورة فقط في Firebase
        const idUrl = `${process.env.BOT_URL || 'http://localhost:3001'}/api/file/teacher_ids/${req.file.filename}`;
        
        if (db) {
            await db.ref(`teacher_ids/${teacherInfo.teacherId}`).set({
                ...teacherInfo,
                idFileName: req.file.filename,
                idUrl: idUrl,
                verified: false
            });
        }
        
        res.json({
            success: true,
            message: 'تم رفع صورة البطاقة بنجاح',
            idUrl: idUrl,
            metadata: teacherInfo
        });
        
    } catch (error) {
        console.error('خطأ في رفع صورة البطاقة:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 4.6 إدارة البث المباشر (تسجيل وتخزين)
 */
app.post('/api/live/start-recording', async (req, res) => {
    try {
        const { roomId, teacherId, title, duration } = req.body;
        
        const recordingId = `rec_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        
        // إنشاء ملف تسجيل وهمي (في الإنتاج، هنا سيتم تسجيل الفيديو فعلياً)
        const recordingFileName = `${recordingId}.mp4`;
        const recordingPath = path.join(STORAGE_BASE, FOLDERS.LIVE_RECORDINGS, recordingFileName);
        
        // ملف وهمي للتسجيل
        await fs.writeFile(recordingPath, Buffer.from('Live recording placeholder'));
        
        const recordingMetadata = {
            id: recordingId,
            roomId: roomId,
            teacherId: teacherId,
            title: title || 'تسجيل بث مباشر',
            fileName: recordingFileName,
            duration: duration || 0,
            url: `${process.env.BOT_URL || 'http://localhost:3001'}/api/file/live_recordings/${recordingFileName}`,
            startedAt: Date.now(),
            participants: 0,
            status: 'recording'
        };
        
        // تخزين البيانات في Firebase
        if (db) {
            await db.ref(`live_recordings/${recordingId}`).set(recordingMetadata);
            await db.ref(`live_rooms/${roomId}/recordingId`).set(recordingId);
        }
        
        res.json({
            success: true,
            message: 'بدأ التسجيل',
            recordingId: recordingId,
            metadata: recordingMetadata
        });
        
    } catch (error) {
        console.error('خطأ في بدء التسجيل:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 4.7 الحصول على قائمة الملفات
 */
app.get('/api/files/:folder?', async (req, res) => {
    try {
        const folder = req.params.folder || FOLDERS.IMAGES;
        const folderPath = path.join(STORAGE_BASE, folder);
        
        const files = await fs.readdir(folderPath);
        const fileList = await Promise.all(
            files.map(async (file) => {
                const filePath = path.join(folderPath, file);
                const stats = await fs.stat(filePath);
                
                return {
                    name: file,
                    size: stats.size,
                    modified: stats.mtime,
                    url: `${process.env.BOT_URL || 'http://localhost:3001'}/api/file/${folder}/${file}`
                };
            })
        );
        
        res.json({
            success: true,
            folder: folder,
            count: fileList.length,
            totalSize: fileList.reduce((sum, file) => sum + file.size, 0),
            files: fileList
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 4.8 مسح ملف قديم (للصيانة)
 */
app.delete('/api/file/:folder/:filename', async (req, res) => {
    try {
        const filePath = path.join(STORAGE_BASE, req.params.folder, req.params.filename);
        
        // التحقق من وجود الملف
        await fs.access(filePath);
        
        // مسح الملف
        await fs.unlink(filePath);
        
        // مسح البيانات الوصفية من Firebase إذا كانت موجودة
        if (db) {
            // البحث عن الملف في قاعدة البيانات ومسحه
            const filesRef = db.ref('file_storage');
            const snapshot = await filesRef.orderByChild('fileName').equalTo(req.params.filename).once('value');
            
            if (snapshot.exists()) {
                snapshot.forEach((childSnapshot) => {
                    childSnapshot.ref.remove();
                });
            }
        }
        
        res.json({
            success: true,
            message: 'تم مسح الملف بنجاح'
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 4.9 إحصائيات التخزين
 */
app.get('/api/storage-stats', async (req, res) => {
    try {
        let totalSize = 0;
        let fileCount = 0;
        const statsByFolder = {};
        
        // حساب حجم كل مجلد
        for (const [key, folderName] of Object.entries(FOLDERS)) {
            const folderPath = path.join(STORAGE_BASE, folderName);
            
            try {
                const files = await fs.readdir(folderPath);
                let folderSize = 0;
                
                for (const file of files) {
                    const filePath = path.join(folderPath, file);
                    const stats = await fs.stat(filePath);
                    folderSize += stats.size;
                }
                
                statsByFolder[folderName] = {
                    files: files.length,
                    size: folderSize,
                    sizeMB: (folderSize / (1024 * 1024)).toFixed(2)
                };
                
                totalSize += folderSize;
                fileCount += files.length;
                
            } catch (error) {
                statsByFolder[folderName] = { files: 0, size: 0, sizeMB: '0.00' };
            }
        }
        
        res.json({
            success: true,
            stats: {
                totalFiles: fileCount,
                totalSize: totalSize,
                totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
                totalSizeGB: (totalSize / (1024 * 1024 * 1024)).toFixed(2),
                byFolder: statsByFolder,
                freeSpace: '100+ GB (خاضع لمساحة السيرفر)',
                note: '💾 الملفات مخزنة في ذاكرة البوت، فقط الروابط في Firebase'
            }
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== [ 5. الدمج مع ميزات الذكاء الاصطناعي ] ====================

// 5.1 دمج OpenAI
const { OpenAI } = require('openai');
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/**
 * 5.2 توليد اختبار من كتاب
 */
app.post('/api/generate-quiz-from-book', async (req, res) => {
    try {
        const { bookUrl, count = 5 } = req.body;

        if (!bookUrl) return res.status(400).json({ error: "لا يوجد رابط للكتاب" });

        // تحميل ملف الـ PDF من ذاكرة البوت
        const filePath = path.join(STORAGE_BASE, 'books', path.basename(bookUrl));
        const dataBuffer = await fs.readFile(filePath);
        
        // استخراج النص من PDF (تستخدم مكتبة pdf-parse)
        const pdf = require('pdf-parse');
        const data = await pdf(dataBuffer);
        const textContent = data.text.substring(0, 15000);
        
        // توليد الأسئلة باستخدام الذكاء الاصطناعي
        const prompt = `أنشئ ${count} أسئلة من النص التالي:\n${textContent}\n\nالنتيجة JSON فقط.`;
        
        const completion = await openai.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "gpt-3.5-turbo",
        });

        const quizData = JSON.parse(completion.choices[0].message.content);
        res.json({ success: true, questions: quizData });

    } catch (error) {
        console.error("خطأ في توليد الأسئلة:", error);
        res.status(500).json({ success: false, error: "فشل قراءة الملف أو توليد الأسئلة" });
    }
});

// ==================== [ 6. تشغيل السيرفر ] ====================

app.get('/', (req, res) => {
    res.json({
        name: 'Smart Storage Bot',
        version: '2.0',
        description: 'بوت تخزين ذكي - الملفات في الذاكرة، الروابط فقط في Firebase',
        endpoints: {
            upload: 'POST /api/upload/:folder',
            uploadBook: 'POST /api/upload-book',
            uploadTeacherId: 'POST /api/upload-teacher-id',
            getFile: 'GET /api/file/:folder/:filename',
            download: 'GET /api/download/:folder/:filename',
            listFiles: 'GET /api/files/:folder',
            storageStats: 'GET /api/storage-stats',
            generateQuiz: 'POST /api/generate-quiz-from-book',
            liveRecording: 'POST /api/live/start-recording'
        },
        storageInfo: '💾 جميع الملفات مخزنة محلياً في مجلد smart_storage/'
    });
});

app.listen(port, () => {
    console.log(`🤖 بوت التخزين الذكي يعمل على المنفذ ${port}`);
    console.log(`📁 مساحة التخزين: ${path.resolve(STORAGE_BASE)}`);
    console.log(`🔗 مثال رفع ملف: POST http://localhost:${port}/api/upload`);
    console.log('⚡ الملفات في الذاكرة، الروابط فقط في Firebase!');
});
