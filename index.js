require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();
const WEBAPP_URL = process.env.WEBAPP_URL;
const CRYSTAL_PRICE = parseFloat(process.env.CRYSTAL_PRICE) || 0.01;

// --- إعداد سيرفر الويب (Express) ---
app.use(cors());
app.use(express.json());
// عرض ملف الـ HTML من مجلد public
app.use(express.static(path.join(__dirname, 'public')));

// مسارات الـ API للواجهة (Web App)
app.post('/api/register', async (req, res) => {
    const { user_id, username, first_name } = req.body;
    await db.registerUser(user_id, username, first_name);
    res.json({ success: true });
});

app.get('/api/user/:id', async (req, res) => {
    const user = await db.getUser(req.params.id);
    res.json({
        balance: user?.crystal_balance || 0,
        miningRate: user?.mining_rate || 1,
        miningLevel: user?.mining_level || 1,
        totalMined: user?.total_mined || 0,
        lastMiningTime: user?.last_mining_time
    });
});

app.post('/api/mine', async (req, res) => {
    const result = await db.mine(req.body.user_id);
    res.json(result);
});

app.post('/api/upgrade', async (req, res) => {
    const result = await db.upgradeMining(req.body.user_id);
    res.json(result);
});

app.get('/api/leaderboard', async (req, res) => {
    const leaders = await db.getLeaderboard();
    res.json(leaders);
});

app.get('/api/liquidity', async (req, res) => {
    const liq = await db.getLiquidity();
    res.json(liq);
});

// --- إعداد بوت التليجرام ---
const mainKeyboard = Markup.inlineKeyboard([
    [Markup.button.webApp('🚀 فتح تطبيق التعدين', WEBAPP_URL)],
    [Markup.button.callback('📊 لوحة المتصدرين', 'leaderboard')],
    [Markup.button.callback('⚡ تطوير معدل التعدين', 'upgrade')],
    [Markup.button.callback('ℹ️ معلومات السيولة', 'liquidity')]
]);

bot.start(async (ctx) => {
    const user = ctx.from;
    await db.registerUser(user.id, user.username, user.first_name);
    const userData = await db.getUser(user.id);
    
    const welcomeText = `
✨ *مرحباً بك في بوت تعدين CRYSTAL!* ✨

👤 *المستخدم:* ${user.first_name}
💎 *رصيد الكريستال:* ${(userData?.crystal_balance || 0).toFixed(2)} CRYSTAL
⚡ *معدل التعدين:* ${userData?.mining_rate || 1}x

🚀 *ابدأ التعدين الآن من خلال التطبيق المصغر!*`;
    
    await ctx.reply(welcomeText, { parse_mode: 'Markdown', ...mainKeyboard });
});

bot.action('leaderboard', async (ctx) => {
    const leaders = await db.getLeaderboard();
    let text = '🏆 *قائمة المتصدرين* 🏆\n\n';
    leaders.forEach((l, i) => {
        text += `${i + 1}. ${l.name} - 💎 ${l.balance.toFixed(2)}\n`;
    });
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('liquidity', async (ctx) => {
    const liq = await db.getLiquidity();
    const available = liq.total_liquidity - liq.total_sold;
    const text = `💰 *معلومات السيولة*\n\n💎 إجمالي السيولة: ${liq.total_liquidity}\n📊 متاح: ${available}\n💰 السعر: ${CRYSTAL_PRICE} USDT`;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('back_to_menu', async (ctx) => {
    await ctx.editMessageText('✨ *القائمة الرئيسية* ✨', { parse_mode: 'Markdown', ...mainKeyboard });
});

// تشغيل السيرفر والبوت
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Web server running on port ${PORT}`);
    bot.launch().then(() => console.log('🤖 Telegram Bot is running...'));
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
