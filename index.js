const { Telegraf, session, Markup } = require('telegraf');
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');

// --- الإعدادات ---
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'ضع_توكن_البوت_هنا';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'ضع_مفتاح_API_هنا';
const BOT_URL = process.env.BOT_URL || 'https://sdm-security-bot.onrender.com';

const app = express();
const bot = new Telegraf(BOT_TOKEN);
const openai = new OpenAI({
    apiKey: DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com/v1'
});

// تفعيل الجلسات (ضروري جداً لحفظ تقدم الطالب في الأجزاء)
bot.use(session());

// مصفوفة لتخزين النصوص مؤقتاً (يفضل استخدام قاعدة بيانات في الإنتاج)
const userContext = new Map();

// --- دالة تقسيم النص إلى أجزاء ---
function splitText(text, chunkSize = 2000) {
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
}

// --- أمر البدء ---
bot.start((ctx) => {
    ctx.session = { currentPart: 0, totalParts: 0 };
    ctx.reply('📚 أهلاً بك في المساعد التعليمي الذكي.\n\n⚠️ ملاحظة: تليجرام يسمح للبوت بتحميل ملفات حتى 20MB فقط.\nإذا كان ملفك أكبر، يرجى إرساله كأجزاء صغيرة أو نسخ النص وإرساله هنا.');
});

// --- استقبال الملفات ---
bot.on('document', async (ctx) => {
    const doc = ctx.message.document;
    
    if (doc.file_size > 20 * 1024 * 1024) {
        return ctx.reply(`❌ الملف كبير جداً (${(doc.file_size / 1048576).toFixed(1)}MB).\nقوانين تليجرام تمنع البوتات من تحميل ملفات أكبر من 20MB.\n\n✅ الحل: قم بتقسيم ملف الـ PDF باستخدام موقع iLovePDF وارسل كل جزء على حدة.`);
    }

    try {
        await ctx.reply('⏳ جاري تحميل ومعالجة الكتاب... (هذه الميزة تتطلب مكتبة pdf-parse)');
        // هنا يتم وضع منطق استخراج النص من الـ PDF
        // سأقوم بمحاكاة العملية لتوضيح منطق "الأجزاء" الذي طلبته
        
        const mockText = "هذا نص تجريبي طويل جداً يمثل محتوى الكتاب التعليمي الذي أرسلته..."; 
        const parts = splitText(mockText);
        
        ctx.session.parts = parts;
        ctx.session.currentPart = 0;
        ctx.session.totalParts = parts.length;

        await explainPart(ctx);
    } catch (error) {
        ctx.reply('حدث خطأ أثناء قراءة الملف.');
    }
});

// --- دالة الشرح الذكي ---
async function explainPart(ctx) {
    const partIndex = ctx.session.currentPart;
    const parts = ctx.session.parts;

    if (!parts || partIndex >= parts.length) {
        return ctx.reply('✅ انتهينا من شرح الكتاب بالكامل!');
    }

    await ctx.reply(`📖 جاري شرح الجزء (${partIndex + 1} من ${parts.length})...`);

    try {
        const response = await openai.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { role: "system", content: "أنت معلم خبير. اشرح النص التالي بأسلوب مبسط للطالب مع ذكر أهم النقاط." },
                { role: "user", content: parts[partIndex] }
            ]
        });

        const explanation = response.choices[0].message.content;
        
        // إرسال الشرح مع زر "الجزء التالي"
        const keyboard = [];
        if (partIndex + 1 < parts.length) {
            keyboard.push([Markup.button.callback('➡️ شرح الجزء التالي', 'next_part')]);
        }

        await ctx.reply(explanation, Markup.inlineKeyboard(keyboard));
        
    } catch (error) {
        ctx.reply('❌ فشل الاتصال بالذكاء الاصطناعي.');
    }
}

// --- معالجة الضغط على زر "الجزء التالي" ---
bot.action('next_part', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.currentPart++;
    await explainPart(ctx);
});

// --- أوامر الأزرار السفلية ---
bot.hears('📖 شرح لي الكتاب', async (ctx) => {
    if (!ctx.session.parts) return ctx.reply('❌ يرجى إرسال الكتاب أولاً.');
    ctx.session.currentPart = 0;
    await explainPart(ctx);
});

bot.hears('📝 اختبارات ✍️', async (ctx) => {
    if (!ctx.session.parts) return ctx.reply('❌ يرجى إرسال الكتاب أولاً ليتم إنشاء اختبار منه.');
    ctx.reply('🛠️ ميزة إنشاء الاختبارات قيد التطوير بناءً على محتوى الكتاب.');
});

// تشغيل السيرفر والبوت
app.use(express.json());
app.post(`/bot${BOT_TOKEN}`, (req, res) => {
    bot.handleUpdate(req.body, res);
    res.sendStatus(200);
});

const start = async () => {
    await bot.telegram.setWebhook(`${BOT_URL}/bot${BOT_TOKEN}`);
    app.listen(process.env.PORT || 10000, () => {
        console.log('🚀 Server & Bot are Ready!');
    });
};

start();
