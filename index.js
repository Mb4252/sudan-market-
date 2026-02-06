const { Telegraf, Markup } = require('telegraf');
const ytDlp = require('yt-dlp-exec');
const dotenv = require('dotenv');

dotenv.config();

// ضع التوكن الخاص بك في متغيرات البيئة بـ Render باسم BOT_TOKEN
const bot = new Telegraf(process.env.BOT_TOKEN);

// معرف قناتك (يجب أن يكون البوت مشرفاً فيها)
const CHANNEL_ID = '@YourChannelUsername'; 

// 1. أمر البداية
bot.start((ctx) => {
    ctx.reply(
        `أهلاً بك يا ${ctx.from.first_name}! 🤖\n\nأنا بوت التحميل الذكي. أرسل لي رابط فيديو من (تيك توك، إنستغرام، يوتيوب) وسأرسله لك فوراً.`,
        Markup.inlineKeyboard([
            [Markup.button.url('اشترك في قناتنا 📢', `https://t.me/${CHANNEL_ID.replace('@', '')}`)]
        ])
    );
});

// 2. التحقق من الاشتراك الإجباري
async function checkSubscription(ctx) {
    try {
        const member = await ctx.telegram.getChatMember(CHANNEL_ID, ctx.from.id);
        if (member.status === 'left' || member.status === 'kicked') {
            return false;
        }
        return true;
    } catch (error) {
        console.error("خطأ في التحقق من الاشتراك:", error);
        return false;
    }
}

// 3. معالجة الروابط والتحميل
bot.on('text', async (ctx) => {
    const url = ctx.message.text;

    // التأكد من أنه رابط
    if (!url.startsWith('http')) {
        return ctx.reply('الرجاء إرسال رابط صحيح.');
    }

    // التحقق من الاشتراك قبل البدء
    const isSubscribed = await checkSubscription(ctx);
    if (!isSubscribed) {
        return ctx.reply(
            'عذراً! يجب عليك الاشتراك في القناة أولاً لاستخدام البوت مجاناً.',
            Markup.inlineKeyboard([
                [Markup.button.url('اضغط هنا للاشتراك 📢', `https://t.me/${CHANNEL_ID.replace('@', '')}`)]
            ])
        );
    }

    const waitingMsg = await ctx.reply('جاري معالجة الفيديو... انتظر لحظة ⏳');

    try {
        // استخدام yt-dlp للحصول على رابط التحميل المباشر
        const output = await ytDlp(url, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            preferFreeFormats: true,
        });

        // إرسال الفيديو للمستخدم
        await ctx.replyWithVideo(output.url, {
            caption: `تم التحميل بواسطة بوتك الذكي ✅\nرابط الفيديو الأصلي: ${url}`
        });

        await ctx.telegram.deleteMessage(ctx.chat.id, waitingMsg.message_id);

    } catch (error) {
        console.error(error);
        ctx.reply('عذراً، حدث خطأ أثناء محاولة تحميل هذا الرابط. تأكد من أن الحساب عام وليس خاصاً.');
    }
});

// تشغيل البوت
bot.launch().then(() => console.log("البوت يعمل الآن بنجاح!"));

// لإيقاف البوت بأمان
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
