const { Telegraf, session, Markup } = require('telegraf');
const express = require('express');
const { OpenAI } = require('openai');

// --- الإعدادات ---
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'ضع_توكن_البوت_هنا';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'ضع_مفتاح_API_هنا';
const BOT_URL = process.env.BOT_URL || 'https://your-app-name.onrender.com';

const app = express();
const bot = new Telegraf(BOT_TOKEN);
const openai = new OpenAI({
    apiKey: DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com/v1'
});

bot.use(session());

// مصفوفة الأزرار الرئيسية لسهولة الوصول
const mainKeyboard = Markup.keyboard([
    ['🧠 اسأل AI', '📚 المكتبة التعليمية'],
    ['📝 اختبارات ✍️', '📞 الدعم']
]).resize();

// --- أمر البدء ---
bot.start((ctx) => {
    ctx.reply(`أهلاً بك يا ${ctx.from.first_name} في بوت المساعد الذكي الشامل! 🤖\n\nيمكنك الآن:\n1️⃣ سؤالي عن أي شيء (أدب، علوم، برمجة، دين...).\n2️⃣ إرسال ملفات PDF لشرحها.\n3️⃣ طلب إنشاء اختبارات.\n\nأنا جاهز، ماذا يدور في ذهنك؟`, mainKeyboard);
});

// --- معالجة النصوص العامة (هنا يصبح مثل ChatGPT) ---
bot.on('text', async (ctx) => {
    const userText = ctx.message.text;

    // تجاهل الأوامر التي تتعامل معها الأزرار
    const buttons = ['🧠 اسأل AI', '📚 المكتبة التعليمية', '📝 اختبارات ✍️', '📞 الدعم'];
    if (buttons.includes(userText)) return;

    await ctx.sendChatAction('typing');

    try {
        const response = await openai.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { 
                    role: "system", 
                    content: "أنت مساعد ذكي شامل ومثقف جداً. تجيب على جميع الأسئلة بدقة ووضوح، سواء كانت تعليمية، عامة، تقنية، أو ترفيهية. استخدم الرموز التعبيرية لجعل الإجابة ممتعة." 
                },
                { role: "user", content: userText }
            ]
        });

        const aiReply = response.choices[0].message.content;
        await ctx.reply(aiReply, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error(error);
        ctx.reply('عذراً، واجهت مشكلة في الاتصال بعقلي الاصطناعي. حاول مرة أخرى لاحقاً.');
    }
});

// --- استقبال الملفات (PDF) ---
bot.on('document', async (ctx) => {
    const doc = ctx.message.document;
    if (doc.file_size > 20 * 1024 * 1024) {
        return ctx.reply('❌ الملف كبير جداً. أرسل ملفات أصغر من 20 ميجابايت.');
    }
    ctx.reply('⏳ استلمت الملف، سأقوم بتحليله لك (هنا يتم ربط منطق استخراج النص من الـ PDF)');
});

// --- أوامر الأزرار ---
bot.hears('🧠 اسأل AI', (ctx) => {
    ctx.reply('تفضل، أنا أسمعك! اكتب أي سؤال يخطر على بالك وسأجيبك فوراً.');
});

bot.hears('📞 الدعم', (ctx) => {
    ctx.reply('للتواصل مع المطور: @YourUsername');
});

// --- تشغيل السيرفر ---
app.use(express.json());
app.post(`/bot${BOT_TOKEN}`, (req, res) => {
    bot.handleUpdate(req.body, res);
    res.sendStatus(200);
});

const start = async () => {
    await bot.telegram.setWebhook(`${BOT_URL}/bot${BOT_TOKEN}`);
    app.listen(process.env.PORT || 10000, () => {
        console.log('🚀 البوت الشامل جاهز للعمل!');
    });
};

start();
