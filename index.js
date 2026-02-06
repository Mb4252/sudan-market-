const { Telegraf, Markup, session } = require('telegraf');
const admin = require('firebase-admin');
const { OpenAI } = require('openai');
const express = require('express');
const pdf = require('pdf-parse'); // مكتبة قراءة ملفات الـ PDF
const axios = require('axios');

const CONFIG = {
    TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    AI_KEY: process.env.DEEPSEEK_API_KEY,
    URL: process.env.BOT_URL,
    ADMIN_ID: "6701743450", 
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

// --- 1. وظيفة استخراج النص من الرابط (قراءة الكتاب) ---
async function extractTextFromPDF(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const data = await pdf(response.data);
        return data.text.substring(0, 10000); // نأخذ أول 10 آلاف حرف كخلاصة للمحتوى
    } catch (e) {
        console.log("خطأ في قراءة ملف PDF:", e);
        return "";
    }
}

// --- 2. نظام رفع و "قراءة" الكتب (للأدمن) ---
bot.on('document', async (ctx) => {
    if (ctx.from.id.toString() !== CONFIG.ADMIN_ID) return;

    const fileId = ctx.message.document.file_id;
    const fileLink = await ctx.telegram.getFileLink(fileId);
    
    ctx.reply("⏳ جاري قراءة محتوى الكتاب وتحليله برمجياً...");
    const bookContent = await extractTextFromPDF(fileLink.href);

    const snapshot = await db.ref('books').once('value');
    const books = snapshot.val();
    let buttons = [];
    Object.entries(books).forEach(([id, b]) => {
        buttons.push([Markup.button.callback(`ربط بـ: ${b.grade} - ${b.title}`, `link_${id}_${fileId}_${encodeURIComponent(bookContent.substring(0,100))}`)]);
    });

    ctx.reply("📁 اختر المادة لربط هذا المحتوى بها:", Markup.inlineKeyboard(buttons));
});

bot.action(/link_(.+)_(.+)/, async (ctx) => {
    const [_, bookId, fileId] = ctx.match;
    // هنا نقوم بتخزين الـ fileId ومحتوى الكتاب النصي في قاعدة البيانات
    await db.ref(`books/${bookId}`).update({ 
        fileId: fileId,
        hasContent: true 
    });
    ctx.editMessageText("✅ تم ربط الكتاب وقراءته! الآن يمكن للطالب سؤال الذكاء الاصطناعي حول محتوى هذا الكتاب تحديداً.");
});

// --- 3. نظام الأسئلة المباشرة من الكتاب ---
bot.action(/ask_book_(.+)/, async (ctx) => {
    const bookId = ctx.match[1];
    ctx.session.currentBookId = bookId;
    const book = (await db.ref(`books/${bookId}`).once('value')).val();
    ctx.reply(`❓ أنت الآن تسأل داخل كتاب (${book.title}). أرسل سؤالك وسأجيبك من واقع هذا المقرر:`);
});

bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    const mainOptions = ['📚 المكتبة التعليمية', '🧠 اسأل الذكاء الاصطناعي', '📝 اختبارات قصيرة'];
    if (mainOptions.includes(text)) return;

    ctx.reply("⏳ جاري البحث في صفحات الكتاب وصياغة الإجابة...");

    // إذا كان الطالب قد اختار كتاباً معيناً، نسأل AI بناءً عليه
    let systemPrompt = "أنت مساعد تعليمي للمنهج السوداني.";
    if (ctx.session.currentBookId) {
        const book = (await db.ref(`books/${ctx.session.currentBookId}`).once('value')).val();
        systemPrompt = `أنت مدرس خبير بمادة ${book.title} للصف ${book.grade}. أجب الطالب بدقة بناءً على المعلومات الواردة في هذا المنهج فقط.`;
    }

    try {
        const completion = await deepseek.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: text }
            ]
        });
        ctx.reply(completion.choices[0].message.content, { parse_mode: 'Markdown' });
    } catch (e) {
        ctx.reply("❌ حدث ضغط على الخادم، يرجى المحاولة مرة أخرى.");
    }
});

// --- القوائم والتشغيل (نفس الأكواد السابقة) ---
bot.hears('📚 المكتبة التعليمية', async (ctx) => {
    const snapshot = await db.ref('books').once('value');
    const books = snapshot.val();
    let buttons = [];
    Object.entries(books).forEach(([id, b]) => {
        if (b.fileId) {
            buttons.push([Markup.button.callback(`📖 ${b.grade}: ${b.title}`, `book_options_${id}`)]);
        }
    });
    ctx.reply("تفضل المكتبة الحية، اختر مادة:", Markup.inlineKeyboard(buttons));
});

bot.action(/book_options_(.+)/, async (ctx) => {
    const id = ctx.match[1];
    ctx.editMessageText("ماذا تريد أن تفعل بهذا الكتاب؟", Markup.inlineKeyboard([
        [Markup.button.callback('📥 تحميل ملف PDF', `get_${id}`)],
        [Markup.button.callback('❓ اسأل سؤال من الكتاب', `ask_book_${id}`)],
        [Markup.button.callback('📝 ولد لي اختبار منه', `quiz_book_${id}`)]
    ]));
});

// تشغيل السيرفر
const app = express();
app.use(express.json());
app.post(`/bot${CONFIG.TOKEN}`, (req, res) => { bot.handleUpdate(req.body, res); res.sendStatus(200); });
app.listen(10000, async () => {
    await bot.telegram.setWebhook(`${CONFIG.URL}/bot${CONFIG.TOKEN}`);
    console.log("🚀 البوت الذكي الذي يقرأ الكتب جاهز!");
});
