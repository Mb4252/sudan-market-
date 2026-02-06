const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const http = require('http');

// الحفاظ على البوت نشطاً بأقل استهلاك ممكن
http.createServer((req, res) => {
    res.write('Final Link Extractor Active');
    res.end();
}).listen(process.env.PORT || 10000);

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

bot.on('text', async (ctx) => {
    const userUrl = ctx.message.text;

    if (userUrl.startsWith('http')) {
        const waiting = await ctx.reply('⏳ جاري استخراج رابط التحميل النهائي من المتصفح...');

        try {
            // المحرك يذهب للموقع ويضع الرابط في الخلفية
            const scrapeTarget = `https://pastedownload.com/21/?url=${encodeURIComponent(userUrl)}`;
            
            const response = await axios.get(scrapeTarget, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            // البحث عن الرابط الذي ينتهي بـ .mp4 داخل كود الصفحة
            const mp4Match = response.data.match(/https?:\/\/[^"']+\.mp4[^"']*/);

            await ctx.deleteMessage(waiting.message_id).catch(() => {});

            if (mp4Match) {
                // إذا نجح البوت في العثور على الرابط النهائي المباشر
                return ctx.reply(
                    '✅ تم العثور على الرابط المباشر!\nاضغط أدناه وسيبدأ التحميل فوراً في متصفحك:',
                    Markup.inlineKeyboard([
                        [Markup.button.url('📥 تحميل ملف الفيديو الآن', mp4Match[0])]
                    ])
                );
            } else {
                // إذا كان الموقع يطلب تأكيداً بشرياً (Captcha) أو جودة معينة
                return ctx.reply(
                    '💡 الموقع يطلب اختيار الجودة يدوياً.\nاضغط أدناه ثم اختر "Download" للفيديو المطلوبه:',
                    Markup.inlineKeyboard([
                        [Markup.button.url('🚀 اذهب لصفحة التحميل المباشرة', `${scrapeTarget}#results`)]
                    ])
                );
            }
        } catch (e) {
            ctx.reply('عذراً، المحرك مشغول حالياً، حاول مرة أخرى.');
        }
    }
});

bot.launch();
