require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'mining-app')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'mining-app', 'index.html')));

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});

// ========== البوت ==========
const BOT_TOKEN = process.env.BOT_TOKEN;
console.log('BOT_TOKEN exists:', !!BOT_TOKEN);

if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN is missing! Please add it to environment variables.');
} else {
    const bot = new Telegraf(BOT_TOKEN);
    
    // أمر /start
    bot.start(async (ctx) => {
        console.log('User started bot:', ctx.from.id);
        await ctx.reply(
            `✨ *مرحباً بك في منصة P2P للتداول!* ✨\n\n` +
            `👤 *المستخدم:* ${ctx.from.first_name}\n\n` +
            `🧩 *ميزة البيع الجزئي:* يمكنك شراء جزء من أي عرض!\n\n` +
            `🚀 *اضغط على الزر أدناه لفتح المنصة*`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.webApp('🚀 فتح منصة P2P', `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost'}`)]
                ])
            }
        );
    });
    
    // أمر /help
    bot.help(async (ctx) => {
        await ctx.reply('📖 المساعدة متاحة. استخدم /start للبدء');
    });
    
    // تشغيل البوت
    bot.launch().then(() => {
        console.log('🚀 Bot is running and ready!');
    }).catch(err => {
        console.error('❌ Bot failed to start:', err.message);
    });
    
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
