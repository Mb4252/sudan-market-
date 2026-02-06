const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const http = require('http');
const Tesseract = require('tesseract.js');
const PDFDocument = require('pdfkit');
const fs = require('fs');

// سيرفر لإبقاء البوت حياً على Render
http.createServer((req, res) => { res.end('All-in-One Bot is Fully Operational'); }).listen(process.env.PORT || 10000);

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// مصفوفات البيانات (أذكار وتشجيع)
const azkar = ["سبحان الله وبحمده ✨", "اللهم بك أصبحنا ☀️", "لا إله إلا الله 🕋"];
const praises = ["بطل! استمر 💪", "ممتاز، إجابة ذكية! 🌟", "رائع! أنت تقترب من النجاح 🚀"];
let userImages = {}; // لتخزين الصور مؤقتاً لعمل PDF

// --- القائمة الرئيسية ---
bot.start((ctx) => {
    ctx.reply(`أهلاً بك في البوت الشامل! 🎓✨\nاختر الخدمة التي تريدها:`, 
        Markup.inlineKeyboard([
            [Markup.button.callback('📝 إنشاء امتحان ذكي', 'tool_quiz')],
            [Markup.button.callback('🖼️ تحويل لـ PDF', 'tool_pdf'), Markup.button.callback('📿 أذكار', 'tool_azkar')],
            [Markup.button.callback('✨ زخرفة نصوص', 'tool_style'), Markup.button.callback('🔗 اختصار رابط', 'tool_short')]
        ])
    );
});

// --- معالجة ضغطات الأزرار (Acknowledge) ---
bot.action('tool_azkar', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    ctx.reply(azkar[Math.floor(Math.random() * azkar.length)]);
});

bot.action('tool_quiz', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    ctx.reply('📸 أرسل صورة كتاب أو نصاً طويلاً وسأقوم بتحليله وعمل امتحان شامل لك.');
});

bot.action('tool_pdf', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    userImages[ctx.from.id] = [];
    ctx.reply('🖼️ أرسل الصور التي تريد دمجها، وعند الانتهاء أرسل كلمة "تم" أو "Done".');
});

bot.action('tool_style', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    ctx.reply('✨ أرسل النص الذي تريد زخرفته الآن.');
});

bot.action('tool_short', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    ctx.reply('🔗 أرسل الرابط الطويل لاختصاره فوراً.');
});

// --- معالجة النصوص (روابط، زخرفة، امتحان) ---
bot.on('text', async (ctx) => {
    const text = ctx.message.text;

    if (text === 'تم' || text === 'Done') {
        return handlePdfCreation(ctx);
    }

    if (text.startsWith('http')) {
        try {
            const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(text)}`);
            ctx.reply(`✅ رابطك المختصر:\n${res.data}`);
        } catch (e) { ctx.reply('❌ فشل اختصار الرابط.'); }
    } else if (text.length > 55) {
        await generateSmartQuiz(ctx, text);
    } else {
        ctx.reply(`🔹 المزخرف: ⊱── { ${text} } ──⊰`);
    }
});

// --- معالجة الصور (PDF أو OCR للامتحان) ---
bot.on('photo', async (ctx) => {
    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    const link = await ctx.telegram.getFileLink(fileId);

    // إذا كان المستخدم في وضع تحويل الصور لـ PDF
    if (userImages[ctx.from.id]) {
        userImages[ctx.from.id].push(link.href);
        return ctx.reply(`✅ تم استلام الصورة (${userImages[ctx.from.id].length}).. أرسل غيرها أو "تم".`);
    }

    // إذا أرسل صورة عادية، يحولها لامتحان تلقائياً
    const wait = await ctx.reply('🔍 جاري قراءة الكتاب وتجهيز الأسئلة..');
    try {
        const { data: { text } } = await Tesseract.recognize(link.href, 'ara+eng');
        await ctx.deleteMessage(wait.message_id).catch(() => {});
        await generateSmartQuiz(ctx, text);
    } catch (e) { ctx.reply('❌ فشل تحليل الصورة.'); }
});

// --- محرك الامتحانات التفاعلية (أكثر ذكاوة) ---
async function generateSmartQuiz(ctx, text) {
    const sentences = text.split(/[.\n]/).filter(s => s.trim().length > 35);
    if (sentences.length < 2) return ctx.reply('⚠️ النص قصير جداً للامتحان.');

    await ctx.reply(`📊 إليك امتحانك التفاعلي من واقع النص:`);

    for (let i = 0; i < Math.min(sentences.length, 6); i++) {
        let current = sentences[i].trim();
        let words = current.split(' ');
        if (words.length > 7) {
            let targetIdx = Math.floor(words.length * 0.6);
            let correct = words[targetIdx].replace(/[,.;()]/g, "");
            let qText = current.replace(words[targetIdx], " (........) ");

            await ctx.replyWithQuiz(`سؤال ${i+1}:`, [correct, words[0], words[words.length-1]], {
                correct_option_id: 0,
                explanation: praises[Math.floor(Math.random() * praises.length)] + `\nالسياق: ${current}`
            }).catch(() => {});
        }
    }
}

// --- وظيفة إنشاء ملف PDF ---
async function handlePdfCreation(ctx) {
    const userId = ctx.from.id;
    if (!userImages[userId] || userImages[userId].length === 0) return ctx.reply('⚠️ لم ترسل صوراً!');
    
    await ctx.reply('⏳ جاري إنشاء ملف الـ PDF...');
    const doc = new PDFDocument();
    const filePath = `./${userId}.pdf`;
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    for (const url of userImages[userId]) {
        try {
            const res = await axios.get(url, { responseType: 'arraybuffer' });
            doc.image(res.data, { fit: [500, 700], align: 'center', valign: 'center' }).addPage();
        } catch (e) {}
    }
    doc.end();
    stream.on('finish', async () => {
        await ctx.replyWithDocument({ source: filePath, filename: 'MyBook.pdf' });
        fs.unlinkSync(filePath);
        delete userImages[userId];
    });
}

// حل مشكلة التكرار Conflict
bot.launch({ dropPendingUpdates: true });
