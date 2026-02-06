const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const http = require('http');

http.createServer((req, res) => { res.end('Stable Bot is Live'); }).listen(process.env.PORT || 10000);

// استخدام التوكن من إعدادات ريندر لضمان الأمان
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

bot.on('text', async (ctx) => {
    const url = ctx.message.text;
    if (url.startsWith('http')) {
        const waiting = await ctx.reply('⏳ جاري فحص الرابط.. سأحاول جلب الجودة النهائية فور توفرها (قد يستغرق الأمر لحظات).');

        let attempts = 0;
        const maxAttempts = 8; // فحص لمدة دقيقتين تقريباً (15 ثانية * 8)

        const checkLink = setInterval(async () => {
            attempts++;
            try {
                const target = `https://pastedownload.com/21/?url=${encodeURIComponent(url)}`;
                const response = await axios.get(target, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                
                // البحث عن روابط MP4 الجاهزة
                const mp4Links = response.data.match(/https?:\/\/[^"']+\.mp4[^"']*/g);

                if (mp4Links && mp4Links.length > 0) {
                    clearInterval(checkLink); // التوقف فور العثور على الرابط
                    await ctx.deleteMessage(waiting.message_id).catch(() => {});
                    return ctx.reply('✅ تم استخراج الرابط بنجاح!', 
                        Markup.inlineKeyboard([[Markup.button.url('📥 تحميل الفيديو (HD)', mp4Links[0])]]));
                }

                if (attempts >= maxAttempts) {
                    clearInterval(checkLink);
                    await ctx.editMessageText('💡 الموقع يستغرق وقتاً طويلاً. يرجى اختيار الجودة يدوياً من الرابط التالي:', 
                        { chat_id: ctx.chat.id, message_id: waiting.message_id, 
                          ...Markup.inlineKeyboard([[Markup.button.url('🚀 صفحة التحميل والنتائج', `${target}#results`)]]) });
                }
            } catch (e) {
                clearInterval(checkLink);
            }
        }, 15000); // يفحص كل 15 ثانية بدلاً من الانتظار الطويل
    }
});

// حل مشكلة Conflict (التأكد من تشغيل نسخة واحدة فقط)
bot.launch({ dropPendingUpdates: true }).then(() => console.log('Bot is running smoothly!'));
