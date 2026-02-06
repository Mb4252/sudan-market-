const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const http = require('http');
const Tesseract = require('tesseract.js');

// تشغيل السيرفر لضمان بقاء البوت حياً
http.createServer((req, res) => { res.end('Bot is Clean and Running'); }).listen(process.env.PORT || 10000);

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// مصفوفة الأذكار والتشجيع
const azkar = ["سبحان الله وبحمده ✨", "اللهم بك أصبحنا ☀️"];
const praises = ["أحسنت! استمر 💪", "إجابة ذكية! 🌟"];

bot.start((ctx) => {
    ctx.reply(`🎓 أهلاً بك في بوت الطالب الشامل!\nاضغط على الزر المناسب للخدمة:`, 
        Markup.inlineKeyboard([
            [Markup.button.callback('📝 إنشاء اختبار', 'start_quiz')],
            [Markup.button.callback('📿 أذكار', 'get_zekr'), Markup.button.callback('🔗 اختصار رابط', 'get_short')],
            [Markup.button.callback('✨ زخرفة نصوص', 'get_style')]
        ])
    );
});

// --- حل مشكلة تعليق الأزرار (Acknowledge Click) ---
bot.action('start_quiz', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {}); // ينهي التحميل فوراً
    ctx.reply('📸 أرسل صورة صفحة الكتاب أو نصاً طويلاً الآن وسأجهز الاختبار.');
});

bot.action('get_zekr', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    ctx.reply(azkar[Math.floor(Math.random() * azkar.length)]);
});

bot.action('get_short', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    ctx.reply('🔗 حسناً، أرسل الرابط الطويل الذي تريد اختصاره.');
});

bot.action('get_style', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    ctx.reply('✨ أرسل النص الذي تريد زخرفته الآن.');
});

// --- معالجة المدخلات بدقة لمنع التداخل ---
bot.on('text', async (ctx) => {
    const text = ctx.message.text;

    if (text.startsWith('http')) {
        try {
            const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(text)}`);
            ctx.reply(`✅ الرابط المختصر:\n${res.data}`);
        } catch (e) { ctx.reply('❌ خطأ في اختصار الرابط.'); }
    } else if (text.length > 60) {
        await createInteractiveQuiz(ctx, text);
    } else {
        ctx.reply(`🔹 المزخرف: ⊱── { ${text} } ──⊰`);
    }
});

bot.on('photo', async (ctx) => {
    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    const link = await ctx.telegram.getFileLink(fileId);
    const waitMsg = await ctx.reply('🔍 جاري قراءة الصورة وتجهيز الامتحان..');

    try {
        const { data: { text } } = await Tesseract.recognize(link.href, 'ara+eng');
        await ctx.deleteMessage(waitMsg.message_id).catch(() => {});
        if (text.trim().length < 30) return ctx.reply('❌ لم أستطع قراءة نص كافٍ من الصورة.');
        await createInteractiveQuiz(ctx, text);
    } catch (e) { ctx.reply('❌ فشلت المعالجة، جرب صورة أوضح.'); }
});

async function createInteractiveQuiz(ctx, fullText) {
    const sentences = fullText.split(/[.!?]/).filter(s => s.trim().length > 35);
    if (sentences.length < 2) return ctx.reply('⚠️ النص قصير جداً للامتحان.');

    for (let i = 0; i < Math.min(sentences.length, 3); i++) {
        let words = sentences[i].trim().split(' ');
        if (words.length > 7) {
            let targetIdx = Math.floor(words.length / 2);
            let correct = words[targetIdx].replace(/[,.;]/g, "");
            let qText = sentences[i].replace(words[targetIdx], " (........) ");

            await ctx.replyWithQuiz(`سؤال ${i+1}:`, [correct, "كلمة خاطئة 1", "كلمة خاطئة 2"], {
                correct_option_id: 0,
                explanation: praises[Math.floor(Math.random() * praises.length)]
            }).catch(() => {});
        }
    }
}

// التعديل الأهم: إيقاف أي نسخة قديمة فوراً
bot.launch({ dropPendingUpdates: true });
