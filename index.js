const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const http = require('http');
const Tesseract = require('tesseract.js');

// إبقاء السيرفر حياً 24 ساعة على Render
http.createServer((req, res) => { res.end('Student Bot Pro is Active'); }).listen(process.env.PORT || 10000);

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// مصفوفة الأذكار والرسائل التشجيعية
const azkar = ["سبحان الله وبحمده ✨", "اللهم بك أصبحنا ☀️", "لا إله إلا الله وحده لا شريك له 🕋"];
const praises = ["بطل! استمر في المذاكرة 💪", "ممتاز، إجابة ذكية من طالب ذكي! 🌟", "رائع! أنت تقترب من النجاح الباهر 🚀"];

bot.start((ctx) => {
    ctx.reply(`أهلاً بك في بوت الطالب الشامل! 🎓\n\n- أرسل نصاً طويلاً أو صورة كتاب لإنشاء اختبار.\n- أرسل نصاً قصيراً لزخرفته.\n- أرسل رابطاً لاختصاره.`, 
        Markup.inlineKeyboard([
            [Markup.button.callback('📝 إنشاء اختبار', 'tool_quiz'), Markup.button.callback('📿 أذكار', 'tool_azkar')],
            [Markup.button.callback('🔗 اختصار رابط', 'tool_short'), Markup.button.callback('✨ زخرفة', 'tool_style')]
        ])
    );
});

// --- الأذكار والخدمات السريعة ---
bot.action('tool_azkar', (ctx) => ctx.reply(azkar[Math.floor(Math.random() * azkar.length)]));
bot.action('tool_style', (ctx) => ctx.reply('أرسل النص الآن لزخرفته..'));
bot.action('tool_short', (ctx) => ctx.reply('أرسل الرابط الطويل الآن..'));

// --- معالجة الصور والنصوص للاختبارات ---
bot.on('text', async (ctx) => {
    const input = ctx.message.text;
    if (input.startsWith('http')) {
        try {
            const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(input)}`);
            ctx.reply(`✅ الرابط المختصر:\n${res.data}`);
        } catch (e) { ctx.reply('❌ خطأ في الرابط.'); }
    } else if (input.length > 50) {
        await createInteractiveQuiz(ctx, input);
    } else {
        ctx.reply(`🔹 المزخرف: ⊱── { ${input} } ──⊰`);
    }
});

bot.on('photo', async (ctx) => {
    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    const link = await ctx.telegram.getFileLink(fileId);
    const wait = await ctx.reply('🔍 جاري قراءة الصورة وتجهيز الامتحان..');

    try {
        const result = await Tesseract.recognize(link.href, 'ara+eng');
        await ctx.deleteMessage(wait.message_id).catch(() => {});
        await createInteractiveQuiz(ctx, result.data.text);
    } catch (e) { ctx.reply('❌ فشلت قراءة الصورة.'); }
});

// --- نظام الاختبار التفاعلي مع التشجيع الفوري ---
async function createInteractiveQuiz(ctx, fullText) {
    const sentences = fullText.split(/[.!?]/).filter(s => s.trim().length > 35);
    
    if (sentences.length < 2) return ctx.reply('⚠️ النص قصير جداً للامتحان.');

    await ctx.reply('📝 إليك اختبارك التفاعلي مع تصحيح فوري:');

    for (let i = 0; i < Math.min(sentences.length, 4); i++) {
        let words = sentences[i].trim().split(' ');
        if (words.length > 7) {
            let targetIdx = Math.floor(words.length / 2);
            let correct = words[targetIdx].replace(/[,.;]/g, "");
            let w1 = words[0].replace(/[,.;]/g, ""), w2 = words[words.length-1].replace(/[,.;]/g, "");

            let qText = sentences[i].replace(words[targetIdx], " (........) ");

            await ctx.replyWithQuiz(
                `سؤال ${i+1}: أكمل الفراغ:\n"${qText}"`,
                [correct, w1, w2],
                {
                    correct_option_id: 0,
                    explanation: praises[Math.floor(Math.random() * praises.length)] // رسالة تشجيعية تظهر عند الخطأ أو بعد الإجابة
                }
            );
        }
    }
}

// حل مشكلة التكرار والتعليق في ريندر
bot.launch({ dropPendingUpdates: true });
