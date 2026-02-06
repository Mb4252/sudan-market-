const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const admin = require('firebase-admin');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
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

// ==================== [ Middleware الأساسية في البداية ] ====================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== [ Middleware للتسجيل الآمن ] ====================
app.use((req, res, next) => {
    const timestamp = new Date().toLocaleTimeString();
    const method = req.method;
    let url = req.url;
    
    // إخفاء التوكن من السجلات
    if (url.includes('/bot') && telegramBot) {
        url = '/bot***TOKEN***';
    }
    
    console.log(`${method} ${url} - ${timestamp}`);
    next();
});

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
    ADMIN_PHONE: process.env.ADMIN_PHONE || "+249999999999", // تأكد من وجود +
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

if (CONFIG.TELEGRAM_BOT_TOKEN && CONFIG.TELEGRAM_BOT_TOKEN.length > 10) {
    try {
        telegramBot = new Telegraf(CONFIG.TELEGRAM_BOT_TOKEN);
        console.log('✅ Telegram Bot instance created');
        
        // ==================== [ تعريف Webhook Route ] ====================
        const webhookPath = `/bot${CONFIG.TELEGRAM_BOT_TOKEN}`;
        app.post(webhookPath, (req, res) => {
            console.log('📨 Received Telegram webhook request');
            
            if (!telegramBot) {
                console.log('⚠️ Bot not initialized yet');
                return res.sendStatus(200);
            }
            
            if (!req.body) {
                console.log('⚠️ Empty request body');
                return res.sendStatus(200);
            }
            
            try {
                telegramBot.handleUpdate(req.body, res);
                console.log('✅ Telegram update handled successfully');
            } catch (error) {
                console.error('❌ Error handling Telegram update:', error.message);
                res.sendStatus(200);
            }
        });
        
        console.log(`✅ Telegram webhook route registered`);
        
        // ==================== [ تأخير إعداد Webhook لمدة 2 ثانية ] ====================
        setTimeout(async () => {
            try {
                console.log('🔄 Setting up Telegram webhook...');
                
                // إعداد webhook
                const webhookUrl = `${BOT_URL}${webhookPath}`;
                console.log(`🔗 Webhook URL: ${BOT_URL}/bot***TOKEN***`);
                
                await telegramBot.telegram.setWebhook(webhookUrl, {
                    drop_pending_updates: true,
                    allowed_updates: ['message', 'callback_query']
                });
                
                console.log('✅ Telegram webhook set successfully');
                
                // إعداد الأوامر
                setupTelegramCommands();
                
                console.log('🤖 Telegram Bot is ready!');
                
            } catch (error) {
                console.error('❌ Error setting up Telegram webhook:', error.message);
                console.log('⚠️ Bot will still work, but webhook setup failed');
            }
        }, 2000);
        
    } catch (error) {
        console.error('❌ Failed to create Telegram Bot:', error.message);
        telegramBot = null;
    }
} else {
    console.log('⚠️ Telegram Bot Token not provided or invalid');
}

// ==================== [ إعداد أوامر Telegram ] ====================
function setupTelegramCommands() {
    if (!telegramBot) return;
    
    telegramBot.command('start', (ctx) => {
        console.log(`User ${ctx.from.id} used /start`);
        
        // إصلاح رقم الهاتف - إزالة + للرابط فقط
        const phoneForLink = CONFIG.ADMIN_PHONE.replace('+', '');
        
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
                        { 
                            text: "📞 الدعم الفني", 
                            url: `https://t.me/+${phoneForLink}` // استخدام رابط Telegram بدلاً من tel:
                        }
                    ]
                ]
            }
        });
    });
    
    telegramBot.command('subscribe', (ctx) => {
        console.log(`User ${ctx.from.id} used /subscribe`);
        
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
                        { text: "💳 إرسال إيصال دفع", callback_data: "send_payment" }
                    ],
                    [
                        { text: "🌐 زيارة المنصة", url: BOT_URL }
                    ]
                ]
            }
        });
    });
    
    telegramBot.command('status', (ctx) => {
        console.log(`User ${ctx.from.id} used /status`);
        
        const statusMessage = `
✅ **حالة النظام:**

🤖 *البوت:* 🟢 يعمل
🌐 *السيرفر:* ${BOT_URL}
📅 *الوقت:* ${new Date().toLocaleString('ar-SA')}

🔗 **رابط المنصة:** ${BOT_URL}
📞 **الدعم:** ${CONFIG.ADMIN_PHONE}
        `;
        
        ctx.reply(statusMessage, { parse_mode: 'Markdown' });
    });
    
    telegramBot.command('help', (ctx) => {
        console.log(`User ${ctx.from.id} used /help`);
        
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
    
    // معالجة callback queries
    telegramBot.on('callback_query', async (ctx) => {
        const callbackData = ctx.callbackQuery.data;
        console.log(`Callback query: ${callbackData} from ${ctx.from.id}`);
        
        if (callbackData === 'show_subscription') {
            await ctx.answerCbQuery('عرض خطط الاشتراك');
            ctx.reply(`💰 **خطط الاشتراك:**\n\n🎁 تجربة مجانية: ${CONFIG.FREE_TRIAL_DAYS} أيام\n📦 أسبوعي: ${CONFIG.WEEKLY_SUBSCRIPTION} SDG\n📅 شهري: ${CONFIG.MONTHLY_SUBSCRIPTION} SDG\n👨‍🏫 معلم: ${CONFIG.TEACHER_MONTHLY_FEE} SDG\n\n${BOT_URL}`, {
                parse_mode: 'Markdown'
            });
        }
        else if (callbackData === 'ask_ai') {
            await ctx.answerCbQuery('اسأل الذكاء الاصطناعي');
            ctx.reply(`🧠 **مساعد DeepSeek الذكي**\n\nيمكنك استخدام المساعد الذكي من خلال:\n\n1. زيارة ${BOT_URL}\n2. استخدام زر "اسأل AI"\n3. إرسال سؤالك التعليمي مباشرة\n\nللاستفادة الكاملة، يرجى الاشتراك في إحدى الخطط.`, {
                parse_mode: 'Markdown'
            });
        }
        else if (callbackData === 'live_stream') {
            await ctx.answerCbQuery('البث المباشر');
            ctx.reply(`🎥 **نظام البث المباشر**\n\nيمكنك استخدام نظام البث المباشر من خلال:\n\n1. زيارة ${BOT_URL}\n2. إنشاء غرفة بث جديدة\n3. دعوة الطلاب للانضمام\n\nللاستفادة الكاملة، يرجى الاشتراك في إحدى الخطط.`, {
                parse_mode: 'Markdown'
            });
        }
        else if (callbackData === 'show_books') {
            await ctx.answerCbQuery('المكتبة التعليمية');
            ctx.reply(`📚 **المكتبة التعليمية**\n\nيمكنك الوصول إلى المكتبة التعليمية من خلال:\n\n1. زيارة ${BOT_URL}\n2. الانتقال إلى قسم المكتبة\n3. تصفح الكتب حسب المرحلة والمادة\n\n🔗 ${BOT_URL}/api/books`, {
                parse_mode: 'Markdown'
            });
        }
        else if (callbackData === 'send_payment') {
            await ctx.answerCbQuery('إرسال إيصال الدفع');
            ctx.reply(`💳 **إرسال إيصال الدفع**\n\nلإرسال إيصال الدفع:\n\n1. أرسل صورة الإيصال\n2. اكتب رقم المعاملة\n3. اكتب المبلغ\n4. اكتب طريقة الدفع\n\n📞 للاستفسار: ${CONFIG.ADMIN_PHONE}`, {
                parse_mode: 'Markdown'
            });
        }
    });
    
    // معالجة الرسائل النصية العادية
    telegramBot.on('text', (ctx) => {
        const text = ctx.message.text;
        console.log(`Text message from ${ctx.from.id}: ${text.substring(0, 50)}...`);
        
        if (!text.startsWith('/')) {
            ctx.reply(`📝 *رسالتك:* ${text.substring(0, 100)}\n\nللاستفادة من خدمات المنصة التعليمية، يرجى:\n\n1. زيارة ${BOT_URL}\n2. استخدام /subscribe لعرض خطط الاشتراك\n3. التواصل مع الدعم: ${CONFIG.ADMIN_PHONE}`, {
                parse_mode: 'Markdown'
            });
        }
    });
    
    // معالجة الصور
    telegramBot.on('photo', (ctx) => {
        console.log(`Photo received from ${ctx.from.id}`);
        ctx.reply(`📸 **تم استلام صورة**\n\nإذا كانت هذه إيصال دفع، يرجى:\n\n1. إرسال رقم المعاملة\n2. طريقة الدفع\n3. المبلغ المدفوع\n4. رقم هاتفك\n\nأو تواصل مع الدعم: ${CONFIG.ADMIN_PHONE}`, {
            parse_mode: 'Markdown'
        });
    });
    
    // معالجة الأخطاء
    telegramBot.catch((err, ctx) => {
        console.error(`❌ Telegram Bot error for ${ctx.updateType}:`, err.message);
        try {
            ctx.reply(`❌ حدث خطأ: ${err.message}\n\nيرجى المحاولة مرة أخرى أو التواصل مع الدعم.`);
        } catch (e) {
            console.error('Failed to send error message:', e.message);
        }
    });
}

// ==================== [ تهيئة Firebase Admin ] ====================
let isFirebaseInitialized = false;

if (CONFIG.FIREBASE_JSON && Object.keys(CONFIG.FIREBASE_JSON).length > 0) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(CONFIG.FIREBASE_JSON),
            databaseURL: process.env.FIREBASE_DATABASE_URL || "https://sudan-market-6b122-default-rtdb.firebaseio.com",
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "sudan-market-6b122.appspot.com"
        });
        console.log('✅ Firebase Admin initialized successfully');
        isFirebaseInitialized = true;
        
    } catch (error) {
        console.error('❌ Failed to initialize Firebase Admin:', error.message);
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
        console.error('❌ Failed to initialize DeepSeek API:', error.message);
    }
} else {
    console.log('⚠️ DeepSeek API Key not provided - AI features disabled');
}

// ==================== [ نقاط النهاية الرئيسية ] ====================
app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: '✅ Server is running!', 
        time: new Date().toISOString(),
        server: 'Smart Education Platform v4.0',
        baseUrl: BOT_URL,
        status: 'active',
        version: '4.0.0',
        telegram: telegramBot ? 'connected' : 'disconnected',
        firebase: isFirebaseInitialized ? 'connected' : 'disconnected',
        deepseek: deepseekClient ? 'connected' : 'mock'
    });
});

app.get('/health', (req, res) => {
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
        config: {
            adminPhone: CONFIG.ADMIN_PHONE,
            adminBankAccount: CONFIG.ADMIN_BANK_ACCOUNT,
            adminName: CONFIG.ADMIN_NAME
        }
    });
});

// ==================== [ نقطة نهاية AI مبسطة ] ====================
app.post('/api/ai/ask', async (req, res) => {
    try {
        const { question } = req.body;
        
        if (!question) {
            return res.status(400).json({ 
                success: false, 
                error: 'السؤال مطلوب',
                serverUrl: BOT_URL 
            });
        }
        
        let answer;
        
        if (deepseekClient) {
            try {
                const response = await deepseekClient.chat.completions.create({
                    model: "deepseek-chat",
                    messages: [
                        { 
                            role: "system", 
                            content: "أنت مساعد تعليمي عربي ذكي في منصة تعليمية. هدفك مساعدة الطلاب في فهم المواد التعليمية وإجابة أسئلتهم بدقة ووضوح." 
                        },
                        { role: "user", content: question }
                    ],
                    temperature: 0.7,
                    max_tokens: 1000
                });
                
                answer = response.choices[0].message.content;
            } catch (aiError) {
                answer = `أعتذر، حدث خطأ في الاتصال بخدمة الذكاء الاصطناعي. يمكنك المحاولة لاحقاً.\n\n🔗 ${BOT_URL}`;
            }
        } else {
            answer = `أنا مساعد DeepSeek التعليمي. حالياً أنا في وضع التجربة. يمكنني الإجابة على أسئلتك التعليمية في مختلف المجالات.\n\n🔗 ${BOT_URL}`;
        }
        
        res.json({
            success: true,
            question: question,
            answer: answer,
            metadata: {
                aiProvider: deepseekClient ? 'DeepSeek' : 'Mock',
                timestamp: new Date().toISOString(),
                serverUrl: BOT_URL
            }
        });
        
    } catch (error) {
        console.error('Error in AI ask:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ في معالجة السؤال',
            serverUrl: BOT_URL 
        });
    }
});

// ==================== [ نقطة نهاية root للوصول ] ====================
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Smart Education Platform - منصة التعليم الذكي</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                    font-family: Arial, sans-serif;
                }
                
                body {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    min-height: 100vh;
                    padding: 20px;
                    line-height: 1.6;
                }
                
                .container {
                    max-width: 800px;
                    margin: 0 auto;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 15px;
                    padding: 30px;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
                    backdrop-filter: blur(10px);
                }
                
                header {
                    text-align: center;
                    margin-bottom: 30px;
                    padding-bottom: 20px;
                    border-bottom: 2px solid rgba(255, 255, 255, 0.2);
                }
                
                h1 {
                    font-size: 2.5rem;
                    margin-bottom: 10px;
                    color: white;
                }
                
                .subtitle {
                    font-size: 1.1rem;
                    opacity: 0.9;
                    margin-bottom: 20px;
                }
                
                .url-display {
                    background: rgba(0, 0, 0, 0.3);
                    padding: 12px;
                    border-radius: 8px;
                    margin: 15px 0;
                    word-break: break-all;
                    font-family: monospace;
                    border-left: 4px solid #4cc9f0;
                }
                
                .status-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 15px;
                    margin: 25px 0;
                }
                
                .status-card {
                    background: rgba(255, 255, 255, 0.1);
                    padding: 20px;
                    border-radius: 10px;
                    text-align: center;
                    transition: transform 0.3s;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                }
                
                .status-card:hover {
                    transform: translateY(-3px);
                    background: rgba(255, 255, 255, 0.15);
                }
                
                .btn-container {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 12px;
                    justify-content: center;
                    margin: 30px 0;
                }
                
                .btn {
                    padding: 12px 24px;
                    border-radius: 8px;
                    text-decoration: none;
                    font-weight: bold;
                    transition: all 0.3s;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 150px;
                }
                
                .btn-primary {
                    background: #4361ee;
                    color: white;
                    border: 2px solid #4361ee;
                }
                
                .btn-primary:hover {
                    background: transparent;
                    color: #4361ee;
                    transform: translateY(-2px);
                }
                
                .btn-secondary {
                    background: transparent;
                    color: white;
                    border: 2px solid white;
                }
                
                .btn-secondary:hover {
                    background: white;
                    color: #333;
                    transform: translateY(-2px);
                }
                
                .info-section {
                    background: rgba(0, 0, 0, 0.2);
                    padding: 20px;
                    border-radius: 10px;
                    margin: 25px 0;
                }
                
                .info-section h3 {
                    margin-bottom: 15px;
                    color: #4cc9f0;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
                    padding-bottom: 10px;
                }
                
                .info-section p {
                    margin: 10px 0;
                    padding-right: 10px;
                }
                
                footer {
                    text-align: center;
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid rgba(255, 255, 255, 0.2);
                    opacity: 0.8;
                    font-size: 0.9em;
                }
                
                .status-badge {
                    display: inline-block;
                    padding: 5px 12px;
                    border-radius: 20px;
                    font-size: 0.9em;
                    margin-top: 8px;
                }
                
                .status-online {
                    background: rgba(76, 201, 240, 0.2);
                    color: #4cc9f0;
                    border: 1px solid #4cc9f0;
                }
                
                .status-offline {
                    background: rgba(220, 53, 69, 0.2);
                    color: #dc3545;
                    border: 1px solid #dc3545;
                }
                
                @media (max-width: 768px) {
                    .container {
                        padding: 20px;
                    }
                    
                    h1 {
                        font-size: 2rem;
                    }
                    
                    .status-grid {
                        grid-template-columns: 1fr;
                    }
                    
                    .btn {
                        width: 100%;
                        min-width: auto;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <header>
                    <h1>🤖 Smart Education Platform</h1>
                    <p class="subtitle">منصة التعليم الذكي مع DeepSeek AI - نظام متكامل للتعليم الإلكتروني</p>
                    
                    <div class="url-display">
                        <strong>🌐 Server URL:</strong> ${BOT_URL}
                    </div>
                </header>
                
                <div class="status-grid">
                    <div class="status-card">
                        <h3>حالة السيرفر</h3>
                        <p>🟢 يعمل بنظام 24/7</p>
                        <span class="status-badge status-online">Online</span>
                    </div>
                    
                    <div class="status-card">
                        <h3>DeepSeek AI</h3>
                        <p>${deepseekClient ? '🟢 متصل' : '🔴 وضع التجربة'}</p>
                        <span class="status-badge ${deepseekClient ? 'status-online' : 'status-offline'}">
                            ${deepseekClient ? 'Connected' : 'Mock Mode'}
                        </span>
                    </div>
                    
                    <div class="status-card">
                        <h3>Telegram Bot</h3>
                        <p>${telegramBot ? '🟢 نشط' : '🔴 غير متصل'}</p>
                        <span class="status-badge ${telegramBot ? 'status-online' : 'status-offline'}">
                            ${telegramBot ? 'Active' : 'Disabled'}
                        </span>
                    </div>
                    
                    <div class="status-card">
                        <h3>Firebase</h3>
                        <p>${isFirebaseInitialized ? '🟢 متصل' : '🔴 غير متصل'}</p>
                        <span class="status-badge ${isFirebaseInitialized ? 'status-online' : 'status-offline'}">
                            ${isFirebaseInitialized ? 'Connected' : 'Disabled'}
                        </span>
                    </div>
                </div>
                
                <div class="btn-container">
                    <a href="/health" class="btn btn-primary">🩺 Health Check</a>
                    <a href="/api/test" class="btn btn-secondary">🧪 API Test</a>
                    <a href="/api/ai/ask" class="btn btn-primary">🧠 اسأل AI</a>
                </div>
                
                <div class="info-section">
                    <h3>📞 معلومات الدعم والدفع</h3>
                    <p><strong>📞 الدعم الفني:</strong> ${CONFIG.ADMIN_PHONE}</p>
                    <p><strong>🏦 رقم الحساب:</strong> ${CONFIG.ADMIN_BANK_ACCOUNT}</p>
                    <p><strong>👤 اسم صاحب الحساب:</strong> ${CONFIG.ADMIN_NAME}</p>
                    <p><strong>🌐 الموقع:</strong> ${BOT_URL}</p>
                </div>
                
                <div class="info-section">
                    <h3>💰 خطط الاشتراك</h3>
                    <p>🎁 <strong>تجربة مجانية:</strong> ${CONFIG.FREE_TRIAL_DAYS} أيام (${CONFIG.MAX_DAILY_QUESTIONS.trial} سؤال/يوم)</p>
                    <p>📦 <strong>أسبوعي:</strong> ${CONFIG.WEEKLY_SUBSCRIPTION} SDG (${CONFIG.MAX_DAILY_QUESTIONS.paid} سؤال/يوم)</p>
                    <p>📅 <strong>شهري:</strong> ${CONFIG.MONTHLY_SUBSCRIPTION} SDG (${CONFIG.MAX_DAILY_QUESTIONS.paid} سؤال/يوم)</p>
                    <p>👨‍🏫 <strong>معلم شهري:</strong> ${CONFIG.TEACHER_MONTHLY_FEE} SDG (${CONFIG.MAX_DAILY_QUESTIONS.paid} سؤال/يوم)</p>
                </div>
                
                <div class="info-section">
                    <h3>🔗 نقاط نهاية API</h3>
                    <p><code>POST ${BOT_URL}/api/ai/ask</code> - اسأل DeepSeek AI</p>
                    <p><code>GET ${BOT_URL}/health</code> - حالة النظام</p>
                    <p><code>GET ${BOT_URL}/api/test</code> - اختبار API</p>
                </div>
                
                <footer>
                    <p>© 2024 Smart Education Platform v4.0 - جميع الحقوق محفوظة</p>
                    <p>${BOT_URL} | ${new Date().toLocaleString('ar-SA')}</p>
                </footer>
            </div>
        </body>
        </html>
    `);
});

// ==================== [ نقطة نهاية 404 ] ====================
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found',
        serverUrl: BOT_URL,
        availableEndpoints: {
            GET: ['/', '/health', '/api/test'],
            POST: ['/api/ai/ask']
        }
    });
});

// ==================== [ تشغيل السيرفر ] ====================
server.listen(port, '0.0.0.0', () => {
    console.log(`
    ============================================
    🚀 Smart Education Platform Server v4.0
    🔗 Running on port: ${port}
    📡 Local: http://localhost:${port}
    🌐 Public: ${BOT_URL}
    
    📊 SERVICES STATUS:
    • DeepSeek AI: ${deepseekClient ? '✅ Connected' : '⚠️ Mock Mode'}
    • Firebase: ${isFirebaseInitialized ? '✅ Connected' : '❌ Disabled'}
    • Telegram Bot: ${telegramBot ? '✅ Active' : '❌ Disabled'}
    
    📞 ADMIN CONTACT:
    • Phone: ${CONFIG.ADMIN_PHONE}
    • Account: ${CONFIG.ADMIN_BANK_ACCOUNT}
    • Name: ${CONFIG.ADMIN_NAME}
    
    ⚡ SYSTEM READY! Access at: ${BOT_URL}
    ============================================
    `);
});

// ==================== [ معالجة الأخطاء ] ====================
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
