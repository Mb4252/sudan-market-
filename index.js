const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const http = require('http');

// الحفاظ على البوت نشطاً على ريندر
http.createServer((req, res) => { res.end('Waiting Engine Active'); }).listen(process.env.PORT || 10000);

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

bot.on('text', async (ctx) => {
    const url = ctx.message.text;
    if (url.startsWith('http')) {
        const waiting = await ctx.reply('⏳ الموقع يقوم بتحضير الجودات الآن.. سأنتظر لمدة دقيقتين لجلب الرابط النهائي لك.');

        // دالة للانتظار البرمجي (Promise based delay)
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        try {
            // الانتظار لمدة دقيقتين (120000 ميلي ثانية) كما طلبت لضمان ظهور الروابط
            await delay(120000); 

            const target = `https://pastedownload.com/21/?url=${encodeURIComponent(url)}`;
            const response = await axios.get(target, { headers: { 'User-Agent': 'Mozilla/5.0' } });

            // استخراج جميع روابط MP4 بعد فترة الانتظار
            const mp4Links = response.data.match(/https?:\/\/[^"']+\.mp4[^"']*/g);

            await ctx.deleteMessage(waiting.message_id).catch(() => {});

            if (mp4Links && mp4Links.length > 0) {
                // اختيار الرابط الأول (الذي يكون غالباً بجودة HD كما في صورتك)
                const finalLink = mp4Links[0];
                return ctx.reply('✅ تم تحضير الرابط بنجاح بعد الانتظار!', 
                    Markup.inlineKeyboard([[Markup.button.url('📥 تحميل الفيديو المباشر', finalLink)]]));
            } else {
                return ctx.reply('💡 انتهى وقت الانتظار ولكن الموقع ما زال يطلب اختياراً يدوياً.', 
                    Markup.inlineKeyboard([[Markup.button.url('🚀 اذهب لصفحة النتائج', `${target}#results`)]]));
            }
        } catch (e) {
            ctx.reply('حدث خطأ أثناء محاولة جلب الرابط، يرجى المحاولة لاحقاً.');
        }
    }
});

bot.launch();
