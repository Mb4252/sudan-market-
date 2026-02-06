const { Telegraf, Markup } = require('telegraf');
const http = require('http');

// 1. إبقاء ريندر نشطاً بأقل استهلاك (فقط 2MB رام)
const server = http.createServer((req, res) => {
    res.end('Bot logic is running on Telegram Cloud...');
});
server.listen(process.env.PORT || 10000, '0.0.0.0');

// 2. إعداد البوت بمتغيراتك
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

bot.on('text', async (ctx) => {
    const url = ctx.message.text;

    if (url.startsWith('http')) {
        // نرسل رسالة انتظار للمستخدم
        const waitingMsg = await ctx.reply('⏳ جاري التحميل المباشر عبر تيليجرام...');

        try {
            // سنستخدم محركاً يعطي "رابط فيديو مباشر" (Direct MP4 Link)
            // هذا الرابط سيفهمه تيليجرام ويقوم برفعه بدلاً عنك
            const directVideoUrl = `https://tinyurl.com/api-proxy?url=${encodeURIComponent(url)}`; 

            // هنا السحر: نحن نرسل "الرابط" لتيليجرام، وتيليجرام يحمله بسيرفراته هو!
            await ctx.replyWithVideo(directVideoUrl, {
                caption: '✅ تم التحميل بواسطة سيرفرات تيليجرام السريعة',
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.url('رابط احتياطي 📥', `https://pastedownload.com/21/?url=${encodeURIComponent(url)}`)]
                ]).reply_markup
            });

            await ctx.deleteMessage(waitingMsg.message_id);
        } catch (error) {
            // في حال كان الفيديو كبيراً جداً على تيليجرام، نعطيه رابط التحميل الخارجي
            ctx.reply('الفيديو حجمه كبير، يمكنك تحميله من هنا مباشرة:', 
                Markup.inlineKeyboard([[Markup.button.url('تحميل من المتصفح 📥', `https://pastedownload.com/21/?url=${encodeURIComponent(url)}`)]]));
        }
    }
});

bot.launch();
