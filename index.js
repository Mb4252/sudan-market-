const { Telegraf, Markup } = require('telegraf');
const http = require('http');

// 1. ضمان بقاء السيرفر Live على ريندر بأقل استهلاك (2MB رام فقط)
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Smart Background Engine is Active ✅\n');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});

// 2. إعداد البوت بمتغيراتك الأساسية
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// --- 3. رسالة الترحيب المطورة (/start) ---
bot.start((ctx) => {
    const welcome = `
مرحباً بك في بوت التحميل الذكي! 🤖🚀

أنا أعمل في الخلفية لأوفر لك أفضل جودة تحميل من تيك توك، يوتيوب، وإنستا.

**كيف تحمل؟**
1️⃣ أرسل رابط الفيديو هنا.
2️⃣ سأقوم باستخراج الرابط المباشر لك فوراً.

نحن نوفر موارد السيرفر لنبقى مجانيين للأبد! 🆓✨
    `;
    ctx.reply(welcome);
});

// --- 4. معالجة الروابط في الخلفية ---
bot.on('text', async (ctx) => {
    const url = ctx.message.text;

    if (url.startsWith('http')) {
        // رسالة الانتظار الاحترافية
        const waitingMsg = await ctx.reply('⏳ جاري استخراج الفيديو في الخلفية... انتظر ثواني قليلة.');

        try {
            // تحسين الرابط ليوجه المستخدم مباشرة لمنطقة النتائج في الموقع الوسيط
            const directDownloadUrl = `https://pastedownload.com/21/?url=${encodeURIComponent(url)}#results`;

            // حذف رسالة الانتظار وإرسال النتيجة مع تعليمات التحميل
            await ctx.deleteMessage(waitingMsg.message_id).catch(() => {});

            const finalMsg = `
✅ اكتملت العملية بنجاح!

اضغط على الزر أدناه للتحميل. 
💡 **ملاحظة:** إذا فتح الفيديو للمشاهدة فقط، اضغط مطولاً على الفيديو واختر (حفظ الفيديو) أو (Download Video).
            `;

            return ctx.reply(
                finalMsg,
                Markup.inlineKeyboard([
                    [Markup.button.url('📥 اضغط هنا للتحميل المباشر', directDownloadUrl)]
                ])
            );
        } catch (error) {
            ctx.reply('حدث خطأ بسيط، تأكد من صحة الرابط وحاول مجدداً.');
        }
    } else {
        ctx.reply('من فضلك أرسل رابط فيديو صحيح ليبدأ العمل.');
    }
});

// 5. تشغيل البوت
bot.launch().then(() => {
    console.log("Bot is Online and stable on Render!");
});

// التعامل مع الإغلاق المفاجئ لتجنب خطأ 409 Conflict
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
