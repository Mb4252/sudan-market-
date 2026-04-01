require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const db = require('./database');
const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');

// ========== إعداد خادم الويب ==========
const app = express();
const PORT = process.env.PORT || 10000;

// منع الإغراق (Rate Limiting)
const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 دقيقة
    max: 30, // الحد الأقصى 30 طلب في الدقيقة
    message: { success: false, message: '⚠️太多请求، يرجى الانتظار قليلاً' },
    standardHeaders: true,
    legacyHeaders: false
});

app.use(limiter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'mining-app')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'mining-app', 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========== API Routes ==========
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
                lastMiningDate: user.lastMiningDate,
                vipLevel: user.vipLevel || 0,
                comboCount: user.comboCount || 0,
                dailyTasks: user.dailyTasks || { streak: 0 }
            });
        } else {
            res.json({ balance: 0, miningRate: 1, miningLevel: 1, totalMined: 0, vipLevel: 0, comboCount: 0 });
        }
    } catch (error) {
        console.error('❌ User API error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/mine', async (req, res) => {
    try {
        const { user_id } = req.body;
        const result = await db.mine(parseInt(user_id));
        res.json(result);
    } catch (error) {
        console.error('❌ Mine API error:', error);
        res.json({ success: false, message: error.message });
    }
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        const leaders = await db.getLeaderboard(10);
        const formatted = leaders.map(leader => ({
            name: leader.firstName || leader.username || `مستخدم ${leader.userId}`,
            balance: leader.crystalBalance || 0,
            level: leader.miningLevel || 1,
            vipLevel: leader.vipLevel || 0
        }));
        res.json(formatted);
    } catch (error) {
        console.error('❌ Leaderboard API error:', error);
        res.json([]);
    }
});

app.get('/api/liquidity', async (req, res) => {
    try {
        const liquidity = await db.getLiquidity();
        res.json({
            total_liquidity: liquidity?.totalLiquidity || 1000000,
            total_sold: liquidity?.totalSold || 0,
            available: (liquidity?.totalLiquidity || 1000000) - (liquidity?.totalSold || 0)
        });
    } catch (error) {
        console.error('❌ Liquidity API error:', error);
        res.json({ total_liquidity: 1000000, total_sold: 0, available: 1000000 });
    }
});

app.post('/api/purchase', async (req, res) => {
    try {
        const { user_id, amount } = req.body;
        const result = await db.requestPurchase(parseInt(user_id), parseFloat(amount));
        res.json(result);
    } catch (error) {
        console.error('❌ Purchase API error:', error);
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/upgrade', async (req, res) => {
    try {
        const { user_id } = req.body;
        const result = await db.upgradeMiningRate(parseInt(user_id));
        res.json(result);
    } catch (error) {
        console.error('❌ Upgrade API error:', error);
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { user_id, username, first_name, language } = req.body;
        await db.registerUser(parseInt(user_id), username, first_name, null, language || 'ar');
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Register API error:', error);
        res.json({ success: true });
    }
});

app.post('/api/set_language', async (req, res) => {
    try {
        const { user_id, language } = req.body;
        await db.setLanguage(parseInt(user_id), language);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Set language API error:', error);
        res.json({ success: false });
    }
});

app.get('/api/user/daily/:userId', async (req, res) => {
    try {
        const stats = await db.getUserStats(parseInt(req.params.userId));
        res.json({
            daily_mined: stats?.dailyMined || 0,
            daily_limit: 70,
            remaining: 70 - (stats?.dailyMined || 0),
            progress: Math.min(100, ((stats?.dailyMined || 0) / 70) * 100)
        });
    } catch (error) {
        console.error('❌ Daily stats API error:', error);
        res.json({ daily_mined: 0, daily_limit: 70, remaining: 70, progress: 0 });
    }
});

// Daily Task API
app.post('/api/daily_task', async (req, res) => {
    try {
        const { user_id } = req.body;
        const result = await db.completeDailyTask(parseInt(user_id));
        res.json(result);
    } catch (error) {
        console.error('❌ Daily task API error:', error);
        res.json({ success: false, message: error.message });
    }
});

// VIP API
app.post('/api/upgrade_vip', async (req, res) => {
    try {
        const { user_id } = req.body;
        const result = await db.upgradeVIP(parseInt(user_id));
        res.json(result);
    } catch (error) {
        console.error('❌ VIP upgrade API error:', error);
        res.json({ success: false, message: error.message });
    }
});

// P2P API Routes
app.get('/api/p2p/offers', async (req, res) => {
    try {
        const { type } = req.query;
        const offers = await db.getP2pOffers(type);
        res.json(offers);
    } catch (error) {
        console.error('❌ P2P offers API error:', error);
        res.json([]);
    }
});

app.post('/api/p2p/create', async (req, res) => {
    try {
        const { user_id, type, amount, usdt } = req.body;
        const result = await db.createP2pOffer(parseInt(user_id), type, parseFloat(amount), parseFloat(usdt));
        res.json(result);
    } catch (error) {
        console.error('❌ P2P create API error:', error);
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/p2p/start', async (req, res) => {
    try {
        const { user_id, offer_id } = req.body;
        const result = await db.startP2pTrade(offer_id, parseInt(user_id));
        res.json(result);
    } catch (error) {
        console.error('❌ P2P start API error:', error);
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/p2p/proof', async (req, res) => {
    try {
        const { user_id, offer_id, proof_image } = req.body;
        const result = await db.sendPaymentProof(offer_id, parseInt(user_id), proof_image);
        res.json(result);
    } catch (error) {
        console.error('❌ P2P proof API error:', error);
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/p2p/release', async (req, res) => {
    try {
        const { user_id, offer_id } = req.body;
        const result = await db.releaseCrystals(offer_id, parseInt(user_id));
        res.json(result);
    } catch (error) {
        console.error('❌ P2P release API error:', error);
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/p2p/dispute', async (req, res) => {
    try {
        const { user_id, offer_id } = req.body;
        const result = await db.openDispute(offer_id, parseInt(user_id));
        res.json(result);
    } catch (error) {
        console.error('❌ P2P dispute API error:', error);
        res.json({ success: false, message: error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});

// ========== إعداد بوت التلجرام مع منع الإغراق ==========
(async () => {
    try {
        await db.connect();
        console.log('✅ Database connected successfully');
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        process.exit(1);
    }
})();

const bot = new Telegraf(process.env.BOT_TOKEN, {
    handlerTimeout: 90000
});

// تخزين آخر وقت لطلب كل مستخدم (منع الإغراق)
const userLastAction = new Map();

// Middleware لمنع الإغراق
async function rateLimitMiddleware(ctx, next) {
    const userId = ctx.from.id;
    const now = Date.now();
    const lastAction = userLastAction.get(userId) || 0;
    
    if (now - lastAction < 2000) { // 2 ثانية بين كل إجراء
        await ctx.answerCbQuery('⚠️ يرجى الانتظار قليلاً قبل تنفيذ إجراء آخر');
        return;
    }
    
    userLastAction.set(userId, now);
    await next();
}

const WEBAPP_URL = process.env.WEBAPP_URL || `https://sdm-security-bot.onrender.com`;
const ADMIN_ID = 6701743450;
const ADMIN_USERNAME = 'hmood19931130';
const UPGRADE_USDT_PRICE = 3;
const CRYSTAL_PRICE = 0.01;
const DAILY_LIMIT = 70;
const TRON_ADDRESS = process.env.TRON_ADDRESS || 'TCZ2NGDSvxznADHTvvkedJTcbbGbD5RhfR';

// قائمة الأزرار الرئيسية
const mainKeyboard = Markup.inlineKeyboard([
    [Markup.button.webApp('🚀 فتح تطبيق التعدين', WEBAPP_URL)],
    [Markup.button.callback('⛏️ تعدين', 'mine_action')],
    [Markup.button.callback('💰 الرصيد بـ USDT', 'show_usdt')],
    [Markup.button.callback('🏆 المتصدرين', 'leaderboard')],
    [Markup.button.callback('📊 سوق P2P', 'p2p_market')],
    [Markup.button.callback('⚡ ترقية', 'upgrade_menu')],
    [Markup.button.callback('👥 إحالة', 'referral_system')],
    [Markup.button.callback('📋 مهام يومية', 'daily_task')],
    [Markup.button.callback('👑 نظام VIP', 'vip_system')],
    [Markup.button.callback('🌐 اللغة', 'change_language')],
    [Markup.button.callback('📞 الدعم', 'support')],
    [Markup.button.callback('📈 إحصائياتي', 'my_stats')]
]);

// قائمة أدمن
const adminKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📋 طلبات الترقية', 'pending_upgrades')],
    [Markup.button.callback('💰 طلبات الشراء', 'pending_purchases')],
    [Markup.button.callback('⚠️ النزاعات', 'pending_disputes')],
    [Markup.button.callback('📊 إحصائيات عامة', 'global_stats')],
    [Markup.button.callback('📅 إحصائيات اليوم', 'today_stats')],
    [Markup.button.callback('🔍 بحث عن مستخدم', 'search_user')],
    [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
]);

// أمر /start
bot.start(async (ctx) => {
    const user = ctx.from;
    const referrerId = ctx.startPayload ? parseInt(ctx.startPayload) : null;
    
    await db.registerUser(user.id, user.username, user.first_name, referrerId, 'ar');
    
    const stats = await db.getUserStats(user.id);
    const referralLink = `https://t.me/${ctx.botInfo.username}?start=${user.id}`;
    const progress = Math.min(100, (stats.dailyMined / DAILY_LIMIT) * 100);
    
    const welcomeText = db.getText('welcome', stats.language, {
        name: user.first_name,
        balance: stats.crystalBalance,
        rate: stats.miningRate,
        level: stats.miningLevel,
        daily: stats.dailyMined,
        limit: DAILY_LIMIT
    });
    
    await ctx.reply(welcomeText, { parse_mode: 'Markdown', ...mainKeyboard });
    await ctx.reply(`🔗 *رابط الإحالة الخاص بك:*\n\`${referralLink}\``, { parse_mode: 'Markdown' });
    await ctx.reply(`📊 *نسبة التعدين اليومي:* ${Math.floor(progress)}%\n💎 *المتبقي:* ${DAILY_LIMIT - stats.dailyMined} كريستال`, { parse_mode: 'Markdown' });
});

// تعدين مع منع الإغراق
bot.action('mine_action', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    
    const result = await db.mine(ctx.from.id);
    
    if (result.success) {
        const message = result.message || `✅ تم التعدين!\n💎 +${result.reward} CRYSTAL\n📊 اليوم: ${result.dailyMined}/${DAILY_LIMIT}\n📈 نسبة الإنجاز: ${result.progress}%`;
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
        });
    } else {
        await ctx.editMessageText(result.message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
        });
    }
});

// نظام VIP (معدل)
bot.action('vip_system', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    
    try {
        const stats = await db.getUserStats(ctx.from.id);
        if (!stats) {
            await ctx.editMessageText('❌ لم يتم العثور على بياناتك', {
                ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
            });
            return;
        }
        
        const nextExp = (stats.vipLevel + 1) * 1000;
        const progress = Math.min(100, (stats.totalMined / nextExp) * 100);
        const vipBonus = stats.vipLevel * 10;
        
        const text = `
👑 *نظام VIP* 👑

🎖️ *مستواك:* ${stats.vipLevel}
📊 *نقاط الخبرة:* ${stats.totalMined.toFixed(0)}/${nextExp}
📈 *نسبة التقدم:* ${Math.floor(progress)}%

✨ *مزايا VIP:*
• VIP 1: +10% معدل التعدين
• VIP 2: +20% معدل التعدين + مكافآت إحالة مضاعفة
• VIP 3: +30% معدل التعدين + أولوية في P2P

📝 *للترقية:* اضغط على زر الترقية أدناه
        `;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('⭐ ترقية VIP', 'do_vip_upgrade')],
            [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
        ]);
        
        await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    } catch (error) {
        console.error('❌ VIP system error:', error);
        await ctx.editMessageText('⚠️ حدث خطأ، حاول مرة أخرى', {
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
        });
    }
});

// تنفيذ ترقية VIP
bot.action('do_vip_upgrade', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    
    try {
        const result = await db.upgradeVIP(ctx.from.id);
        
        if (result.success) {
            const text = `👑 *تمت ترقية VIP!*\n\n🎖️ *المستوى الجديد:* ${result.newLevel}\n🎁 *المكافأة:* +${result.bonus} CRYSTAL\n✨ *معدل التعدين:+${result.newLevel * 10}%*`;
            await ctx.editMessageText(text, { 
                parse_mode: 'Markdown', 
                ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) 
            });
            await ctx.reply(`🎉 مبروك! تمت ترقية حسابك إلى VIP ${result.newLevel}`);
        } else {
            await ctx.editMessageText(result.message, { 
                parse_mode: 'Markdown', 
                ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) 
            });
        }
    } catch (error) {
        console.error('❌ VIP upgrade error:', error);
        await ctx.editMessageText('⚠️ حدث خطأ أثناء الترقية، حاول مرة أخرى', {
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
        });
    }
});

// المهمة اليومية
bot.action('daily_task', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    
    try {
        const result = await db.completeDailyTask(ctx.from.id);
        
        if (result.success) {
            const text = `✅ *المهمة اليومية مكتملة!*\n\n🎁 *المكافأة:* +${result.reward} CRYSTAL\n📈 *السلسلة:* ${result.streak} أيام`;
            await ctx.editMessageText(text, { 
                parse_mode: 'Markdown', 
                ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) 
            });
        } else {
            await ctx.editMessageText(result.message, { 
                parse_mode: 'Markdown', 
                ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) 
            });
        }
    } catch (error) {
        console.error('❌ Daily task error:', error);
        await ctx.editMessageText('⚠️ حدث خطأ، حاول مرة أخرى', {
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
        });
    }
});

// عرض الرصيد بـ USDT
bot.action('show_usdt', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    
    const stats = await db.getUserStats(ctx.from.id);
    const text = db.getText('usdtValue', stats.language, {
        crystals: stats.crystalBalance,
        usdt: stats.usdtValue
    });
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
    });
});

// المتصدرين
bot.action('leaderboard', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    
    const leaders = await db.getLeaderboard(15);
    
    if (!leaders || leaders.length === 0) {
        await ctx.editMessageText('🏆 لا يوجد متصدرين بعد! ابدأ التعدين الآن 🚀', {
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
        });
        return;
    }
    
    let leaderboardText = '🏆 *قائمة المتصدرين* 🏆\n\n';
    
    for (let i = 0; i < leaders.length; i++) {
        const leader = leaders[i];
        const name = leader.firstName || leader.username || `مستخدم ${leader.userId}`;
        const medal = i === 0 ? '👑 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : `${i + 1}. `;
        const vipIcon = leader.vipLevel > 0 ? ' 👑' : '';
        leaderboardText += `${medal} *${name}${vipIcon}*\n`;
        leaderboardText += `   💎 ${leader.crystalBalance.toFixed(2)} CRYSTAL\n`;
        leaderboardText += `   ⛏️ المستوى ${leader.miningLevel}\n\n`;
    }
    
    await ctx.editMessageText(leaderboardText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
    });
});

// قائمة الترقية
bot.action('upgrade_menu', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    
    const stats = await db.getUserStats(ctx.from.id);
    const upgradeCost = 100 * stats.miningLevel;
    const usdtValue = upgradeCost * 0.01;
    const nextRate = (stats.miningRate + 0.5).toFixed(1);
    
    const text = `
⚡ *ترقية معدل التعدين* ⚡

📊 *مستواك:* ${stats.miningLevel}
⚡ *المعدل الحالي:* ${stats.miningRate}x
📈 *المعدل بعد الترقية:* ${nextRate}x

💰 *تكلفة الترقية:* ${upgradeCost} CRYSTAL
💵 *قيمتها:* ${usdtValue} USDT

📝 *للترقية بالكريستال:* /upgrade
💰 *للترقية بـ USDT:* /upgrade_usdt ${UPGRADE_USDT_PRICE}

⚠️ *الحد الأدنى للترقية بـ USDT: 3 دولار*
    `;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('⚡ ترقية بالكريستال', 'do_upgrade')],
        [Markup.button.callback('💰 ترقية بـ USDT', 'upgrade_usdt_request')],
        [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
    ]);
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...keyboard
    });
});

// طلب ترقية بـ USDT
bot.action('upgrade_usdt_request', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('📝 الرجاء إدخال المبلغ بالدولار (الحد الأدنى 3 USDT):');
    ctx.session = { state: 'upgrade_usdt_amount' };
});

// تنفيذ الترقية بالكريستال
bot.action('do_upgrade', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    
    const result = await db.upgradeMiningRate(ctx.from.id);
    
    if (result.success) {
        await ctx.editMessageText(result.message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
        });
    } else {
        await ctx.editMessageText(result.message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
        });
    }
});

// سوق P2P
bot.action('p2p_market', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    
    const stats = await db.getUserStats(ctx.from.id);
    const text = db.getText('p2pMarket', stats.language, {
        balance: stats.crystalBalance,
        usdt: stats.usdtValue
    });
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🟢 عروض البيع', 'p2p_buy_offers')],
        [Markup.button.callback('🔴 عروض الشراء', 'p2p_sell_offers')],
        [Markup.button.callback('➕ إنشاء عرض', 'p2p_create_offer')],
        [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
    ]);
    
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
});

// عرض عروض البيع
bot.action('p2p_buy_offers', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    
    const offers = await db.getP2pOffers('sell');
    
    if (offers.length === 0) {
        await ctx.editMessageText('📭 لا توجد عروض بيع حالياً', {
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'p2p_market')]])
        });
        return;
    }
    
    let text = '🟢 *عروض البيع* 🟢\n\n';
    for (const offer of offers) {
        text += `👤 ${offer.firstName || offer.username}\n`;
        text += `💎 ${offer.crystalAmount} CRYSTAL\n`;
        text += `💰 ${offer.usdtAmount} USDT\n`;
        text += `📊 ${(offer.pricePerCrystal || 0).toFixed(4)} USDT/CRYSTAL\n`;
        text += `🆔 \`${offer._id}\`\n`;
        text += `━━━━━━━━━━━━━━━━━━\n`;
    }
    
    text += `\n📝 *لشراء عرض:* /buy_offer [رقم العرض]`;
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'p2p_market')]])
    });
});

// عرض عروض الشراء
bot.action('p2p_sell_offers', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    
    const offers = await db.getP2pOffers('buy');
    
    if (offers.length === 0) {
        await ctx.editMessageText('📭 لا توجد عروض شراء حالياً', {
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'p2p_market')]])
        });
        return;
    }
    
    let text = '🔴 *عروض الشراء* 🔴\n\n';
    for (const offer of offers) {
        text += `👤 ${offer.firstName || offer.username}\n`;
        text += `💎 ${offer.crystalAmount} CRYSTAL\n`;
        text += `💰 ${offer.usdtAmount} USDT\n`;
        text += `📊 ${(offer.pricePerCrystal || 0).toFixed(4)} USDT/CRYSTAL\n`;
        text += `🆔 \`${offer._id}\`\n`;
        text += `━━━━━━━━━━━━━━━━━━\n`;
    }
    
    text += `\n📝 *لشراء عرض:* /sell_offer [رقم العرض]`;
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'p2p_market')]])
    });
});

// إنشاء عرض P2P
bot.action('p2p_create_offer', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    
    const text = `
📝 *إنشاء عرض P2P*

أرسل العرض بالصيغة التالية:
\`sell 1000 10\` - لبيع 1000 كريستال بـ 10 USDT
\`buy 500 5\` - لشراء 500 كريستال بـ 5 USDT

📊 *سعر الوحدة:* ${CRYSTAL_PRICE} USDT (السعر الرسمي)
⚠️ *الحد الأدنى: 5 USDT*

⚠️ *ملاحظة:* يمكنك تحديد السعر حسب رغبتك
    `;
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'p2p_market')]])
    });
    
    ctx.session = { state: 'p2p_create' };
});

// نظام الإحالة
bot.action('referral_system', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    
    const stats = await db.getUserStats(ctx.from.id);
    const referralLink = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
    
    const text = `
👥 *نظام الإحالة* 👥

🎁 *المكافآت:*
• ادعُ 10 أصدقاء واحصل على 3000 كريستال مجاناً!
• كل صديق يدخل عن طريقك يحصل على مكافأة ترحيبية

📊 *إحصائياتك:*
• عدد الإحالات: ${stats.referralsCount}/10
• إحالات اليوم: ${stats.todayReferrals || 0}/10
• المكافأة: ${stats.referralsCount >= 10 ? '✅ تم الحصول على 3000 كريستال' : '❌ لم تتحقق بعد'}

🔗 *رابط الإحالة الخاص بك:*
\`${referralLink}\`

💡 *انشر الرابط لأصدقائك واكسب المكافآت!*
    `;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📤 مشاركة الرابط', 'share_referral')],
        [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
    ]);
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...keyboard
    });
});

// مشاركة رابط الإحالة
bot.action('share_referral', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    
    const referralLink = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
    
    await ctx.reply(`🔗 *رابط الإحالة الخاص بك:*\n\`${referralLink}\``, {
        parse_mode: 'Markdown'
    });
});

// إحصائياتي
bot.action('my_stats', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    
    const stats = await db.getUserStats(ctx.from.id);
    if (!stats) {
        await ctx.reply('❌ لم يتم العثور على بياناتك');
        return;
    }
    
    const progress = Math.min(100, (stats.dailyMined / DAILY_LIMIT) * 100);
    const vipBonus = stats.vipLevel * 10;
    
    const text = `
📊 *إحصائياتك الشخصية* 📊

👤 *الاسم:* ${stats.firstName}
💎 *الرصيد:* ${stats.crystalBalance.toFixed(2)} CRYSTAL
💰 *القيمة:* ${stats.usdtValue.toFixed(2)} USDT
⚡ *معدل التعدين:* ${stats.miningRate}x
📈 *المستوى:* ${stats.miningLevel}
👑 *VIP:* المستوى ${stats.vipLevel} (+${vipBonus}% مكافأة)
⛏️ *إجمالي التعدين:* ${stats.totalMined.toFixed(2)} CRYSTAL
📅 *تعدين اليوم:* ${stats.dailyMined}/${DAILY_LIMIT}
📊 *نسبة الإنجاز:* ${Math.floor(progress)}%
⏰ *المتبقي اليوم:* ${DAILY_LIMIT - stats.dailyMined} كريستال
🔥 *الكومبو:* ${stats.comboCount || 0} يوم متتالي

👥 *الإحالات:* ${stats.referralsCount}/10
📊 *إحالات اليوم:* ${stats.todayReferrals || 0}/10
🎁 *مكافأة الإحالات:* ${stats.referralsCount >= 10 ? '✅ تم الحصول على 3000 كريستال' : '❌ لم تتحقق بعد'}

📅 *تاريخ التسجيل:* ${new Date(stats.createdAt).toLocaleDateString('ar')}
    `;
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
    });
});

// تغيير اللغة
bot.action('change_language', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🇸🇦 العربية', 'lang_ar')],
        [Markup.button.callback('🇬🇧 English', 'lang_en')],
        [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
    ]);
    
    await ctx.editMessageText('🌐 *اختر اللغة / Choose Language*', {
        parse_mode: 'Markdown',
        ...keyboard
    });
});

bot.action('lang_ar', rateLimitMiddleware, async (ctx) => {
    await db.setLanguage(ctx.from.id, 'ar');
    await ctx.answerCbQuery('✅ تم تغيير اللغة إلى العربية');
    await ctx.editMessageText('✅ تم تغيير اللغة إلى العربية', {
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
    });
});

bot.action('lang_en', rateLimitMiddleware, async (ctx) => {
    await db.setLanguage(ctx.from.id, 'en');
    await ctx.answerCbQuery('✅ Language changed to English');
    await ctx.editMessageText('✅ Language changed to English', {
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
    });
});

// الدعم الفني
bot.action('support', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    
    const stats = await db.getUserStats(ctx.from.id);
    const text = db.getText('support', stats?.language || 'ar', {
        adminUsername: ADMIN_USERNAME,
        adminId: ADMIN_ID
    });
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.url('📨 تواصل مع الأدمن', `https://t.me/${ADMIN_USERNAME}`)],
        [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
    ]);
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...keyboard
    });
});

// العودة للقائمة الرئيسية
bot.action('back_to_menu', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    
    const stats = await db.getUserStats(ctx.from.id);
    const referralLink = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
    const progress = Math.min(100, (stats.dailyMined / DAILY_LIMIT) * 100);
    const vipBonus = stats.vipLevel * 10;
    
    const text = `
✨ *قائمة CRYSTAL الرئيسية* ✨

👤 *المستخدم:* ${ctx.from.first_name}
💎 *الرصيد:* ${stats.crystalBalance.toFixed(2)} CRYSTAL
💰 *القيمة:* ${stats.usdtValue.toFixed(2)} USDT
⚡ *معدل التعدين:* ${stats.miningRate}x
👑 *VIP:* المستوى ${stats.vipLevel || 0} (+${vipBonus}% مكافأة)
📊 *تعدين اليوم:* ${stats.dailyMined}/${DAILY_LIMIT}
📈 *نسبة الإنجاز:* ${Math.floor(progress)}%
🔥 *الكومبو:* ${stats.comboCount || 0} يوم

🎁 *رابط الإحالة الخاص بك:*
\`${referralLink}\`

👥 *الإحالات:* ${stats.referralsCount}/10
    `;
    
    const keyboard = ctx.from.id === ADMIN_ID ? adminKeyboard : mainKeyboard;
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...keyboard
    });
});

// معالجة النصوص (منع الإغراق)
const userLastMessage = new Map();

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const now = Date.now();
    const lastMessage = userLastMessage.get(userId) || 0;
    
    if (now - lastMessage < 1000) { // 1 ثانية بين الرسائل
        return;
    }
    userLastMessage.set(userId, now);
    
    // معالجة إنشاء عرض P2P
    if (ctx.session?.state === 'p2p_create') {
        const parts = ctx.message.text.split(' ');
        if (parts.length !== 3) {
            await ctx.reply('❌ الصيغة: [sell/buy] [الكمية] [السعر]\nمثال: sell 1000 10\n⚠️ الحد الأدنى 5 USDT');
            delete ctx.session.state;
            return;
        }
        
        const [type, amount, usdt] = parts;
        const crystalAmount = parseFloat(amount);
        const usdtAmount = parseFloat(usdt);
        
        if (isNaN(crystalAmount) || isNaN(usdtAmount)) {
            await ctx.reply('❌ الرجاء إدخال أرقام صحيحة');
            delete ctx.session.state;
            return;
        }
        
        if (usdtAmount < 5) {
            await ctx.reply('❌ الحد الأدنى للعرض هو 5 USDT');
            delete ctx.session.state;
            return;
        }
        
        const result = await db.createP2pOffer(ctx.from.id, type, crystalAmount, usdtAmount);
        await ctx.reply(result.message, { parse_mode: 'Markdown' });
        delete ctx.session.state;
    } else if (ctx.session?.state === 'upgrade_usdt_amount') {
        const amount = parseFloat(ctx.message.text);
        if (isNaN(amount) || amount < 3) {
            await ctx.reply('❌ المبلغ غير صحيح! الحد الأدنى 3 USDT');
            delete ctx.session.state;
            return;
        }
        
        const result = await db.requestUpgrade(ctx.from.id, amount);
        
        if (result.success) {
            const copyKeyboard = Markup.inlineKeyboard([
                [Markup.button.callback('📋 نسخ عنوان TRON', `copy_address_${TRON_ADDRESS}`)],
                [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
            ]);
            
            await ctx.reply(result.message, { parse_mode: 'Markdown', ...copyKeyboard });
            
            await bot.telegram.sendMessage(ADMIN_ID, `
🔔 *طلب ترقية جديد!*

👤 المستخدم: ${ctx.from.first_name} (@${ctx.from.username || 'لا يوجد'})
🆔 المعرف: ${ctx.from.id}
📊 المستوى الحالي: ${result.current_level}
📈 المستوى المطلوب: ${result.requested_level}
💰 المبلغ: ${result.usdt_amount} USDT
📋 رقم الطلب: \`${result.request_id}\`

للتأكيد:
\`/confirm_upgrade ${result.request_id} [رابط المعاملة]\`
            `, { parse_mode: 'Markdown' });
        } else {
            await ctx.reply(`❌ ${result.message}`);
        }
        
        delete ctx.session.state;
    }
});

// أمر ترقية بالكريستال
bot.command('upgrade', async (ctx) => {
    const result = await db.upgradeMiningRate(ctx.from.id);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

// أمر ترقية بـ USDT
bot.command('upgrade_usdt', async (ctx) => {
    const args = ctx.message.text.split(' ');
    const amount = args[1] ? parseFloat(args[1]) : UPGRADE_USDT_PRICE;
    
    if (isNaN(amount) || amount < 3) {
        await ctx.reply('❌ المبلغ غير صحيح! الحد الأدنى 3 USDT\nمثال: /upgrade_usdt 5');
        return;
    }
    
    const result = await db.requestUpgrade(ctx.from.id, amount);
    
    if (result.success) {
        const copyKeyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📋 نسخ عنوان TRON', `copy_address_${TRON_ADDRESS}`)],
            [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
        ]);
        
        await ctx.reply(result.message, { parse_mode: 'Markdown', ...copyKeyboard });
        
        await bot.telegram.sendMessage(ADMIN_ID, `
🔔 *طلب ترقية جديد!*

👤 المستخدم: ${ctx.from.first_name} (@${ctx.from.username || 'لا يوجد'})
🆔 المعرف: ${ctx.from.id}
📊 المستوى الحالي: ${result.current_level}
📈 المستوى المطلوب: ${result.requested_level}
💰 المبلغ: ${result.usdt_amount} USDT
📋 رقم الطلب: \`${result.request_id}\`

للتأكيد:
\`/confirm_upgrade ${result.request_id} [رابط المعاملة]\`
        `, { parse_mode: 'Markdown' });
    } else {
        await ctx.reply(`❌ ${result.message}`);
    }
});

// تأكيد ترقية (للأدمن)
bot.command('confirm_upgrade', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        await ctx.reply('⛔ هذا الأمر للأدمن فقط!');
        return;
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length !== 3) {
        await ctx.reply('❌ الصيغة: /confirm_upgrade [رقم الطلب] [رابط المعاملة]');
        return;
    }
    
    const requestId = args[1];
    const transactionHash = args[2];
    
    const result = await db.confirmUpgrade(requestId, transactionHash, ctx.from.id);
    
    if (result.success) {
        await ctx.reply(result.message, { parse_mode: 'Markdown' });
        
        if (result.user_id) {
            await bot.telegram.sendMessage(result.user_id, result.message, { parse_mode: 'Markdown' });
        }
    } else {
        await ctx.reply(`❌ ${result.message}`);
    }
});

// أمر شراء
bot.command('buy', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) {
        await ctx.reply('❌ الصيغة: /buy [الكمية]\nمثال: /buy 1000');
        return;
    }
    
    const amount = parseFloat(args[1]);
    if (isNaN(amount) || amount <= 0) {
        await ctx.reply('❌ الرجاء إدخال كمية صحيحة');
        return;
    }
    
    const result = await db.requestPurchase(ctx.from.id, amount);
    
    if (result.success) {
        const copyKeyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📋 نسخ عنوان TRON', `copy_address_${result.payment_address}`)],
            [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
        ]);
        
        await ctx.reply(result.message, { parse_mode: 'Markdown', ...copyKeyboard });
        
        await bot.telegram.sendMessage(ADMIN_ID, `
🔔 *طلب شراء جديد!*

👤 المستخدم: ${ctx.from.first_name} (@${ctx.from.username || 'لا يوجد'})
🆔 المعرف: ${ctx.from.id}
💎 الكمية: ${result.crystal_amount} CRYSTAL
💰 المبلغ: ${result.usdt_amount} USDT
📋 رقم الطلب: \`${result.request_id}\`

للتأكيد:
\`/confirm_purchase ${result.request_id} [رابط المعاملة]\`
        `, { parse_mode: 'Markdown' });
    } else {
        await ctx.reply(`❌ ${result.message}`);
    }
});

// زر نسخ عنوان TRON
bot.action(/copy_address_(.+)/, async (ctx) => {
    const address = ctx.match[1];
    await ctx.answerCbQuery('✅ تم نسخ العنوان!');
    await ctx.reply(`📋 *العنوان المنسوخ:*\n\`${address}\``, { parse_mode: 'Markdown' });
});

// تأكيد شراء (للأدمن)
bot.command('confirm_purchase', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        await ctx.reply('⛔ هذا الأمر للأدمن فقط!');
        return;
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length !== 3) {
        await ctx.reply('❌ الصيغة: /confirm_purchase [رقم الطلب] [رابط المعاملة]');
        return;
    }
    
    const requestId = args[1];
    const transactionHash = args[2];
    
    const result = await db.confirmPurchase(requestId, transactionHash, ctx.from.id);
    
    if (result.success) {
        await ctx.reply(result.message, { parse_mode: 'Markdown' });
    } else {
        await ctx.reply(`❌ ${result.message}`);
    }
});

// أمر شراء عرض P2P
bot.command('buy_offer', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) {
        await ctx.reply('❌ الصيغة: /buy_offer [رقم العرض]');
        return;
    }
    
    const offerId = args[1];
    const result = await db.startP2pTrade(offerId, ctx.from.id);
    
    if (result.success) {
        await ctx.reply(result.message, { parse_mode: 'Markdown' });
        await ctx.reply(`📤 *أرسل المبلغ إلى:*\n\`${TRON_ADDRESS}\`\n\n📎 *بعد الإرسال:* /send_proof ${offerId} [رابط الصورة]`, { parse_mode: 'Markdown' });
    } else {
        await ctx.reply(`❌ ${result.message}`);
    }
});

// أمر بيع عرض P2P
bot.command('sell_offer', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) {
        await ctx.reply('❌ الصيغة: /sell_offer [رقم العرض]');
        return;
    }
    
    const offerId = args[1];
    const result = await db.startP2pTrade(offerId, ctx.from.id);
    
    if (result.success) {
        await ctx.reply(result.message, { parse_mode: 'Markdown' });
        await ctx.reply(`📤 *أرسل المبلغ إلى:*\n\`${TRON_ADDRESS}\`\n\n📎 *بعد الإرسال:* /send_proof ${offerId} [رابط الصورة]`, { parse_mode: 'Markdown' });
    } else {
        await ctx.reply(`❌ ${result.message}`);
    }
});

// أمر إرسال إثبات الدفع
bot.command('send_proof', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length !== 3) {
        await ctx.reply('❌ الصيغة: /send_proof [رقم العرض] [رابط الصورة]');
        return;
    }
    
    const offerId = args[1];
    const proofImage = args[2];
    
    const result = await db.sendPaymentProof(offerId, ctx.from.id, proofImage);
    
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
    
    if (result.success && result.sellerId) {
        await bot.telegram.sendMessage(result.sellerId, `
🔔 *تم استلام إثبات الدفع!*

📋 *رقم العرض:* ${offerId}
🖼️ *رابط الإثبات:* ${proofImage}

✅ *لتأكيد استلام المبلغ وإطلاق العملة:*
/release_crystals ${offerId}
        `, { parse_mode: 'Markdown' });
    }
});

// أمر تحرير العملة
bot.command('release_crystals', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) {
        await ctx.reply('❌ الصيغة: /release_crystals [رقم العرض]');
        return;
    }
    
    const offerId = args[1];
    const result = await db.releaseCrystals(offerId, ctx.from.id);
    
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
    
    if (result.success && result.buyerId) {
        await bot.telegram.sendMessage(result.buyerId, result.message, { parse_mode: 'Markdown' });
    }
});

// أمر فتح نزاع
bot.command('dispute', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) {
        await ctx.reply('❌ الصيغة: /dispute [رقم العرض]');
        return;
    }
    
    const offerId = args[1];
    const result = await db.openDispute(offerId, ctx.from.id);
    
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
    
    await bot.telegram.sendMessage(ADMIN_ID, `
⚠️ *نزاع جديد!*

👤 المستخدم: ${ctx.from.first_name} (@${ctx.from.username || 'لا يوجد'})
🆔 المعرف: ${ctx.from.id}
📋 رقم العرض: ${offerId}

للمراجعة:
/check_dispute ${offerId}
    `, { parse_mode: 'Markdown' });
});

// أمر تعدين مباشر
bot.command('mine', async (ctx) => {
    const result = await db.mine(ctx.from.id);
    
    if (result.success) {
        const stats = await db.getUserStats(ctx.from.id);
        await ctx.reply(`
🎉 *تم التعدين بنجاح!*

⛏️ *حصلت على:* ${result.reward} CRYSTAL
💎 *الرصيد الحالي:* ${stats.crystalBalance.toFixed(2)}
📊 *المتبقي اليوم:* ${DAILY_LIMIT - stats.dailyMined}/${DAILY_LIMIT}
📈 *نسبة الإنجاز:* ${Math.floor((stats.dailyMined / DAILY_LIMIT) * 100)}%
        `, { parse_mode: 'Markdown' });
    } else {
        await ctx.reply(result.message, { parse_mode: 'Markdown' });
    }
});

// أمر إحصائيات
bot.command('stats', async (ctx) => {
    const stats = await db.getUserStats(ctx.from.id);
    const progress = Math.min(100, (stats.dailyMined / DAILY_LIMIT) * 100);
    
    const text = `
📊 *إحصائياتك* 📊

💎 *الرصيد:* ${stats.crystalBalance.toFixed(2)}
💰 *القيمة:* ${stats.usdtValue.toFixed(2)} USDT
⚡ *معدل التعدين:* ${stats.miningRate}x
📈 *المستوى:* ${stats.miningLevel}
👑 *VIP:* المستوى ${stats.vipLevel || 0}
⛏️ *إجمالي التعدين:* ${stats.totalMined.toFixed(2)}
📅 *تعدين اليوم:* ${stats.dailyMined}/${DAILY_LIMIT}
📊 *نسبة الإنجاز:* ${Math.floor(progress)}%
🔥 *الكومبو:* ${stats.comboCount || 0} يوم
👥 *الإحالات:* ${stats.referralsCount}
    `;
    
    await ctx.reply(text, { parse_mode: 'Markdown' });
});

// تشغيل البوت
bot.launch().then(() => {
    console.log('🚀 Bot is running...');
    console.log('👑 Admin ID:', ADMIN_ID);
    console.log('👑 Admin Username:', ADMIN_USERNAME);
    console.log('💎 Daily Limit:', DAILY_LIMIT, 'CRYSTAL');
    console.log('💰 TRON Address:', TRON_ADDRESS);
    console.log('⚡ Upgrade Min:', UPGRADE_USDT_PRICE, 'USDT');
    console.log('🛡️ Rate Limiting enabled (2 sec between actions)');
}).catch((err) => {
    console.error('Error starting bot:', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
