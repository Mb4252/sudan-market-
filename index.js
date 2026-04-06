require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'mining-app')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'mining-app', 'index.html')));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// تشغيل خادم الويب
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Web server running on port ${PORT}`);
});

// ============================================
// ========== تشغيل البوت ==========
// ============================================

const BOT_TOKEN = process.env.BOT_TOKEN;

console.log('========================================');
console.log('🔍 Checking BOT_TOKEN...');
console.log('BOT_TOKEN exists:', BOT_TOKEN ? '✅ YES' : '❌ NO');
console.log('========================================');

if (!BOT_TOKEN) {
    console.error('❌ ERROR: BOT_TOKEN is missing!');
    console.error('❌ Please add BOT_TOKEN to environment variables in Render');
    process.exit(1);
}

// إنشاء البوت
const bot = new Telegraf(BOT_TOKEN);

// أمر /start
bot.start(async (ctx) => {
    const user = ctx.from;
    console.log(`✅ /start received from: ${user.id} (${user.first_name})`);
    
    await ctx.reply(
        `✨ *مرحباً بك في منصة P2P للتداول!* ✨\n\n` +
        `👤 *المستخدم:* ${user.first_name}\n\n` +
        `🧩 *ميزة البيع الجزئي:* يمكنك شراء جزء من أي عرض!\n\n` +
        `🚀 *اضغط على الزر أدناه لفتح المنصة*`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.webApp('🚀 فتح منصة P2P', `https://sdm-security-bot.onrender.com`)]
            ])
        }
    );
});

// أمر /help
bot.help(async (ctx) => {
    await ctx.reply(
        `📖 *قائمة المساعدة*\n\n` +
        `🧩 /partial_help - تعليمات البيع الجزئي\n` +
        `💰 /fees - تفصيل الرسوم\n` +
        `❓ /faq - الأسئلة الشائعة\n\n` +
        `📱 افتح التطبيق للبدء في التداول`,
        { parse_mode: 'Markdown' }
    );
});

// أمر /fees
bot.command('fees', async (ctx) => {
    await ctx.reply(
        `💰 *تفصيل الرسوم*\n\n` +
        `🏢 *رسوم السحب:* 0.05 $ (ثابتة)\n` +
        `🏢 *رسوم التداول:* 0.05 $ (ثابتة)\n` +
        `🧩 *رسوم الصفقات الجزئية:* نفس رسوم الصفقات العادية\n\n` +
        `🌐 *رسوم الشبكة:* تختلف حسب الشبكة المختارة`,
        { parse_mode: 'Markdown' }
    );
});

// أمر /partial_help
bot.command('partial_help', async (ctx) => {
    await ctx.reply(
        `🧩 *تعليمات البيع الجزئي*\n\n` +
        `📖 *ما هي؟* شراء جزء من عرض البيع\n\n` +
        `📝 *الخطوات:*\n` +
        `1️⃣ اذهب إلى "السوق" ← "عروض البيع"\n` +
        `2️⃣ أدخل المبلغ المطلوب في الحقل\n` +
        `3️⃣ اضغط "شراء"\n` +
        `4️⃣ ادفع المبلغ المطلوب فقط\n` +
        `5️⃣ البائع يحرر المبلغ الذي اشتريته\n\n` +
        `✅ *مثال:* عرض 100 دولار، تريد شراء 10 دولار فقط`,
        { parse_mode: 'Markdown' }
    );
});

// أمر /faq
bot.command('faq', async (ctx) => {
    await ctx.reply(
        `❓ *الأسئلة الشائعة*\n\n` +
        `🧩 *البيع الجزئي:* شراء جزء من العرض\n` +
        `💵 *الإيداع:* مجاني (رسوم الشبكة فقط)\n` +
        `💰 *السحب:* 0.05$ + رسوم الشبكة\n` +
        `📊 *التداول:* 0.05$\n` +
        `💰 *حد الإيداع:* 1$\n` +
        `💰 *حد السحب:* 5$\n` +
        `🧩 *حد الشراء الجزئي:* حسب التاجر (عادة 10)`,
        { parse_mode: 'Markdown' }
    );
});

// أمر /my_id
bot.command('my_id', async (ctx) => {
    await ctx.reply(`🆔 *معرفك:* \`${ctx.from.id}\``, { parse_mode: 'Markdown' });
});

// أمر /admin (للمطور فقط)
bot.command('admin', async (ctx) => {
    const ADMIN_IDS = [6701743450, 8181305474];
    if (!ADMIN_IDS.includes(ctx.from.id)) {
        return ctx.reply('⛔ هذا الأمر للأدمن فقط');
    }
    await ctx.reply('👑 *مرحباً أيها الأدمن*', { parse_mode: 'Markdown' });
});

// تشغيل البوت
bot.launch().then(() => {
    console.log('========================================');
    console.log('🚀 P2P EXCHANGE BOT IS RUNNING!');
    console.log('🤖 Bot is ready to receive messages');
    console.log('📱 Open Telegram and send /start');
    console.log('========================================');
}).catch(err => {
    console.error('❌ ERROR: Bot failed to launch:', err.message);
});

// إيقاف البوت بشكل نظيف
process.once('SIGINT', () => {
    console.log('🛑 Bot stopping...');
    bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
    console.log('🛑 Bot stopping...');
    bot.stop('SIGTERM');
});

console.log('✅ Server.js loaded successfully');
