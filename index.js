require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const db = require('./database');
const express = require('express');
const path = require('path');

// ========== إعداد خادم الويب (لحل مشكلة Render) ==========
const app = express();
const PORT = process.env.PORT || 10000;

// تقديم الملفات الثابتة من مجلد mining-app
app.use(express.static(path.join(__dirname, 'mining-app')));

// الصفحة الرئيسية - تقديم التطبيق المصغر
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'mining-app', 'index.html'));
});

// API Health Check - مهم لـ Render
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========== API Routes ==========
// API المستخدم
app.get('/api/user/:userId', async (req, res) => {
    try {
        const user = await db.getUser(parseInt(req.params.userId));
        if (user) {
            res.json({
                balance: user.crystalBalance,
                miningRate: user.miningRate,
                miningLevel: user.miningLevel,
                totalMined: user.totalMined,
                lastMiningTime: user.lastMiningTime,
                dailyMined: user.dailyMined,
                lastMiningDate: user.lastMiningDate
            });
        } else {
            res.json({ balance: 0, miningRate: 1, miningLevel: 1, totalMined: 0 });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API التعدين
app.post('/api/mine', async (req, res) => {
    try {
        const { user_id } = req.body;
        const result = await db.mine(parseInt(user_id));
        res.json(result);
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// API المتصدرين
app.get('/api/leaderboard', async (req, res) => {
    try {
        const leaders = await db.getLeaderboard(10);
        const formatted = leaders.map(leader => ({
            name: leader.firstName || leader.username || `مستخدم ${leader.userId}`,
            balance: leader.crystalBalance || 0,
            level: leader.miningLevel || 1
        }));
        res.json(formatted);
    } catch (error) {
        res.json([]);
    }
});

// API السيولة
app.get('/api/liquidity', async (req, res) => {
    try {
        const liquidity = await db.getLiquidity();
        res.json({
            total_liquidity: liquidity?.totalLiquidity || 100000,
            total_sold: liquidity?.totalSold || 0,
            available: (liquidity?.totalLiquidity || 100000) - (liquidity?.totalSold || 0)
        });
    } catch (error) {
        res.json({ total_liquidity: 100000, total_sold: 0, available: 100000 });
    }
});

// API الشراء
app.post('/api/purchase', async (req, res) => {
    try {
        const { user_id, amount } = req.body;
        const result = await db.requestPurchase(parseInt(user_id), parseFloat(amount));
        res.json(result);
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// API الترقية
app.post('/api/upgrade', async (req, res) => {
    try {
        const { user_id } = req.body;
        const result = await db.requestUpgrade(parseInt(user_id), 5);
        res.json(result);
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// API التسجيل
app.post('/api/register', async (req, res) => {
    try {
        const { user_id, username, first_name } = req.body;
        await db.registerUser(parseInt(user_id), username, first_name);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: true });
    }
});

// API إحصائيات اليوم
app.get('/api/user/daily/:userId', async (req, res) => {
    try {
        const stats = await db.getUserStats(parseInt(req.params.userId));
        res.json({
            daily_mined: stats?.dailyMined || 0,
            daily_limit: 4,
            remaining: 4 - (stats?.dailyMined || 0)
        });
    } catch (error) {
        res.json({ daily_mined: 0, daily_limit: 4, remaining: 4 });
    }
});

// تشغيل خادم الويب
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Web server running on http://0.0.0.0:${PORT}`);
    console.log(`📱 WebApp URL: ${process.env.WEBAPP_URL || `http://localhost:${PORT}`}`);
});

// ========== تشغيل بوت التلجرام ==========
(async () => {
    try {
        await db.connect();
        console.log('✅ Database connected successfully');
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        process.exit(1);
    }
})();

const bot = new Telegraf(process.env.BOT_TOKEN);
const WEBAPP_URL = process.env.WEBAPP_URL || `https://sdm-security-bot.onrender.com`;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const UPGRADE_USDT_PRICE = parseFloat(process.env.UPGRADE_USDT_PRICE) || 5;
const CRYSTAL_PRICE = parseFloat(process.env.CRYSTAL_PRICE) || 0.01;
const DAILY_LIMIT = parseInt(process.env.DAILY_LIMIT) || 4;

// قائمة الأزرار الرئيسية
const mainKeyboard = Markup.inlineKeyboard([
    [Markup.button.webApp('🚀 فتح تطبيق التعدين', WEBAPP_URL)],
    [Markup.button.callback('⛏️ تعدين', 'mine_action')],
    [Markup.button.callback('🏆 المتصدرين', 'leaderboard')],
    [Markup.button.callback('💰 شراء كريستال', 'buy_menu')],
    [Markup.button.callback('⚡ ترقية بـ USDT', 'upgrade_menu')],
    [Markup.button.callback('👥 نظام الإحالة', 'referral_system')],
    [Markup.button.callback('📈 إحصائياتي', 'my_stats')],
    [Markup.button.callback('ℹ️ معلومات', 'info_menu')]
]);

const adminKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📋 طلبات الترقية', 'pending_upgrades')],
    [Markup.button.callback('💰 طلبات الشراء', 'pending_purchases')],
    [Markup.button.callback('📊 إحصائيات عامة', 'global_stats')],
    [Markup.button.callback('📅 إحصائيات اليوم', 'today_stats')],
    [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
]);

// أمر /start
bot.start(async (ctx) => {
    const user = ctx.from;
    const referrerId = ctx.startPayload ? parseInt(ctx.startPayload) : null;
    
    await db.registerUser(user.id, user.username, user.first_name, referrerId);
    
    const stats = await db.getUserStats(user.id);
    const referralLink = `https://t.me/${ctx.botInfo.username}?start=${user.id}`;
    
    const welcomeText = `
✨ *مرحباً بك في بوت تعدين CRYSTAL!* ✨

👤 *المستخدم:* ${user.first_name}
💎 *الرصيد:* ${stats.crystalBalance.toFixed(2)} CRYSTAL
⚡ *معدل التعدين:* ${stats.miningRate}x
📈 *المستوى:* ${stats.miningLevel}
📊 *تعدين اليوم:* ${stats.dailyMined}/${DAILY_LIMIT}

💰 *سعر العملة:* ${CRYSTAL_PRICE} USDT
⚡ *سعر الترقية:* ${UPGRADE_USDT_PRICE} USDT

🎁 *مكافآت الإحالة:* ادعُ 5 أصدقاء واحصل على 10 كريستال!
🔗 *رابط الإحالة الخاص بك:*
\`${referralLink}\`

🚀 *ابدأ التعدين الآن!*
    `;
    
    await ctx.reply(welcomeText, { 
        parse_mode: 'Markdown',
        ...mainKeyboard 
    });
});

// باقي أوامر البوت (mine_action, leaderboard, buy_menu, upgrade_menu, الخ)
// ... أضف باقي الكود هنا ...

bot.action('mine_action', async (ctx) => {
    await ctx.answerCbQuery();
    const result = await db.mine(ctx.from.id);
    if (result.success) {
        const text = `🎉 *تم التعدين!*\n⛏️ حصلت على: ${result.reward} CRYSTAL\n📊 المتبقي اليوم: ${result.dailyRemaining}/${DAILY_LIMIT}`;
        await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    } else {
        await ctx.editMessageText(result.message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    }
});

bot.action('back_to_menu', async (ctx) => {
    await ctx.answerCbQuery();
    const stats = await db.getUserStats(ctx.from.id);
    const text = `✨ *القائمة الرئيسية*\n💎 الرصيد: ${stats.crystalBalance.toFixed(2)} CRYSTAL\n⚡ المعدل: ${stats.miningRate}x`;
    const keyboard = ctx.from.id === ADMIN_ID ? adminKeyboard : mainKeyboard;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
});

// تشغيل البوت
bot.launch().then(() => {
    console.log('🚀 Bot is running...');
    console.log('👑 Admin ID:', ADMIN_ID);
}).catch((err) => {
    console.error('Error starting bot:', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
