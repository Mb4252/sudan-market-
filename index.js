const { Telegraf, Markup } = require('telegraf');
const http = require('http');

// --- 1. حل مشكلة Render (Port Binding) ---
// هذا الجزء يمنع Render من إيقاف البوت بسبب عدم وجود منفذ مفتوح
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is Active and Running!\n');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

// --- 2. إعداد البوت باستخدام متغيراتك ---
// تأكد أن الاسم TELEGRAM_BOT_TOKEN مطابق لما في الصورة
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID; // معرف المدير الخاص بك

// ضع معرف قناتك هنا (يجب أن يكون البوت مشرفاً فيها ليتحقق من الاشتراك)
const CHANNEL_USERNAME = '@YourChannel'; 

// --- 3. أوامر البوت ---

// أمر البدء
bot.start((ctx) => {
    ctx.reply(
        `أهلاً بك يا ${ctx.from.first_name} في بوت التحميل والأدوات! 🤖\n\n` +
        `أنا هنا لمساعدتك في تحميل الفيديوهات وتوفير خدمات سريعة.\n` +
        `يرجى الاشتراك في القناة أولاً لضمان عمل كافة الميزات مجاناً.`,
        Markup.inlineKeyboard([
            [Markup.button.url('انضم للقناة الرسمية 📢', `https://t.me/${CHANNEL_USERNAME.replace('@', '')}`)]
        ])
    );
});

// معالجة الرسائل النصية والروابط
bot.on('text', async (ctx) => {
    const userMessage = ctx.message.text;
    const userId = ctx.from.id.toString();

    // التحقق من الاشتراك الإجباري (لتكبير قناتك والربح منها لاحقاً)
    try {
        const chatMember = await ctx.telegram.getChatMember(CHANNEL_USERNAME, ctx.from.id);
        if (chatMember.status === 'left' || chatMember.status === 'kicked') {
            return ctx.reply(
                'عذراً، يجب عليك الاشتراك في القناة لاستخدام البوت:',
                Markup.inlineKeyboard([
                    [Markup.button.url('اضغط هنا للاشتراك 📢', `https://t.me/${CHANNEL_USERNAME.replace('@', '')}`)]
                ])
            );
        }
    } catch (error) {
        console.log("خطأ في التحقق من القناة (تأكد من وجود البوت كمشرف)");
    }

    // إذا أرسل المستخدم رابطاً
    if (userMessage.startsWith('http')) {
        return ctx.reply('جاري معالجة الرابط للتحميل... انتظر لحظة ⏳');
    }

    // رد افتراضي سريع
    ctx.reply('وصلت رسالتك! هل تريد تحميل فيديو أم لديك استفسار آخر؟');
});

// أمر خاص بالمدير (Admin) باستخدام معرفك
bot.command('admin', (ctx) => {
    if (ctx.from.id.toString() === ADMIN_ID) {
        ctx.reply("مرحباً أيها المدير! البوت يعمل الآن بشكل مستقر على Render.");
    } else {
        ctx.reply("عذراً، هذا الأمر للمدير فقط.");
    }
});

// تشغيل البوت
bot.launch().then(() => {
    console.log("Telegram Bot started successfully!");
});

// التعامل مع الإغلاق المفاجئ
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
