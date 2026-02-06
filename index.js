const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const http = require('http');

// 1. الحفاظ على استقرار السيرفر في ريندر
http.createServer((req, res) => {
    res.write('Scraper Engine Active ✅');
    res.end();
}).listen(process.env.PORT || 10000);

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// 2. رسالة الترحيب والتعليمات
bot.start((ctx) => {
    ctx.reply('مرحباً! أرسل رابط الفيديو (تيك توك، فيسبوك، إنستا) وسأعطيك رابط التحميل المباشر فوراً 🚀');
});

// 3. معالجة الروابط واقتناص الرابط الأخير
bot.on('text', async (ctx) => {
    const userUrl = ctx.message.text;

    if (userUrl.startsWith('http')) {
        const waitingMsg = await ctx.reply('⏳ جاري استخراج رابط الملف النهائي... انتظر ثواني');

        try {
            // أتمتة العملية: البوت يطلب الصفحة التي أرسلت صورتها في الخلفية
            const targetSite = `https://pastedownload.com/21/?url=${encodeURIComponent(userUrl)}`;
            
            // محاكاة دخول المتصفح للحصول على كود الصفحة
            const response = await axios.get(targetSite, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            // البحث البرمجي عن الرابط الذي ينتهي بصيغة فيديو (الرابط الأخير)
            const videoRegex = /https?:\/\/[^"']+\.(mp4|m4v|mov)[^"']*/g;
            const foundLinks = response.data.match(videoRegex);

            await ctx.deleteMessage(waitingMsg.message_id).catch(() => {});

            if (foundLinks && foundLinks.length > 0) {
                // إذا وجد البوت الرابط المباشر، يرسله فوراً
                const finalLink = foundLinks[0];
                return ctx.reply(
                    '✅ تم تجهيز الرابط المباشر بنجاح!\n\nاضغط أدناه وسيبدأ التحميل في متصفحك فوراً:',
                    Markup.inlineKeyboard([
                        [Markup.button.url('🚀 ابدأ التحميل الآن', finalLink)]
                    ])
                );
            } else {
                // إذا كان الموقع يمنع الاقتناص التلقائي، نرسل الرابط الموجه لصفحة النتائج
                const resultPage = `${targetSite}#results`;
                return ctx.reply(
                    '💡 الموقع يطلب تأكيداً يدوياً.\n\nاضغط على الزر أدناه، ثم اختر جودة الفيديو لبدء التحميل:',
                    Markup.inlineKeyboard([
                        [Markup.button.url('📥 اذهب لصفحة التحميل المباشرة', resultPage)]
                    ])
                );
            }

        } catch (error) {
            console.error(error);
            ctx.reply('حدث خطأ أثناء الاتصال بموقع التحميل. حاول مرة أخرى لاحقاً.');
        }
    }
});

bot.launch();

// تجنب التعارض (Conflict 409) عند إعادة التشغيل
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
