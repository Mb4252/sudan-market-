const { Telegraf, Markup, session } = require('telegraf');
const admin = require('firebase-admin');
const { OpenAI } = require('openai');
const express = require('express');
const pdf = require('pdf-parse');
const axios = require('axios');

const CONFIG = {
    TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    AI_KEY: process.env.DEEPSEEK_API_KEY,
    URL: process.env.BOT_URL,
    ADMIN_ID: "6701743450", // تأكد أن هذا هو رقمك الصحيح
    FIREBASE: JSON.parse(process.env.FIREBASE_ADMIN_JSON || '{}')
};

const bot = new Telegraf(CONFIG.TOKEN);
bot.use(session());
const deepseek = new OpenAI({ apiKey: CONFIG.AI_KEY, baseURL: 'https://api.deepseek.com/v1' });

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(CONFIG.FIREBASE),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
}
const db = admin.database();

// وظيفة استخراج النص من PDF
async function extractTextFromPDF(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const data = await pdf(response.data);
        return data.text;
    } catch (e) {
        console.error("خطأ في قراءة PDF:", e);
        return "";
    }
}

// البداية
bot.start(async (ctx) => {
    ctx.replyWithMarkdown(`🚀 **البوت الذكي جاهز!**\n\nأرسل ملف PDF لرفعه للمكتبة، أو ابدأ بسؤال الذكاء الاصطناعي مباشرة.`, 
    Markup.keyboard([['📚 المكتبة التعليمية', '🧠 اسأل AI'], ['📝 اختبارات', '📞 الدعم']]).resize());
});

// رفع الكتب (للأدمن)
bot.on('document', async (ctx) => {
    if (ctx.from.id.toString() !== CONFIG.ADMIN_ID) return;
    const fileId = ctx.message.document.file_id;
    const fileLink = await ctx.telegram.getFileLink(fileId);
    
    ctx.reply("⏳ جاري تحليل الكتاب وقراءة محتواه...");
    const text = await extractTextFromPDF(fileLink.href);
    
    // تخزين مؤقت للمحتوى لربطه بمادة
    ctx.session.tempText = text.substring(0, 15000); // نأخذ جزء كبير للمعالجة
    ctx.session.tempFileId = fileId;

    const snapshot = await db.ref('books').once('value');
    let buttons = [];
    if(snapshot.exists()){
        Object.entries(snapshot.val()).forEach(([id, b]) => {
            buttons.push([Markup.button.callback(`ربط بـ: ${b.grade} - ${b.title}`, `link_${id}`)]);
        });
    }
    ctx.reply("📁 اختر المادة لربط الكتاب بها:", Markup.inlineKeyboard(buttons));
});

bot.action(/link_(.+)/, async (ctx) => {
    const bookId = ctx.match[1];
    await db.ref(`books/${bookId}`).update({ 
        fileId: ctx.session.tempFileId,
        content: ctx.session.tempText,
        hasContent: true 
    });
    ctx.editMessageText("✅ تم الربط! البوت الآن يعرف محتوى الكتاب ويمكنه الإجابة منه.");
});

// سؤال الذكاء الاصطناعي
bot.action(/ask_book_(.+)/, async (ctx) => {
    const bookId = ctx.match[1];
    ctx.session.currentBookId = bookId;
    ctx.reply("❓ أرسل سؤالك الآن حول هذا الكتاب وسأجيبك من داخله:");
});

bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    if (['📚 المكتبة التعليمية', '🧠 اسأل AI'].includes(text)) return;

    ctx.reply("🔍 جاري البحث في الكتاب والرد...");
    
    let prompt = "أنت مساعد تعليمي للمنهج السوداني.";
    if (ctx.session.currentBookId) {
        const book = (await db.ref(`books/${ctx.session.currentBookId}`).once('value')).val();
        prompt = `أنت مدرس مادة ${book.title}. استخدم هذا المحتوى للإجابة على الطالب بدقة: \n\n ${book.content || ""}`;
    }

    try {
        const response = await deepseek.chat.completions.create({
            model: "deepseek-chat",
            messages: [{ role: "system", content: prompt }, { role: "user", content: text }]
        });
        ctx.reply(response.choices[0].message.content, { parse_mode: 'Markdown' });
    } catch (e) {
        ctx.reply("❌ عذراً، حاول مرة أخرى.");
    }
});

// تشغيل الويب
const app = express();
app.use(express.json());
app.post(`/bot${CONFIG.TOKEN}`, (req, res) => { bot.handleUpdate(req.body, res); res.sendStatus(200); });
app.listen(10000, async () => {
    await bot.telegram.setWebhook(`${CONFIG.URL}/bot${CONFIG.TOKEN}`);
    console.log("!البوت الذكي الذي يقرأ الكتب جاهز 🚀");
});
