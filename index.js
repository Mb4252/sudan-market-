const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const http = require('http');
const PDFDocument = require('pdfkit');
const fs = require('fs');

// إبقاء السيرفر حياً لضمان عدم توقف البوت على Render
http.createServer((req, res) => { res.end('All-in-One Pro Bot is Live!'); }).listen(process.env.PORT || 10000);

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// مصفوفة الأذكار المدمجة (تعمل فوراً لجذب المستخدمين)
const azkar = [
    "سبحان الله وبحمده، عدد خلقه، ورضا نفسه، وزنة عرشه، ومداد كلماته. ✨",
    "اللهم بك أصبحنا وبك أمسينا وبك نحيا وبك نموت وإليك النشور. ☀️",
    "لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير. 🕋",
    "اللهم ما أصبح بي من نعمة أو بأحد من خلقك فمنك وحدك لا شريك لك، فلك الحمد ولك الشكر. 🙏"
];

// مخزن مؤقت لصور المستخدمين (لعمل الـ PDF)
let userImages = {};

bot.start((ctx) => {
    ctx.reply(`أهلاً بك في بوت المساعد الشامل! 🛠️\nاختر الخدمة التي تحتاجها:`, 
        Markup.inlineKeyboard([
            [Markup.button.callback('📿 أذكار اليوم', 'tool_azkar'), Markup.button.callback('✨ زخرفة نصوص', 'tool_style')],
            [Markup.button.callback('🖼️ تحويل لـ PDF', 'tool_pdf'), Markup.button.callback('🔗 اختصار روابط', 'tool_short')]
        ])
    );
});

// --- الأذكار والزخرفة والروابط ---
bot.action('tool_azkar', (ctx) => {
    const zekr = azkar[Math.floor(Math.random() * azkar.length)];
    ctx.reply(zekr);
});

bot.on('text', async (ctx) => {
    const text = ctx.message.text;

    if (text === 'تم' || text === 'Done') {
        return handlePdfCreation(ctx);
    }

    if (text.startsWith('http')) {
        try {
            const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(text)}`);
            ctx.reply(`✅ رابطك المختصر جاهز:\n${res.data}`);
        } catch (e) { ctx.reply('❌ فشل اختصار الرابط.'); }
    } else {
        ctx.reply(`🔹 النص المزخرف:\n\n⊱── { ${text} } ──⊰`);
    }
});

// --- معالجة الصور وتحويلها لـ PDF ---
bot.action('tool_pdf', (ctx) => {
    userImages[ctx.from.id] = [];
    ctx.reply('📸 أرسل الصور التي تريد دمجها الآن.. وعند الانتهاء أرسل كلمة "تم".');
});

bot.on('photo', async (ctx) => {
    if (!userImages[ctx.from.id]) userImages[ctx.from.id] = [];
    
    // حفظ رابط الصورة (بدلاً من تحميل الملف كاملاً لتوفير الذاكرة)
    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    const link = await ctx.telegram.getFileLink(fileId);
    userImages[ctx.from.id].push(link.href);
    
    ctx.reply(`✅ تم استلام الصورة رقم (${userImages[ctx.from.id].length}).. أرسل غيرها أو "تم".`);
});

async function handlePdfCreation(ctx) {
    const userId = ctx.from.id;
    if (!userImages[userId] || userImages[userId].length === 0) {
        return ctx.reply('⚠️ لم ترسل أي صور لدمجها!');
    }

    const waitMsg = await ctx.reply('⏳ جاري إنشاء ملف الـ PDF.. انتظر قليلاً.');
    const doc = new PDFDocument();
    const filePath = `./${userId}.pdf`;
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    for (const imgUrl of userImages[userId]) {
        try {
            const response = await axios.get(imgUrl, { responseType: 'arraybuffer' });
            doc.image(response.data, { fit: [500, 700], align: 'center', valign: 'center' });
            doc.addPage();
        } catch (e) { console.log('خطأ في صورة'); }
    }
    
    doc.end();

    stream.on('finish', async () => {
        await ctx.replyWithDocument({ source: filePath, filename: 'Photos.pdf' });
        fs.unlinkSync(filePath); // حذف الملف بعد الإرسال لتوفير مساحة السيرفر
        userImages[userId] = [];
        ctx.deleteMessage(waitMsg.message_id).catch(() => {});
    });
}

bot.launch({ dropPendingUpdates: true }); // حل مشكلة Conflict
