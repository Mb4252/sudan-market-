const { Telegraf } = require('telegraf');
const http = require('http');

// --- 1. تشغيل سيرفر ويب لتفادي خطأ Port Binding في Render ---
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running and healthy!\n');
});

// يستخدم المنفذ الذي يقدمه Render تلقائياً أو 10000 كافتراضي
const PORT = process.env.PORT || 10000; 
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Web server active on port ${PORT}`);
});

// --- 2. إعداد البوت باستخدام متغيراتك الظاهرة في الصورة ---
// تأكد أن الاسم مطابق تماماً لـ TELEGRAM_BOT_TOKEN في Render
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID; // معرفك الشخصي

// --- 3. منطق البوت الأساسي ---

// الترحيب
bot.start((ctx) => {
    ctx.reply('مرحباً بك! أنا بوت الخدمات الخاص بك.\nأرسل أي رسالة وسأقوم بالرد عليك فوراً.');
});

// ميزة للمسؤول فقط (Admin)
bot.command('status', (ctx) => {
    if (ctx.from.id.toString() === ADMIN_ID) {
        ctx.reply('أهلاً أيها المدير، النظام يعمل والمنفذ مفتوح بنجاح.');
    } else {
        ctx.reply('هذا الأمر مخصص لمدير النظام فقط.');
    }
});

// الرد التلقائي
bot.on('text', (ctx) => {
    ctx.reply('تم استلام رسالتك! جاري العمل على إضافة المزيد من الخدمات قريباً.');
});

// --- 4. تشغيل البوت ومعالجة الأخطاء ---
bot.launch().then(() => {
    console.log("Telegram Bot is online!");
}).catch((err) => {
    console.error("Failed to launch bot:", err);
});

// إغلاق آمن
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
