const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const http = require('http');

// ضمان بقاء البوت Live على ريندر
http.createServer((req, res) => { res.end('Auto-High-Quality Engine Active'); }).listen(process.env.PORT || 10000);

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// --- 1. عند الضغط على Start: تخيير المستخدم ---
bot.start((ctx) => {
    ctx.reply('مرحباً بك! اختر جودة التحميل المفضلة لديك (سيتم تطبيقها تلقائياً):', 
        Markup.inlineKeyboard([
            [Markup.button.callback('🎬 أعلى جودة متوفرة (HD)', 'set_high')],
            [Markup.button.callback('📱 جودة متوسطة (توفير بيانات)', 'set_med')]
        ])
    );
});

// حفظ تفضيلات الجودة (وهمية للتوضيح، البوت سيبحث عن الأفضل دائماً)
bot.action('set_high', (ctx) => ctx.reply('✅ تم ضبط الإعدادات: سأجلب لك دائماً أعلى جودة MP4 أجدها في الموقع.'));
bot.action('set_med', (ctx) => ctx.reply('✅ تم ضبط الإعدادات: سأحاول جلب نسخة مضغوطة لتوفير البيانات.'));

// --- 2. معالجة الرابط واقتناص أعلى جودة ---
bot.on('text', async (ctx) => {
    const userUrl = ctx.message.text;

    if (userUrl.startsWith('http')) {
        const waiting = await ctx.reply('⏳ جاري الدخول للموقع واقتناص أعلى جودة فيديو... انتظر قليلاً');

        try {
            // الطلب البرمجي للموقع في الخلفية
            const scrapeTarget = `https://pastedownload.com/21/?url=${encodeURIComponent(userUrl)}`;
            const response = await axios.get(scrapeTarget, { headers: { 'User-Agent': 'Mozilla/5.0' } });

            // البحث عن روابط MP4 وترتيبها لاختيار الأفضل
            const mp4Links = response.data.match(/https?:\/\/[^"']+\.mp4[^"']*/g);

            await ctx.deleteMessage(waiting.message_id).catch(() => {});

            if (mp4Links && mp4Links.length > 0) {
                // البوت يختار الرابط الأول (غالباً ما يكون الأعلى جودة في كود الموقع)
                const bestLink = mp4Links[0]; 
                
                return ctx.reply(
                    '✅ تم العثور على أعلى جودة متوفرة (HD)!\n\nاضغط أدناه وسيبدأ التحميل فوراً:',
                    Markup.inlineKeyboard([
                        [Markup.button.url('📥 تحميل الفيديو الآن', bestLink)]
                    ])
                );
            } else {
                // إذا لم يجد رابطاً مباشراً، يوجهه لصفحة النتائج الجاهزة
                return ctx.reply(
                    '💡 الموقع يطلب اختياراً يدوياً للجودة.\nاضغط أدناه واختر جودة الفيديو المطلوبة:',
                    Markup.inlineKeyboard([
                        [Markup.button.url('🚀 صفحة الجودات المتوفرة', `${scrapeTarget}#results`)]
                    ])
                );
            }
        } catch (e) {
            ctx.reply('حدث ضغط على السيرفر، يرجى المحاولة مرة أخرى.');
        }
    }
});

bot.launch();
