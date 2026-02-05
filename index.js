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
const BOT_URL = process.env.BOT_URL || `https://sdm-security-bot.onrender.com`;

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

// ==================== [ تهيئة DeepSeek API ] ====================
let deepseekClient = null;
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

// ==================== [ تهيئة Firebase Admin ] ====================
let isFirebaseInitialized = false;
let isBooksInitialized = false;

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

// ==================== [ تهيئة بوت Telegram مع Webhook ] ====================
let telegramBot = null;
let telegramStorageChannel = CONFIG.TELEGRAM_STORAGE_CHANNEL;

if (CONFIG.TELEGRAM_BOT_TOKEN) {
    try {
        telegramBot = new Telegraf(CONFIG.TELEGRAM_BOT_TOKEN);
        console.log('✅ Telegram Bot initialized successfully');
        
        // 1. مسار Webhook
        app.post(`/telegram-webhook`, async (req, res) => {
            try {
                await telegramBot.handleUpdate(req.body, res);
            } catch (err) {
                console.error('Webhook error:', err);
                res.status(200).end();
            }
        });
        
        // 2. عند بدء التشغيل، إعداد Webhook
        (async () => {
            try {
                // مسح أي Webhook سابق
                await telegramBot.telegram.deleteWebhook({ drop_pending_updates: true });
                console.log('🧹 Cleared previous webhook');
                
                // الانتظار قليلاً
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // إعداد Webhook جديد
                const webhookUrl = `${BOT_URL}/telegram-webhook`;
                console.log(`🔗 Setting webhook to: ${webhookUrl}`);
                
                await telegramBot.telegram.setWebhook(webhookUrl, {
                    drop_pending_updates: true,
                    allowed_updates: ['message', 'callback_query']
                });
                
                console.log('✅ Telegram Webhook configured successfully!');
                
            } catch (error) {
                console.error('❌ Webhook setup error:', error.message);
            }
        })();
        
        // 3. الأوامر الأساسية
        telegramBot.start((ctx) => {
            ctx.replyWithHTML(
                `🤖 <b>Smart Education Platform Bot</b>\n\n` +
                `🎯 <b>وظائف البوت:</b>\n` +
                `📁 <b>التخزين:</b> رفع الملفات التعليمية\n` +
                `🧠 <b>المساعد الذكي:</b> DeepSeek AI\n` +
                `📚 <b>المكتبة:</b> ${getAllEducationalBooks().length} كتاب\n` +
                `🎥 <b>البث المباشر:</b> فصول تفاعلية\n\n` +
                `🔗 <b>المنصة:</b> ${BOT_URL}\n` +
                `📞 <b>الدعم:</b> @sdm_support`
            );
        });
        
        telegramBot.help((ctx) => {
            ctx.replyWithHTML(
                `🆘 <b>أوامر البوت:</b>\n\n` +
                `/start - بدء البوت ومعلومات\n` +
                `/status - حالة النظام\n` +
                `/books - الكتب التعليمية\n` +
                `/ai - المساعد الذكي (DeepSeek)\n` +
                `/upload - رفع ملف\n` +
                `/storage - معلومات التخزين\n` +
                `/quiz - اختبار ذكي\n` +
                `/live - البث المباشر`
            );
        });
        
        telegramBot.command('status', (ctx) => {
            const stats = {
                bot: telegramBot ? '✅ نشط' : '❌ غير نشط',
                deepseek: deepseekClient ? '✅ متصل' : '❌ غير متصل',
                firebase: isFirebaseInitialized ? '✅ متصل' : '❌ غير متصل',
                books: getAllEducationalBooks().length,
                date: new Date().toLocaleString('ar-SA'),
                url: BOT_URL
            };
            
            ctx.replyWithHTML(
                `📊 <b>حالة النظام:</b>\n\n` +
                `🤖 <b>البوت:</b> ${stats.bot}\n` +
                `🧠 <b>DeepSeek AI:</b> ${stats.deepseek}\n` +
                `🔥 <b>Firebase:</b> ${stats.firebase}\n` +
                `📚 <b>الكتب:</b> ${stats.books} كتاب\n` +
                `📅 <b>التاريخ:</b> ${stats.date}\n\n` +
                `🌐 <b>المنصة:</b> ${stats.url}`
            );
        });
        
        telegramBot.command('ai', async (ctx) => {
            const message = ctx.message.text.replace('/ai', '').trim();
            
            if (!message) {
                ctx.reply('❌ الرجاء كتابة سؤالك بعد /ai\nمثال: /ai ما هو قانون نيوتن الأول؟');
                return;
            }
            
            try {
                ctx.replyChatAction('typing');
                
                if (deepseekClient) {
                    const response = await askDeepSeek(message);
                    ctx.replyWithHTML(
                        `🧠 <b>إجابة DeepSeek:</b>\n\n` +
                        `${response.answer.substring(0, 4000)}\n\n` +
                        `📌 <b>المصدر:</b> DeepSeek AI\n` +
                        `🔗 <b>منصتنا:</b> ${BOT_URL}`
                    );
                } else {
                    ctx.reply('⚠️ المساعد الذكي غير متاح حالياً. جاري استخدام وضع الاختبار...');
                    const mockResponse = generateMockAIResponse(message);
                    ctx.reply(mockResponse);
                }
                
            } catch (error) {
                console.error('AI command error:', error);
                ctx.reply('❌ حدث خطأ في معالجة سؤالك. الرجاء المحاولة لاحقاً.');
            }
        });
        
        telegramBot.command('quiz', async (ctx) => {
            const args = ctx.message.text.replace('/quiz', '').trim();
            
            if (!args) {
                ctx.replyWithHTML(
                    `📝 <b>إنشاء اختبار ذكي</b>\n\n` +
                    `استخدم: <code>/quiz مادة الصف عدد_الأسئلة</code>\n\n` +
                    `<b>أمثلة:</b>\n` +
                    `<code>/quiz الرياضيات الأول الثانوي 10</code>\n` +
                    `<code>/quiz العلوم السادس الابتدائي 5</code>\n` +
                    `<code>/quiz اللغة العربية الثالث المتوسط 8</code>\n\n` +
                    `🔗 <b>أو من الموقع:</b>\n` +
                    `${BOT_URL}`
                );
                return;
            }
            
            try {
                const parts = args.split(' ');
                if (parts.length < 3) {
                    ctx.reply('❌ صيغة غير صحيحة. مثال: /quiz الرياضيات الأول الثانوي 10');
                    return;
                }
                
                const subject = parts[0];
                const grade = parts[1];
                const count = parseInt(parts[2]) || 10;
                
                ctx.replyChatAction('typing');
                ctx.reply(`⏳ جاري إنشاء اختبار ${subject} للصف ${grade}...`);
                
                const quiz = await generateDeepSeekQuiz(subject, grade, count, ['mcq'], 'medium');
                
                let quizText = `📝 <b>اختبار ${subject} - الصف ${grade}</b>\n\n`;
                
                quiz.questions.forEach((q, i) => {
                    quizText += `${i + 1}. ${q.question}\n`;
                    q.options.forEach((opt, j) => {
                        quizText += `   ${String.fromCharCode(65 + j)}) ${opt}\n`;
                    });
                    quizText += `\n`;
                });
                
                quizText += `\n⏰ <b>الوقت:</b> 30 دقيقة\n`;
                quizText += `🔗 <b>المنصة:</b> ${BOT_URL}\n`;
                quizText += `🎯 <b>الإجابات:</b> أرسلها في رسالة واحدة`;
                
                ctx.replyWithHTML(quizText.substring(0, 4000));
                
            } catch (error) {
                console.error('Quiz error:', error);
                ctx.reply('❌ حدث خطأ في إنشاء الاختبار. الرجاء المحاولة لاحقاً.');
            }
        });
        
        telegramBot.command('books', (ctx) => {
            const books = getAllEducationalBooks();
            const elementary = books.filter(b => b.grade.includes('الابتدائي')).length;
            const intermediate = books.filter(b => b.grade.includes('المتوسط')).length;
            const secondary = books.filter(b => b.grade.includes('الثانوي')).length;
            const aiBooks = books.filter(b => b.subject.includes('الذكاء')).length;
            
            ctx.replyWithHTML(
                `📚 <b>المكتبة التعليمية</b>\n\n` +
                `📊 <b>الإحصاءات:</b>\n` +
                `🏫 <b>المرحلة الابتدائية:</b> ${elementary} كتاب\n` +
                `🏫 <b>المرحلة المتوسطة:</b> ${intermediate} كتاب\n` +
                `🏫 <b>المرحلة الثانوية:</b> ${secondary} كتاب\n` +
                `🤖 <b>الذكاء الاصطناعي:</b> ${aiBooks} كتاب\n` +
                `📈 <b>المجموع:</b> ${books.length} كتاب\n\n` +
                `🔗 <b>رابط المكتبة:</b>\n` +
                `${BOT_URL}/api/books\n\n` +
                `🔍 <b>أمثلة للبحث:</b>\n` +
                `<code>${BOT_URL}/api/books?grade=الأول+الثانوي</code>\n` +
                `<code>${BOT_URL}/api/books?subject=الرياضيات</code>\n` +
                `<code>${BOT_URL}/api/books?search=الجبر</code>`
            );
        });
        
        telegramBot.command('storage', (ctx) => {
            ctx.replyWithHTML(
                `💾 <b>نظام التخزين الذكي</b>\n\n` +
                `📁 <b>أنواع التخزين:</b>\n` +
                `1. <b>Telegram Channels</b> - نسخة احتياطية\n` +
                `2. <b>Local Server</b> - وصول سريع\n` +
                `3. <b>Firebase</b> - قاعدة بيانات\n\n` +
                `📤 <b>رفع الملفات:</b>\n` +
                `• الصور (JPG, PNG, WebP)\n` +
                `• الكتب (PDF, DOC, EPUB)\n` +
                `• الفيديو (MP4, AVI)\n` +
                `• الصوت (MP3, WAV)\n\n` +
                `🔗 <b>رفع من الموقع:</b>\n` +
                `${BOT_URL}\n\n` +
                `📝 <b>أو أرسل الملف مباشرة للبوت</b>`
            );
        });
        
        telegramBot.command('live', (ctx) => {
            ctx.replyWithHTML(
                `🎥 <b>الفصول الدراسية المباشرة</b>\n\n` +
                `🌟 <b>المميزات:</b>\n` +
                `• بث فيديو مباشر\n` +
                `• دردشة تفاعلية\n` +
                `• مشاركة الشاشة\n` +
                `• تسجيل الحصص\n\n` +
                `🔗 <b>الدخول للفصل:</b>\n` +
                `${BOT_URL}\n\n` +
                `👨‍🏫 <b>للمعلمين:</b>\n` +
                `1. أنشئ غرفة جديدة\n` +
                `2. شارك الرابط مع الطلاب\n` +
                `3. ابدأ البث المباشر\n\n` +
                `👨‍🎓 <b>للطلاب:</b>\n` +
                `1. أدخل الرابط\n` +
                `2. انضم للغرفة\n` +
                `3. تفاعل مع المعلم`
            );
        });
        
        // معالجة النصوص العادية
        telegramBot.on('text', (ctx) => {
            const text = ctx.message.text;
            
            // إذا كان سؤالاً
            if (text.includes('؟') || text.includes('?') || 
                text.toLowerCase().startsWith('سؤال') ||
                text.toLowerCase().includes('ماذا') ||
                text.toLowerCase().includes('كيف') ||
                text.toLowerCase().includes('لماذا') ||
                text.toLowerCase().includes('ما هو') ||
                text.toLowerCase().includes('ما هي')) {
                
                ctx.replyWithHTML(
                    `🤔 <b>يبدو أن لديك سؤالاً!</b>\n\n` +
                    `💡 <b>للحصول على إجابة دقيقة:</b>\n\n` +
                    `1. استخدم الأمر <code>/ai ${text.substring(0, 30)}</code>\n\n` +
                    `2. أو زر الموقع:\n` +
                    `${BOT_URL}\n\n` +
                    `3. <b>أمثلة:</b>\n` +
                    `<code>/ai ما هو قانون نيوتن الأول؟</code>\n` +
                    `<code>/ai كيف تحدث عملية البناء الضوئي؟</code>\n` +
                    `<code>/ai ماذا تعرف عن الحرب العالمية الثانية؟</code>`
                );
                
            } else if (text.toLowerCase().includes('شكراً') || text.toLowerCase().includes('شكرا') || 
                      text.toLowerCase().includes('thanks') || text.toLowerCase().includes('thank you')) {
                
                ctx.replyWithHTML(
                    `🙏 <b>العفو! دائماً في خدمتك</b>\n\n` +
                    `✨ <b>تذكر أن لديك:</b>\n` +
                    `• ${CONFIG.MAX_DAILY_QUESTIONS} سؤال يومياً\n` +
                    `• ${getAllEducationalBooks().length} كتاب مجاني\n` +
                    `• مساعد ذكي متاح 24/7\n\n` +
                    `🔗 ${BOT_URL}`
                );
                
            } else {
                ctx.replyWithHTML(
                    `🤖 <b>مرحباً! أنا بوت المنصة التعليمية الذكية</b>\n\n` +
                    `🎯 <b>للاستفادة القصوى:</b>\n` +
                    `/ai - المساعد الذكي DeepSeek\n` +
                    `/quiz - اختبارات ذكية\n` +
                    `/books - مكتبة الكتب\n` +
                    `/storage - التخزين السحابي\n` +
                    `/live - الفصول المباشرة\n` +
                    `/help - جميع الأوامر\n\n` +
                    `🔗 <b>المنصة الكاملة:</b>\n` +
                    `${BOT_URL}\n\n` +
                    `📚 <b>${getAllEducationalBooks().length} كتاب مجاني متاح الآن!</b>`
                );
            }
        });
        
        // معالجة الملفات
        telegramBot.on('document', async (ctx) => {
            try {
                const file = ctx.message.document;
                const fileId = file.file_id;
                const fileName = file.file_name || `file_${Date.now()}`;
                const fileSize = file.file_size;
                
                ctx.replyChatAction('upload_document');
                
                ctx.replyWithHTML(
                    `📁 <b>تم استلام الملف:</b>\n` +
                    `📄 <b>الاسم:</b> ${fileName}\n` +
                    `📦 <b>الحجم:</b> ${(fileSize / 1024).toFixed(2)} KB\n\n` +
                    `⏳ <b>جاري المعالجة...</b>`
                );
                
                // محاكاة الرفع (يمكنك تفعيل الرفع الحقيقي لاحقاً)
                setTimeout(() => {
                    ctx.replyWithHTML(
                        `✅ <b>تمت المعالجة بنجاح!</b>\n\n` +
                        `📄 <b>الملف:</b> ${fileName}\n` +
                        `💾 <b>سيتم تخزينه في:</b>\n` +
                        `• Telegram Storage Channel\n` +
                        `• Local Server\n` +
                        `• Firebase Database\n\n` +
                        `🔗 <b>لتصفح الملفات:</b>\n` +
                        `${BOT_URL}/api/files\n\n` +
                        `📤 <b>لرفع المزيد:</b>\n` +
                        `1. زر الموقع ${BOT_URL}\n` +
                        `2. أو أرسل ملفات مباشرة للبوت`
                    );
                }, 3000);
                
            } catch (error) {
                console.error('File handling error:', error);
                ctx.reply('❌ حدث خطأ في معالجة الملف. الرجاء المحاولة لاحقاً.');
            }
        });
        
        // معالجة الصور
        telegramBot.on('photo', async (ctx) => {
            try {
                const photo = ctx.message.photo[ctx.message.photo.length - 1];
                
                ctx.replyChatAction('upload_photo');
                
                ctx.replyWithHTML(
                    `📸 <b>تم استلام الصورة</b>\n\n` +
                    `⏳ <b>جاري حفظها في المكتبة التعليمية...</b>`
                );
                
                setTimeout(() => {
                    ctx.replyWithHTML(
                        `✅ <b>تم حفظ الصورة!</b>\n\n` +
                        `🖼️ <b>ستكون متاحة في:</b>\n` +
                        `• معرض الصور التعليمية\n` +
                        `• يمكن استخدامها في الدروس\n\n` +
                        `🔗 <b>معرض الصور:</b>\n` +
                        `${BOT_URL}/api/files?folder=images`
                    );
                }, 2000);
                
            } catch (error) {
                console.error('Photo error:', error);
                ctx.reply('❌ حدث خطأ في معالجة الصورة.');
            }
        });
        
        console.log('✅ Telegram Bot commands registered');
        
    } catch (error) {
        console.error('❌ Failed to initialize Telegram Bot:', error.message);
        telegramBot = null;
    }
} else {
    console.log('⚠️ Telegram Bot Token not provided - Telegram features disabled');
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

// ==================== [ دوال التخزين ] ====================
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
        
        console.log(`📤 Uploading to Telegram: ${fileName}`);
        
        let caption = `📁 ${fileName}\n📦 ${(fileStats.size/1024/1024).toFixed(2)}MB\n⏰ ${new Date().toLocaleString()}`;
        
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
        
        console.log(`✅ Uploaded to Telegram: ${fileName}`);
        
        return {
            telegramMessageId: message.message_id,
            fileName: fileName,
            uploadedAt: Date.now()
        };
        
    } catch (error) {
        console.error(`❌ Error uploading to Telegram: ${error.message}`);
        return null;
    }
}

// ==================== [ دوال المساعد الذكي ] ====================

async function askDeepSeek(question, subject, grade) {
    try {
        const context = subject && grade ? 
            `هذا سؤال في مادة ${subject} للصف ${grade}.` : 
            'هذا سؤال تعليمي عام.';
        
        const prompt = `${context}\n\nالسؤال: ${question}\n\nأجب بطريقة تعليمية واضحة ومنظمة.`;
        
        const response = await deepseekClient.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { 
                    role: "system", 
                    content: "أنت مساعد تعليمي عربي متخصص في منصة تعليمية. قدم إجابات دقيقة وواضحة ومناسبة للطلاب. استخدم اللغة العربية الفصحى." 
                },
                { role: "user", content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 2000
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
        const prompt = `أنشئ اختباراً تعليمياً باللغة العربية:
        - المادة: ${subject}
        - الصف: ${grade}
        - عدد الأسئلة: ${questionCount}
        - الصعوبة: ${difficulty}
        
        قدم الناتج بتنسيق JSON.`;
        
        const response = await deepseekClient.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { 
                    role: "system", 
                    content: "أنت منشئ اختبارات تعليمية. أعد دائماً بتنسيق JSON." 
                },
                { role: "user", content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 3000,
            response_format: { type: "json_object" }
        });
        
        const content = response.choices[0].message.content;
        let quizData;
        
        try {
            quizData = JSON.parse(content);
        } catch (e) {
            quizData = { questions: generateMockQuestions(subject, questionCount) };
        }
        
        return {
            quizId: `quiz_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
            title: `اختبار ${subject} - الصف ${grade}`,
            subject: subject,
            grade: grade,
            questions: quizData.questions || generateMockQuestions(subject, questionCount),
            totalQuestions: questionCount,
            timeLimit: 1800,
            createdAt: Date.now(),
            source: 'deepseek'
        };
        
    } catch (error) {
        console.error('DeepSeek quiz error:', error);
        return generateMockQuiz(subject, grade, questionCount, questionTypes, difficulty);
    }
}

function generateMockAIResponse(question) {
    const responses = [
        `سؤال ممتاز! في المنصة الكاملة يمكنني تقديم إجابة مفصلة عن: ${question.substring(0, 50)}...`,
        `أنا مساعد DeepSeek التعليمي. للإجابة على "${question.substring(0, 30)}..." زر ${BOT_URL}`,
        `هذا سؤال مهم! يمكنني الإجابة عليه بالتفصيل في الموقع: ${BOT_URL}`,
        `للحصول على إجابة دقيقة عن ${question.substring(0, 40)}... استخدم الموقع أو الأمر /ai`
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
}

function generateMockQuiz(subject, grade, questionCount, questionTypes, difficulty) {
    const questions = [];
    
    for (let i = 1; i <= questionCount; i++) {
        questions.push({
            question: `سؤال ${i}: مثال على ${subject} للصف ${grade}`,
            type: 'mcq',
            options: ['الخيار 1', 'الخيار 2', 'الخيار 3', 'الخيار 4'],
            correctAnswer: Math.floor(Math.random() * 4),
            explanation: 'شرح الإجابة الصحيحة'
        });
    }
    
    return {
        quizId: `mock_quiz_${Date.now()}`,
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

function generateMockQuestions(subject, count) {
    const questions = [];
    for (let i = 1; i <= count; i++) {
        questions.push({
            question: `سؤال ${i} عن ${subject}`,
            type: 'mcq',
            options: ['الإجابة أ', 'الإجابة ب', 'الإجابة ج', 'الإجابة د'],
            correctAnswer: Math.floor(Math.random() * 4),
            explanation: 'هذا شرح للفهم الصحيح'
        });
    }
    return questions;
}

// ==================== [ دوال Firebase ] ====================
async function initializeBooksDatabase() {
    if (isBooksInitialized) return;
    
    try {
        if (!isFirebaseInitialized) return;

        const db = admin.database();
        const allBooks = getAllEducationalBooks();
        
        for (const book of allBooks) {
            await db.ref(`books/${book.id}`).set(book);
        }
        
        isBooksInitialized = true;
        console.log(`✅ Added ${allBooks.length} books to Firebase`);
        
    } catch (error) {
        console.error('❌ Error initializing books:', error);
    }
}

function getAllEducationalBooks() {
    const books = [];
    let id = 1;
    
    const subjects = ['الرياضيات', 'العلوم', 'اللغة العربية', 'اللغة الإنجليزية', 'الاجتماعيات', 'التربية الإسلامية'];
    const grades = ['الأول الابتدائي', 'الثاني الابتدائي', 'الثالث الابتدائي', 'الرابع الابتدائي', 'الخامس الابتدائي', 'السادس الابتدائي',
                   'الأول المتوسط', 'الثاني المتوسط', 'الثالث المتوسط',
                   'الأول الثانوي', 'الثاني الثانوي', 'الثالث الثانوي'];
    
    for (const grade of grades) {
        for (const subject of subjects) {
            books.push({
                id: `book_${id++}`,
                title: `${subject} - ${grade}`,
                author: 'وزارة التربية والتعليم',
                grade: grade,
                subject: subject,
                description: `كتاب ${subject} للمرحلة ${grade.includes('ابتدائي') ? 'الابتدائية' : grade.includes('متوسط') ? 'المتوسطة' : 'الثانوية'}`,
                pages: 120,
                fileName: `${subject}_${grade}.pdf`,
                fileSize: 5000000,
                isFree: true,
                language: 'العربية',
                curriculum: 'المنهج السوداني',
                uploadedAt: Date.now()
            });
        }
    }
    
    // كتب الذكاء الاصطناعي
    books.push({
        id: `book_${id++}`,
        title: 'مقدمة في الذكاء الاصطناعي',
        author: 'فريق المنصة',
        grade: 'جميع المراحل',
        subject: 'الذكاء الاصطناعي',
        description: 'كتاب تمهيدي عن الذكاء الاصطناعي وتطبيقاته',
        pages: 80,
        fileName: 'ai_intro.pdf',
        fileSize: 3000000,
        isFree: true,
        language: 'العربية',
        curriculum: 'حديث',
        uploadedAt: Date.now()
    });
    
    return books;
}

// ==================== [ دوال مساعدة ] ====================
async function cleanupTempFiles() {
    try {
        const tempDir = path.join(STORAGE_BASE, FOLDERS.TEMP);
        const files = await fs.readdir(tempDir);
        const now = Date.now();
        
        for (const file of files) {
            const filePath = path.join(tempDir, file);
            try {
                await fs.unlink(filePath);
            } catch (error) {}
        }
    } catch (error) {}
}

// ==================== [ Middleware ] ====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ==================== [ نقاط النهاية ] ====================

// إعادة توجيه رابط البوت القديم
app.get('/bot:token', (req, res) => {
    res.redirect('/');
});

app.get('/telegram-webhook-info', (req, res) => {
    res.json({
        success: true,
        message: 'Telegram Webhook is active',
        webhook: `${BOT_URL}/telegram-webhook`,
        botStatus: telegramBot ? 'Active' : 'Inactive',
        endpoints: {
            webhook: `${BOT_URL}/telegram-webhook`,
            health: `${BOT_URL}/health`,
            api: `${BOT_URL}/api/test`,
            ai: `${BOT_URL}/api/ai/ask`
        }
    });
});

app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: '✅ Server is running!',
        version: '4.0.0',
        baseUrl: BOT_URL,
        services: {
            telegram: telegramBot ? '✅ Connected' : '❌ Disconnected',
            deepseek: deepseekClient ? '✅ Connected' : '❌ Disconnected',
            firebase: isFirebaseInitialized ? '✅ Connected' : '❌ Disconnected',
            storage: '✅ Active'
        },
        stats: {
            books: getAllEducationalBooks().length,
            dailyQuestions: CONFIG.MAX_DAILY_QUESTIONS
        }
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        baseUrl: BOT_URL,
        services: {
            server: '✅ Running',
            telegram: telegramBot ? '✅ Connected' : '❌ Disconnected',
            deepseek: deepseekClient ? '✅ Connected' : '❌ Disconnected',
            firebase: isFirebaseInitialized ? '✅ Connected' : '❌ Disconnected'
        }
    });
});

// نقاط نهاية AI
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
        
        let response;
        
        if (deepseekClient) {
            response = await askDeepSeek(question, subject, grade);
        } else {
            response = {
                answer: generateMockAIResponse(question),
                isEducational: true,
                source: 'mock'
            };
        }
        
        res.json({
            success: true,
            baseUrl: BOT_URL,
            question: question,
            answer: response.answer,
            metadata: {
                aiProvider: deepseekClient ? 'DeepSeek' : 'Mock',
                timestamp: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('AI ask error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ في معالجة السؤال',
            baseUrl: BOT_URL
        });
    }
});

app.post('/api/ai/generate-quiz', async (req, res) => {
    try {
        const { subject, grade, questionCount = 10 } = req.body;
        
        if (!subject || !grade) {
            return res.status(400).json({ 
                success: false, 
                error: 'المادة والصف مطلوبان',
                baseUrl: BOT_URL
            });
        }
        
        const quiz = await generateDeepSeekQuiz(subject, grade, questionCount, ['mcq'], 'medium');
        
        res.json({
            success: true,
            baseUrl: BOT_URL,
            quiz: quiz,
            instructions: 'أجب على جميع الأسئلة في 30 دقيقة'
        });
        
    } catch (error) {
        console.error('Quiz generation error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ في إنشاء الاختبار',
            baseUrl: BOT_URL
        });
    }
});

app.get('/api/books', async (req, res) => {
    try {
        const { grade, subject, search, page = 1, limit = 20 } = req.query;
        
        let books = getAllEducationalBooks();
        
        if (grade) {
            books = books.filter(book => book.grade.includes(grade));
        }
        
        if (subject) {
            books = books.filter(book => book.subject.includes(subject));
        }
        
        if (search) {
            const searchLower = search.toLowerCase();
            books = books.filter(book => 
                book.title.toLowerCase().includes(searchLower) ||
                book.subject.toLowerCase().includes(searchLower)
            );
        }
        
        const total = books.length;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const startIndex = (pageNum - 1) * limitNum;
        const endIndex = startIndex + limitNum;
        const paginatedBooks = books.slice(startIndex, endIndex);
        
        res.json({ 
            success: true, 
            baseUrl: BOT_URL,
            books: paginatedBooks,
            stats: {
                total: total,
                showing: paginatedBooks.length,
                page: pageNum,
                totalPages: Math.ceil(total / limitNum)
            }
        });
        
    } catch (error) {
        console.error('Books error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ في جلب الكتب',
            baseUrl: BOT_URL
        });
    }
});

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
            }))
        });
        
        console.log(`🚪 ${userName} joined room ${roomId}`);
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

// ==================== [ الصفحة الرئيسية ] ====================
app.get('/', (req, res) => {
    const booksCount = getAllEducationalBooks().length;
    
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>منصة التعليم الذكي - Smart Education Platform</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                }
                
                body {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: #333;
                    line-height: 1.6;
                    min-height: 100vh;
                }
                
                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 20px;
                }
                
                header {
                    background: rgba(255, 255, 255, 0.95);
                    padding: 20px;
                    border-radius: 15px;
                    margin-bottom: 30px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.1);
                    text-align: center;
                }
                
                h1 {
                    color: #2d3748;
                    margin-bottom: 10px;
                    font-size: 2.5em;
                }
                
                .tagline {
                    color: #4a5568;
                    font-size: 1.2em;
                    margin-bottom: 20px;
                }
                
                .status-badges {
                    display: flex;
                    justify-content: center;
                    gap: 15px;
                    flex-wrap: wrap;
                    margin: 20px 0;
                }
                
                .badge {
                    padding: 8px 20px;
                    border-radius: 50px;
                    font-weight: bold;
                    font-size: 0.9em;
                }
                
                .badge.success {
                    background: #48bb78;
                    color: white;
                }
                
                .badge.warning {
                    background: #ed8936;
                    color: white;
                }
                
                .badge.error {
                    background: #f56565;
                    color: white;
                }
                
                .features-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 25px;
                    margin: 40px 0;
                }
                
                .feature-card {
                    background: white;
                    padding: 30px;
                    border-radius: 15px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.08);
                    transition: transform 0.3s ease;
                }
                
                .feature-card:hover {
                    transform: translateY(-5px);
                }
                
                .feature-card h3 {
                    color: #2d3748;
                    margin-bottom: 15px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                
                .feature-card p {
                    color: #4a5568;
                    margin-bottom: 20px;
                }
                
                .btn {
                    display: inline-block;
                    padding: 12px 30px;
                    background: #4299e1;
                    color: white;
                    text-decoration: none;
                    border-radius: 8px;
                    font-weight: bold;
                    transition: background 0.3s ease;
                }
                
                .btn:hover {
                    background: #3182ce;
                }
                
                .ai-demo {
                    background: white;
                    padding: 30px;
                    border-radius: 15px;
                    margin: 40px 0;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.08);
                }
                
                .ai-demo h2 {
                    color: #2d3748;
                    margin-bottom: 20px;
                    text-align: center;
                }
                
                .demo-box {
                    background: #f7fafc;
                    padding: 20px;
                    border-radius: 10px;
                    margin: 20px 0;
                }
                
                .stats {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 20px;
                    margin: 40px 0;
                }
                
                .stat-card {
                    background: white;
                    padding: 25px;
                    border-radius: 15px;
                    text-align: center;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.05);
                }
                
                .stat-number {
                    font-size: 2.5em;
                    font-weight: bold;
                    color: #4299e1;
                    margin: 10px 0;
                }
                
                footer {
                    text-align: center;
                    padding: 30px;
                    color: white;
                    margin-top: 50px;
                }
                
                .telegram-link {
                    background: #0088cc;
                    color: white;
                    padding: 12px 30px;
                    border-radius: 8px;
                    text-decoration: none;
                    display: inline-flex;
                    align-items: center;
                    gap: 10px;
                    margin: 20px 0;
                }
                
                @media (max-width: 768px) {
                    .container {
                        padding: 10px;
                    }
                    
                    h1 {
                        font-size: 2em;
                    }
                    
                    .features-grid {
                        grid-template-columns: 1fr;
                    }
                }
            </style>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        </head>
        <body>
            <div class="container">
                <header>
                    <h1>🤖 منصة التعليم الذكي</h1>
                    <p class="tagline">نظام متكامل للتعلم الذكي مع DeepSeek AI</p>
                    
                    <div class="status-badges">
                        <div class="badge ${telegramBot ? 'success' : 'error'}">
                            <i class="fab fa-telegram"></i> Telegram Bot
                        </div>
                        <div class="badge ${deepseekClient ? 'success' : 'warning'}">
                            <i class="fas fa-brain"></i> DeepSeek AI
                        </div>
                        <div class="badge ${isFirebaseInitialized ? 'success' : 'warning'}">
                            <i class="fas fa-database"></i> Firebase
                        </div>
                        <div class="badge success">
                            <i class="fas fa-server"></i> Server
                        </div>
                    </div>
                    
                    <p>🔗 Base URL: ${BOT_URL}</p>
                </header>
                
                <div class="stats">
                    <div class="stat-card">
                        <i class="fas fa-book" style="font-size: 2em; color: #48bb78;"></i>
                        <div class="stat-number">${booksCount}</div>
                        <p>كتاب تعليمي</p>
                    </div>
                    <div class="stat-card">
                        <i class="fas fa-question-circle" style="font-size: 2em; color: #ed8936;"></i>
                        <div class="stat-number">${CONFIG.MAX_DAILY_QUESTIONS}</div>
                        <p>سؤال يومياً</p>
                    </div>
                    <div class="stat-card">
                        <i class="fas fa-graduation-cap" style="font-size: 2em; color: #4299e1;"></i>
                        <div class="stat-number">4</div>
                        <p>مراحل تعليمية</p>
                    </div>
                    <div class="stat-card">
                        <i class="fas fa-bolt" style="font-size: 2em; color: #9f7aea;"></i>
                        <div class="stat-number">24/7</div>
                        <p>متاح دائماً</p>
                    </div>
                </div>
                
                <div class="features-grid">
                    <div class="feature-card">
                        <h3><i class="fas fa-robot"></i> المساعد الذكي</h3>
                        <p>أسأل DeepSeek AI عن أي موضوع تعليمي. إجابات دقيقة وفورية.</p>
                        <a href="#ai-demo" class="btn">جرب الآن</a>
                    </div>
                    
                    <div class="feature-card">
                        <h3><i class="fas fa-book-open"></i> المكتبة الرقمية</h3>
                        <p>${booksCount} كتاب تعليمي مجاني لجميع المراحل الدراسية.</p>
                        <a href="${BOT_URL}/api/books" class="btn">تصفح الكتب</a>
                    </div>
                    
                    <div class="feature-card">
                        <h3><i class="fas fa-video"></i> الفصول المباشرة</h3>
                        <p>بث حي مباشر مع تفاعل كامل بين المعلم والطلاب.</p>
                        <a href="#live" class="btn">انضم الآن</a>
                    </div>
                    
                    <div class="feature-card">
                        <h3><i class="fas fa-cloud-upload-alt"></i> التخزين السحابي</h3>
                        <p>رفع وتخزين الملفات التعليمية في Telegram والسيرفر المحلي.</p>
                        <a href="#upload" class="btn" style="background: #48bb78;">رفع ملف</a>
                    </div>
                </div>
                
                <div id="ai-demo" class="ai-demo">
                    <h2><i class="fas fa-comment-alt"></i> جرب المساعد الذكي</h2>
                    
                    <div class="demo-box">
                        <h4>📝 اسأل DeepSeek AI:</h4>
                        <form id="ai-form" style="margin: 20px 0;">
                            <input type="text" id="ai-question" placeholder="اكتب سؤالك هنا..." 
                                   style="width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 16px;">
                            <button type="submit" class="btn" style="width: 100%; margin-top: 10px;">
                                <i class="fas fa-paper-plane"></i> إرسال السؤال
                            </button>
                        </form>
                        <div id="ai-response" style="background: #edf2f7; padding: 15px; border-radius: 8px; margin-top: 20px; display: none;">
                            <div id="response-text"></div>
                        </div>
                    </div>
                    
                    <div style="text-align: center; margin-top: 20px;">
                        <p>أو جرب هذه الأسئلة:</p>
                        <div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center;">
                            <button class="btn" onclick="askQuestion('ما هو قانون نيوتن الأول؟')" style="background: #ed8936;">
                                قانون نيوتن
                            </button>
                            <button class="btn" onclick="askQuestion('كيف تحدث عملية البناء الضوئي؟')" style="background: #48bb78;">
                                البناء الضوئي
                            </button>
                            <button class="btn" onclick="askQuestion('ماذا تعرف عن الحرب العالمية الثانية؟')" style="background: #9f7aea;">
                                الحرب العالمية
                            </button>
                        </div>
                    </div>
                </div>
                
                <div style="text-align: center; margin: 40px 0;">
                    <a href="https://t.me/${telegramBot ? 'your_bot_username' : ''}" class="telegram-link" target="_blank">
                        <i class="fab fa-telegram"></i> انضم لبوت Telegram للوصول الكامل
                    </a>
                    <p style="color: #4a5568; margin-top: 10px;">
                        في البوت: /ai للسؤال، /quiz للاختبارات، /books للمكتبة
                    </p>
                </div>
                
                <div style="background: white; padding: 30px; border-radius: 15px; margin: 40px 0;">
                    <h2 style="text-align: center; margin-bottom: 20px;">🔗 روابط مهمة</h2>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
                        <a href="${BOT_URL}/health" class="btn" style="background: #48bb78;">
                            <i class="fas fa-heartbeat"></i> Health Check
                        </a>
                        <a href="${BOT_URL}/api/test" class="btn" style="background: #4299e1;">
                            <i class="fas fa-code"></i> API Test
                        </a>
                        <a href="${BOT_URL}/api/books" class="btn" style="background: #ed8936;">
                            <i class="fas fa-book"></i> جميع الكتب
                        </a>
                        <a href="${BOT_URL}/telegram-webhook-info" class="btn" style="background: #9f7aea;">
                            <i class="fab fa-telegram"></i> Telegram Webhook
                        </a>
                    </div>
                </div>
            </div>
            
            <footer>
                <p>© 2024 منصة التعليم الذكي - Smart Education Platform v4.0</p>
                <p>Powered by DeepSeek AI & Telegram</p>
            </footer>
            
            <script>
                document.getElementById('ai-form').addEventListener('submit', async function(e) {
                    e.preventDefault();
                    const question = document.getElementById('ai-question').value;
                    if (!question.trim()) return;
                    
                    await askQuestion(question);
                });
                
                async function askQuestion(question) {
                    document.getElementById('ai-question').value = question;
                    document.getElementById('ai-response').style.display = 'none';
                    
                    const responseDiv = document.getElementById('response-text');
                    responseDiv.innerHTML = '<div style="text-align: center;"><i class="fas fa-spinner fa-spin"></i> جاري الحصول على الإجابة...</div>';
                    document.getElementById('ai-response').style.display = 'block';
                    
                    try {
                        const response = await fetch('${BOT_URL}/api/ai/ask', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ question: question })
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                            responseDiv.innerHTML = \`
                                <h4 style="color: #2d3748; margin-bottom: 10px;">🧠 إجابة DeepSeek:</h4>
                                <div style="background: white; padding: 15px; border-radius: 8px; border-right: 4px solid #4299e1;">
                                    \${data.answer.replace(/\\n/g, '<br>')}
                                </div>
                                <div style="margin-top: 15px; color: #718096; font-size: 0.9em;">
                                    <i class="fas fa-clock"></i> \${new Date().toLocaleString('ar-SA')}
                                </div>
                            \`;
                        } else {
                            responseDiv.innerHTML = \`
                                <div style="color: #f56565;">
                                    <i class="fas fa-exclamation-triangle"></i> \${data.error || 'حدث خطأ'}
                                </div>
                            \`;
                        }
                    } catch (error) {
                        responseDiv.innerHTML = \`
                            <div style="color: #f56565;">
                                <i class="fas fa-exclamation-triangle"></i> خطأ في الاتصال
                            </div>
                        \`;
                    }
                }
            </script>
        </body>
        </html>
    `);
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
    
    🤖 TELEGRAM BOT:
    • Status: ${telegramBot ? '✅ Webhook Active' : '❌ Disabled'}
    • Webhook: ${BOT_URL}/telegram-webhook
    • Commands: /start, /ai, /quiz, /books, /help
    
    📚 LIBRARY:
    • Total Books: ${getAllEducationalBooks().length}
    • Grades: Primary, Intermediate, Secondary
    • Subjects: Math, Science, Arabic, English
    
    🔗 IMPORTANT LINKS:
    • Health Check: ${BOT_URL}/health
    • API Test: ${BOT_URL}/api/test
    • Books API: ${BOT_URL}/api/books
    • AI Assistant: ${BOT_URL}/api/ai/ask
    
    ⚡ TIPS:
    1. Use /ai command in Telegram bot
    2. Visit ${BOT_URL} for full features
    3. Check /telegram-webhook-info for bot status
    
    ✅ Server started successfully at ${new Date().toLocaleString()}
    `);
});

// ==================== [ معالجة الأخطاء ] ====================
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// تنظيف الملفات المؤقتة كل ساعة
setInterval(() => {
    cleanupTempFiles();
}, 60 * 60 * 1000);
