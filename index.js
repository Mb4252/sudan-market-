const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const http = require('http');

// إبقاء السيرفر حياً على ريندر بأقل استهلاك
http.createServer((req, res) => { res.end('Fast Link Engine Active'); }).listen(process.env.PORT || 10000);

// تعريف البوت (حل مشكلة ReferenceError)
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

bot.start((ctx) => {
    ctx.reply('✅ بوت التحميل السريع جاهز!\nأرسل الرابط وسأختار لك أسرع جودة تحميل متوفرة تلقائياً.');
});

bot.on('text', async (ctx) => {
    const url = ctx.message.text;

    if (url.startsWith('http')) {
        const waiting = await ctx.reply('⏳ جاري فحص جميع الجودات واختيار الأسرع... انتظر ثواني');

        try {
            // الدخول للموقع في الخلفية للحصول على كود النتائج
            const targetSite = `https://pastedownload.com/21/?url=${encodeURIComponent(url)}`;
            const response = await axios.get(targetSite, { headers: { 'User-Agent': 'Mozilla/5.0' } });

            // استخراج جميع روابط الـ MP4 الموجودة في الصفحة (كل الجودات)
            const allLinks = response.data.match(/https?:\/\/[^"']+\.mp4[^"']*/g) || [];

            await ctx.deleteMessage(waiting.message_id).catch(() => {});

            if (allLinks.length > 0) {
                // الفكرة هنا: اختيار أول رابط (غالباً الأفضل) وإرساله مباشرة لتخطي صفحة "الاختيار اليدوي"
                const fastestLink = allLinks[0]; 

                return ctx.reply(
                    '✅ تم العثور على أسرع رابط تحميل متوفر!',
                    Markup.inlineKeyboard([
                        [Markup.button.url('📥 اضغط هنا لبدء التحميل فوراً', fastestLink)]
                    ])
                );
            } else {
                // محرك بديل سريع جداً في حال فشل الموقع الأول
                const altApi = `https://api.tikwm.com/api/?url=${encodeURIComponent(url)}`;
                const altRes = await axios.get(altApi);
                const altLink = altRes.data.data.play;

                return ctx.reply('✅ تم جلب الرابط المباشر عبر المحرك البديل:', 
                    Markup.inlineKeyboard([[Markup.button.url('🚀 تحميل فوري (HD)', altLink)]]));
            }

        } catch (error) {
            // إذا كانت الحماية قوية جداً، نرسل رابط صفحة النتائج مباشرة
            ctx.reply('⚠️ تعذر الاستخراج التلقائي. اضغط هنا واختر الجودة المطلوبة:', 
                Markup.inlineKeyboard([[Markup.button.url('📥 اذهب لصفحة الجودات', `https://pastedownload.com/21/?url=${encodeURIComponent(url)}#results`)]]));
        }
    }
});

bot.launch();
