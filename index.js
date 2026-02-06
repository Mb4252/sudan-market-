const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const http = require('http');

// --- 1. تشغيل سيرفر ويب بسيط لإبقاء ريندر نشطاً ---
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is Live and Running ✅');
}).listen(process.env.PORT || 10000);

// --- 2. تعريف البوت (تأكد من وضع التوكن في إعدادات ريندر) ---
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// --- 3. أمر البداية مع خيارات الجودة ---
bot.start((ctx) => {
    ctx.reply('مرحباً بك في بوت التحميل الذكي! 🚀\nأرسل لي أي رابط فيديو وسأقوم باستخراج أعلى جودة متوفرة لك.', 
        Markup.inlineKeyboard([
            [Markup.button.callback('🎬 ضبط تلقائي: أعلى جودة', 'auto_hd')]
        ])
    );
});

bot.action('auto_hd', (ctx) => ctx.reply('✅ تم الضبط: سأبحث دائماً عن أعلى جودة MP4 متوفرة.'));

// --- 4. معالجة الروابط واقتناص الرابط المباشر ---
bot.on('text', async (ctx) => {
    const userUrl = ctx.message.text;

    if (userUrl.startsWith('http')) {
        const waiting = await ctx.reply('⏳ جاري فحص الرابط واقتناص أعلى جودة (HD)...');

        try {
            // محاولة جلب الرابط المباشر عبر محرك سريع (API) لتجنب الدخول اليدوي
            const apiUrl = `https://api.tikwm.com/api/?url=${encodeURIComponent(userUrl)}`;
            const response = await axios.get(apiUrl);
            
            if (response.data && response.data.data && response.data.data.play) {
                const directLink = response.data.data.play;
                await ctx.deleteMessage(waiting.message_id).catch(() => {});
                
                return ctx.reply('✅ تم العثور على الرابط المباشر (HD)!', 
                    Markup.inlineKeyboard([
                        [Markup.button.url('📥 اضغط هنا لبدء التحميل', directLink)]
                    ])
                );
            } else {
                throw new Error('Fallback to web scraping');
            }

        } catch (error) {
            // في حالة فشل المحرك السريع، نوجهه لصفحة النتائج في الموقع الوسيط
            await ctx.deleteMessage(waiting.message_id).catch(() => {});
            const fallbackLink = `https://pastedownload.com/21/?url=${encodeURIComponent(userUrl)}#results`;
            
            ctx.reply('💡 الموقع يطلب اختيار الجودة يدوياً.\nاضغط أدناه واختر جودة الفيديو المطلوبة لبدء التحميل:', 
                Markup.inlineKeyboard([
                    [Markup.button.url('🚀 صفحة الجودات والتحميل', fallbackLink)]
                ])
            );
        }
    }
});

// --- 5. تشغيل البوت ومعالجة أخطاء الإنهاء ---
bot.launch().then(() => {
    console.log('Bot is officially live!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
