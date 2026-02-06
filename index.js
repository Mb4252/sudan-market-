const { Telegraf, Markup } = require('telegraf');
const http = require('http');

// --- 1. تشغيل سيرفر الويب لمنع توقف Render ---
// هذا الجزء يحل مشكلة Port Binding التي ظهرت في سجلاتك
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is Active and Hosting is Live!\n');
});

const PORT = process.env.PORT || 10000; 
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Web server active on port ${PORT}`);
});

// --- 2. إعداد البوت باستخدام متغيراتك ---
// يستخدم TELEGRAM_BOT_TOKEN الموجود في صورتك
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID; // معرفك الشخصي

// ضع يوزر قناتك هنا (البوت سيجبر المستخدمين على الاشتراك لتربح أنت)
const CHANNEL_USERNAME = '@YourChannelUsername'; 

// --- 3. منطق العمليات ---

bot.start((ctx) => {
    ctx.reply(
        `مرحباً بك في بوت التحميل الشامل! 🤖\n\nأرسل لي رابط فيديو من (تيك توك، يوتيوب، إنستا، فيسبوك...) وسأقوم بتجهيزه لك فوراً وبشكل مجاني تماماً.`,
        Markup.inlineKeyboard([
            [Markup.button.url('اشترك في القناة لفتح الميزات 📢', `https://t.me/${CHANNEL_USERNAME.replace('@', '')}`)]
        ])
    );
});

bot.on('text', async (ctx) => {
    const url = ctx.message.text;

    // التأكد من أن الرسالة رابط
    if (url.startsWith('http')) {
        // فحص الاشتراك الإجباري (لتكبير قناتك)
        try {
            const member = await ctx.telegram.getChatMember(CHANNEL_USERNAME, ctx.from.id);
            if (member.status === 'left' || member.status === 'kicked') {
                return ctx.reply('عذراً! يجب الاشتراك في القناة أولاً لاستخدام البوت:', 
                Markup.inlineKeyboard([[Markup.button.url('اضغط هنا للاشتراك 📢', `https://t.me/${CHANNEL_USERNAME.replace('@', '')}`)]]));
            }
        } catch (e) { console.log("خطأ في فحص القناة"); }

        await ctx.reply('🔍 جاري فحص الرابط ومعالجته من أي موقع... انتظر ثواني ⏳');

        // استخدام محرك تحميل شامل ومجاني لتقليل الضغط على سيرفرك
        const finalLink = `https://pastedownload.com/21/?url=${encodeURIComponent(url)}`;
        
        return ctx.reply(
            `✅ الفيديو جاهز للتحميل!\n\nيمكنك الحصول عليه عبر الرابط التالي:\n${finalLink}\n\nشكراً لاستخدامك بوتنا!`,
            Markup.inlineKeyboard([[Markup.button.url('اضغط هنا للتحميل 📥', finalLink)]])
        );
    }

    ctx.reply('من فضلك أرسل رابط فيديو صحيح ليبدأ البوت بالعمل.');
});

// ميزة الإدارة لك أنت فقط
bot.command('admin', (ctx) => {
    if (ctx.from.id.toString() === ADMIN_ID) {
        ctx.reply('أهلاً أيها المدير! البوت متصل الآن بسيرفر Render بنجاح.');
    }
});

bot.launch().then(() => console.log("Bot is Online!"));

// الإغلاق الآمن
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
