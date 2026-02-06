const { Telegraf, Markup } = require('telegraf');
// سنستخدم مكتبة yt-dlp-exec وهي مجانية تماماً للتحميل
const ytDlp = require('yt-dlp-exec'); 

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const CHANNEL_ID = '@YourChannelUsername'; // ضع يوزر قناتك هنا لتربح منها

bot.start((ctx) => {
    ctx.reply(
        `مرحباً بك! 🤖\nأنا بوت التحميل المجاني. أرسل رابط فيديو من تيك توك أو إنستا وسأقوم بتحميله لك فوراً وبدون علامة مائية.`,
        Markup.inlineKeyboard([
            [Markup.button.url('اشترك في القناة لفتح البوت 📢', `https://t.me/${CHANNEL_ID.replace('@', '')}`)]
        ])
    );
});

bot.on('text', async (ctx) => {
    const url = ctx.message.text;

    if (!url.startsWith('http')) return ctx.reply('أرسل رابطاً صحيحاً يا صديقي.');

    // فحص الاشتراك (مجاني لك ويجبرهم على متابعة قناتك)
    try {
        const member = await ctx.telegram.getChatMember(CHANNEL_ID, ctx.from.id);
        if (member.status === 'left') {
            return ctx.reply('عذراً، اشترك في القناة أولاً لتتمكن من التحميل مجاناً.');
        }
    } catch (e) { /* تجاهل الخطأ إذا لم يكن البوت مشرفاً */ }

    ctx.reply('جاري التحميل مجاناً... ⏳');

    try {
        // التحميل باستخدام المكتبة المجانية
        const output = await ytDlp(url, { dumpSingleJson: true, noWarnings: true });
        await ctx.replyWithVideo(output.url, { caption: "تم التحميل بواسطة بوتنا المجاني ✅" });
    } catch (error) {
        ctx.reply('حدث خطأ بسيط، تأكد أن الرابط عام.');
    }
});

bot.launch();
