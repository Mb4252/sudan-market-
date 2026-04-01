require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const db = require('./database');
const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// ========== إعداد خادم الويب مع حماية متقدمة ==========
const app = express();
const PORT = process.env.PORT || 10000;

// حماية إضافية
app.use(helmet({
    contentSecurityPolicy: false,
}));

// منع الإغراق للـ API
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { success: false, message: '⚠️ الكثير من الطلبات، يرجى الانتظار قليلاً' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        return req.body?.user_id === parseInt(process.env.ADMIN_ID);
    }
});

app.use(limiter);
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'mining-app')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'mining-app', 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API الإحصائيات العامة
app.get('/api/global_stats', async (req, res) => {
    try {
        const stats = await db.getGlobalStats();
        res.json(stats);
    } catch (error) {
        res.json({ users: 0, totalCrystals: 0, totalMined: 0 });
    }
});

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
                lastMiningDate: user.lastMiningDate,
                vipLevel: user.vipLevel || 0,
                comboCount: user.comboCount || 0,
                dailyTasks: user.dailyTasks || { streak: 0 }
            });
        } else {
            res.json({ balance: 0, miningRate: 1, miningLevel: 1, totalMined: 0, vipLevel: 0, comboCount: 0 });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/mine', async (req, res) => {
    try {
        const { user_id } = req.body;
        const result = await db.mine(parseInt(user_id));
        res.json(result);
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        const leaders = await db.getLeaderboard(15);
        const formatted = leaders.map(leader => ({
            name: leader.firstName || leader.username || `مستخدم ${leader.userId}`,
            balance: leader.crystalBalance || 0,
            level: leader.miningLevel || 1,
            vipLevel: leader.vipLevel || 0
        }));
        res.json(formatted);
    } catch (error) {
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
        res.json({ total_liquidity: 1000000, total_sold: 0, available: 1000000 });
    }
});

app.post('/api/purchase', async (req, res) => {
    try {
        const { user_id, amount } = req.body;
        const result = await db.requestPurchase(parseInt(user_id), parseFloat(amount));
        res.json(result);
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/upgrade', async (req, res) => {
    try {
        const { user_id } = req.body;
        const result = await db.upgradeMiningRate(parseInt(user_id));
        res.json(result);
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { user_id, username, first_name, language } = req.body;
        await db.registerUser(parseInt(user_id), username, first_name, null, language || 'ar');
        res.json({ success: true });
    } catch (error) {
        res.json({ success: true });
    }
});

app.post('/api/set_language', async (req, res) => {
    try {
        const { user_id, language } = req.body;
        await db.setLanguage(parseInt(user_id), language);
        res.json({ success: true });
    } catch (error) {
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
        res.json({ daily_mined: 0, daily_limit: 70, remaining: 70, progress: 0 });
    }
});

app.post('/api/daily_task', async (req, res) => {
    try {
        const { user_id } = req.body;
        const result = await db.completeDailyTask(parseInt(user_id));
        res.json(result);
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/upgrade_vip', async (req, res) => {
    try {
        const { user_id } = req.body;
        const result = await db.upgradeVIP(parseInt(user_id));
        res.json(result);
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.get('/api/p2p/offers', async (req, res) => {
    try {
        const { type } = req.query;
        const offers = await db.getP2pOffers(type);
        res.json(offers);
    } catch (error) {
        res.json([]);
    }
});

app.post('/api/p2p/create', async (req, res) => {
    try {
        const { user_id, type, amount, usdt } = req.body;
        const result = await db.createP2pOffer(parseInt(user_id), type, parseFloat(amount), parseFloat(usdt));
        res.json(result);
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/p2p/start', async (req, res) => {
    try {
        const { user_id, offer_id } = req.body;
        const result = await db.startP2pTrade(offer_id, parseInt(user_id));
        res.json(result);
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});

// ========== إعداد بوت التلجرام مع حماية متقدمة ==========
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

// ========== نظام منع الإغراق المتقدم ==========

// تخزين البيانات
const userLastAction = new Map();
const userLastMessage = new Map();
const userActionCount = new Map();
const userWarningCount = new Map();
const bannedUsers = new Map();
const userSessionTokens = new Map(); // منع تعدد الجلسات
const ipRequestCount = new Map(); // تتبع الطلبات حسب الـ IP

// إعدادات الحماية
const RATE_LIMIT = {
    ACTION_DELAY: 2000,           // 2 ثانية بين الإجراءات
    MESSAGE_DELAY: 1500,          // 1.5 ثانية بين الرسائل
    MAX_ACTIONS_PER_MINUTE: 8,    // 8 إجراءات كحد أقصى في الدقيقة
    MAX_MESSAGES_PER_MINUTE: 5,   // 5 رسائل كحد أقصى في الدقيقة
    MAX_WARNINGS: 2,              // 2 تحذيرات ثم حظر
    TEMP_BAN_DURATION: 600000,    // 10 دقائق حظر مؤقت
    PERMANENT_BAN_THRESHOLD: 3,   // 3 حظائر مؤقتة = حظر دائم
    ADMIN_ID: 6701743450
};

// التحقق من الحظر
function isBanned(userId) {
    const banData = bannedUsers.get(userId);
    if (!banData) return false;
    
    if (banData.expires > Date.now()) {
        return true;
    }
    // انتهاء الحظر
    bannedUsers.delete(userId);
    userWarningCount.delete(userId);
    return false;
}

// تسجيل إجراء وحساب المخالفات
function trackAction(userId, type = 'action') {
    const now = Date.now();
    const limit = type === 'action' ? RATE_LIMIT.MAX_ACTIONS_PER_MINUTE : RATE_LIMIT.MAX_MESSAGES_PER_MINUTE;
    
    // تنظيف الإجراءات القديمة
    const userActions = userActionCount.get(userId) || [];
    const validActions = userActions.filter(time => now - time < 60000);
    validActions.push(now);
    userActionCount.set(userId, validActions);
    
    // التحقق من تجاوز الحد
    if (validActions.length > limit) {
        const warnings = (userWarningCount.get(userId) || 0) + 1;
        userWarningCount.set(userId, warnings);
        
        if (warnings >= RATE_LIMIT.MAX_WARNINGS) {
            const banCount = (bannedUsers.get(userId)?.count || 0) + 1;
            
            if (banCount >= RATE_LIMIT.PERMANENT_BAN_THRESHOLD) {
                // حظر دائم
                bannedUsers.set(userId, { expires: Infinity, count: banCount, permanent: true });
                
                // إشعار الأدمن
                bot.telegram.sendMessage(RATE_LIMIT.ADMIN_ID, `
🚫 *تم حظر مستخدم نهائياً!*

👤 المستخدم: ID: ${userId}
📊 عدد الإجراءات: ${validActions.length} في الدقيقة
⚠️ السبب: تكرار الإغراق بعد 3 تحذيرات
🔒 الحظر: دائم
                `, { parse_mode: 'Markdown' });
                
                return { blocked: true, reason: '⛔ تم حظر حسابك نهائياً بسبب انتهاك متكرر للقواعد' };
            }
            
            // حظر مؤقت
            bannedUsers.set(userId, { expires: now + RATE_LIMIT.TEMP_BAN_DURATION, count: banCount });
            
            bot.telegram.sendMessage(RATE_LIMIT.ADMIN_ID, `
⚠️ *تم حظر مستخدم مؤقتاً!*

👤 المستخدم: ID: ${userId}
📊 عدد الإجراءات: ${validActions.length} في الدقيقة
⏰ مدة الحظر: 10 دقائق
⚠️ عدد الحظائر: ${banCount}/${RATE_LIMIT.PERMANENT_BAN_THRESHOLD}
            `, { parse_mode: 'Markdown' });
            
            return { blocked: true, reason: `⚠️ تم حظرك مؤقتاً لمدة 10 دقائق بسبب الإغراق (${validActions.length} إجراء في الدقيقة)` };
        }
        
        return { blocked: true, reason: `⚠️ تحذير! أنت تقوم بإجراءات كثيرة جداً (${validActions.length}/${limit}). بعد ${RATE_LIMIT.MAX_WARNINGS - warnings} تحذيرات سيتم حظرك` };
    }
    
    return { blocked: false };
}

// Middleware لمنع الإغراق للإجراءات
async function rateLimitMiddleware(ctx, next) {
    const userId = ctx.from.id;
    
    if (userId === RATE_LIMIT.ADMIN_ID) {
        return await next();
    }
    
    if (isBanned(userId)) {
        const banData = bannedUsers.get(userId);
        if (banData?.permanent) {
            await ctx.answerCbQuery('⛔ تم حظر حسابك نهائياً بسبب الانتهاك المتكرر');
        } else {
            const remaining = Math.ceil((banData.expires - Date.now()) / 1000 / 60);
            await ctx.answerCbQuery(`⛔ تم حظرك مؤقتاً لمدة ${remaining} دقيقة بسبب الإغراق`);
        }
        return;
    }
    
    const now = Date.now();
    const lastAction = userLastAction.get(userId) || 0;
    
    if (now - lastAction < RATE_LIMIT.ACTION_DELAY) {
        const remaining = Math.ceil((RATE_LIMIT.ACTION_DELAY - (now - lastAction)) / 1000);
        await ctx.answerCbQuery(`⚠️ يرجى الانتظار ${remaining} ثانية قبل تنفيذ إجراء آخر`);
        return;
    }
    
    const trackResult = trackAction(userId, 'action');
    if (trackResult.blocked) {
        await ctx.answerCbQuery(trackResult.reason);
        return;
    }
    
    userLastAction.set(userId, now);
    await next();
}

// Middleware للرسائل
async function messageRateLimitMiddleware(ctx, next) {
    const userId = ctx.from.id;
    
    if (userId === RATE_LIMIT.ADMIN_ID) {
        return await next();
    }
    
    if (isBanned(userId)) {
        const banData = bannedUsers.get(userId);
        if (banData?.permanent) {
            await ctx.reply('⛔ تم حظر حسابك نهائياً بسبب الانتهاك المتكرر');
        } else {
            const remaining = Math.ceil((banData.expires - Date.now()) / 1000 / 60);
            await ctx.reply(`⛔ تم حظرك مؤقتاً لمدة ${remaining} دقيقة بسبب الإغراق`);
        }
        return;
    }
    
    const now = Date.now();
    const lastMessage = userLastMessage.get(userId) || 0;
    
    if (now - lastMessage < RATE_LIMIT.MESSAGE_DELAY) {
        // لا نرد على الرسائل السريعة
        return;
    }
    
    const trackResult = trackAction(userId, 'message');
    if (trackResult.blocked) {
        await ctx.reply(trackResult.reason);
        return;
    }
    
    userLastMessage.set(userId, now);
    await next();
}

// ========== تكوين البوت ==========

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
    [Markup.button.callback('🚫 مستخدمين محظورين', 'banned_users')],
    [Markup.button.callback('🔓 رفع الحظر عن الكل', 'unban_all')],
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
});

// ========== جميع الإجراءات مع تطبيق الحماية ==========

// تعدين
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

// قائمة المتصدرين المحسنة
bot.action('leaderboard', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    
    try {
        const leaders = await db.getLeaderboard(15);
        const stats = await db.getGlobalStats();
        
        if (!leaders || leaders.length === 0) {
            await ctx.editMessageText('🏆 لا يوجد متصدرين بعد! ابدأ التعدين الآن 🚀', {
                ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
            });
            return;
        }
        
        let leaderboardText = '🏆 *قائمة المتصدرين* 🏆\n';
        leaderboardText += `👥 *إجمالي المستخدمين:* ${stats.users || 0}\n`;
        leaderboardText += `💎 *إجمالي الكريستال:* ${(stats.totalCrystals || 0).toFixed(2)}\n`;
        leaderboardText += `⛏️ *إجمالي التعدين:* ${(stats.totalMined || 0).toFixed(2)}\n`;
        leaderboardText += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        const maxBalance = leaders[0]?.crystalBalance || 1;
        
        for (let i = 0; i < Math.min(leaders.length, 15); i++) {
            const leader = leaders[i];
            const name = leader.firstName || leader.username || `مستخدم ${leader.userId}`;
            const balance = leader.crystalBalance || 0;
            const level = leader.miningLevel || 1;
            const vipLevel = leader.vipLevel || 0;
            
            let medal = '';
            if (i === 0) medal = '👑 ';
            else if (i === 1) medal = '🥈 ';
            else if (i === 2) medal = '🥉 ';
            else medal = `${i + 1}. `;
            
            const vipIcon = vipLevel > 0 ? ' 👑' : '';
            const percentage = Math.min(100, (balance / maxBalance) * 100);
            const barLength = Math.floor(percentage / 5);
            const progressBar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
            
            leaderboardText += `${medal} *${name}${vipIcon}*\n`;
            leaderboardText += `   💎 ${balance.toFixed(2)} CRYSTAL\n`;
            leaderboardText += `   ⛏️ المستوى ${level}\n`;
            leaderboardText += `   📊 [${progressBar}] ${Math.floor(percentage)}%\n`;
            leaderboardText += `━━━━━━━━━━━━━━━━━━\n`;
        }
        
        leaderboardText += `\n🏆 *المتصدر:* ${leaders[0]?.firstName || leaders[0]?.username || 'لا يوجد'}\n`;
        leaderboardText += `💎 *رصيد المتصدر:* ${leaders[0]?.crystalBalance?.toFixed(2) || 0} CRYSTAL\n`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔄 تحديث', 'leaderboard')],
            [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
        ]);
        
        await ctx.editMessageText(leaderboardText, { parse_mode: 'Markdown', ...keyboard });
        
    } catch (error) {
        console.error('❌ Leaderboard error:', error);
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

// نظام VIP
bot.action('vip_system', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const stats = await db.getUserStats(ctx.from.id);
    const nextExp = (stats.vipLevel + 1) * 1000;
    const progress = Math.min(100, (stats.totalMined / nextExp) * 100);
    
    const text = `
👑 *نظام VIP* 👑

🎖️ *مستواك:* ${stats.vipLevel}
📊 *نقاط الخبرة:* ${stats.totalMined.toFixed(0)}/${nextExp}
📈 *نسبة التقدم:* ${Math.floor(progress)}%

✨ *مزايا VIP:*
• VIP 1: +10% معدل التعدين
• VIP 2: +20% معدل التعدين + مكافآت إحالة مضاعفة
• VIP 3: +30% معدل التعدين + أولوية في P2P
    `;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('⭐ ترقية VIP', 'do_vip_upgrade')],
        [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
    ]);
    
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
});

// تنفيذ ترقية VIP
bot.action('do_vip_upgrade', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const result = await db.upgradeVIP(ctx.from.id);
    
    if (result.success) {
        const text = `👑 *تمت ترقية VIP!*\n\n🎖️ *المستوى الجديد:* ${result.newLevel}\n🎁 *المكافأة:* +${result.bonus} CRYSTAL`;
        await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    } else {
        await ctx.editMessageText(result.message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    }
});

// المهمة اليومية
bot.action('daily_task', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const result = await db.completeDailyTask(ctx.from.id);
    
    if (result.success) {
        const text = `✅ *المهمة اليومية مكتملة!*\n\n🎁 *المكافأة:* +${result.reward} CRYSTAL\n📈 *السلسلة:* ${result.streak} أيام`;
        await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    } else {
        await ctx.editMessageText(result.message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    }
});

// قائمة الترقية
bot.action('upgrade_menu', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const stats = await db.getUserStats(ctx.from.id);
    const upgradeCost = 100 * stats.miningLevel;
    const nextRate = (stats.miningRate + 0.5).toFixed(1);
    
    const text = `
⚡ *ترقية معدل التعدين* ⚡

📊 *مستواك:* ${stats.miningLevel}
⚡ *المعدل الحالي:* ${stats.miningRate}x
📈 *المعدل بعد الترقية:* ${nextRate}x

💰 *تكلفة الترقية:* ${upgradeCost} CRYSTAL
💵 *قيمتها:* ${(upgradeCost * 0.01).toFixed(2)} USDT

📝 *للترقية بالكريستال:* /upgrade
💰 *للترقية بـ USDT:* /upgrade_usdt ${UPGRADE_USDT_PRICE}
    `;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('⚡ ترقية بالكريستال', 'do_upgrade')],
        [Markup.button.callback('💰 ترقية بـ USDT', 'upgrade_usdt_request')],
        [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
    ]);
    
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
});

// تنفيذ الترقية بالكريستال
bot.action('do_upgrade', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const result = await db.upgradeMiningRate(ctx.from.id);
    await ctx.editMessageText(result.message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

// طلب ترقية بـ USDT
bot.action('upgrade_usdt_request', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('📝 الرجاء إدخال المبلغ بالدولار (الحد الأدنى 3 USDT):');
    ctx.session = { state: 'upgrade_usdt_amount' };
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
    
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'p2p_market')]]) });
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
    
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'p2p_market')]]) });
});

// إنشاء عرض P2P
bot.action('p2p_create_offer', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    
    const text = `
📝 *إنشاء عرض P2P*

أرسل العرض بالصيغة التالية:
\`sell 1000 10\` - لبيع 1000 كريستال بـ 10 USDT
\`buy 500 5\` - لشراء 500 كريستال بـ 5 USDT

⚠️ *الحد الأدنى: 5 USDT*
    `;
    
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'p2p_market')]]) });
    ctx.session = { state: 'p2p_create' };
});

// نظام الإحالة
bot.action('referral_system', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const stats = await db.getUserStats(ctx.from.id);
    const referralLink = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
    
    const text = `
👥 *نظام الإحالة* 👥

🎁 *المكافآت:* ادعُ 10 أصدقاء واحصل على 3000 كريستال!

📊 *إحصائياتك:* ${stats.referralsCount}/10 إحالات
📊 *إحالات اليوم:* ${stats.todayReferrals || 0}/10

🔗 *رابط الإحالة:* \`${referralLink}\`
    `;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📤 مشاركة الرابط', 'share_referral')],
        [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
    ]);
    
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
});

// مشاركة رابط الإحالة
bot.action('share_referral', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const referralLink = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
    await ctx.reply(`🔗 *رابط الإحالة:*\n\`${referralLink}\``, { parse_mode: 'Markdown' });
});

// إحصائياتي
bot.action('my_stats', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const stats = await db.getUserStats(ctx.from.id);
    const progress = Math.min(100, (stats.dailyMined / DAILY_LIMIT) * 100);
    
    const text = `
📊 *إحصائياتك* 📊

👤 *${stats.firstName}*
💎 *الرصيد:* ${stats.crystalBalance.toFixed(2)} CRYSTAL
💰 *القيمة:* ${stats.usdtValue.toFixed(2)} USDT
⚡ *معدل التعدين:* ${stats.miningRate}x
📈 *المستوى:* ${stats.miningLevel}
👑 *VIP:* المستوى ${stats.vipLevel}
📅 *تعدين اليوم:* ${stats.dailyMined}/${DAILY_LIMIT}
📊 *نسبة الإنجاز:* ${Math.floor(progress)}%
🔥 *الكومبو:* ${stats.comboCount || 0} يوم
👥 *الإحالات:* ${stats.referralsCount}/10
    `;
    
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

// تغيير اللغة
bot.action('change_language', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🇸🇦 العربية', 'lang_ar')],
        [Markup.button.callback('🇬🇧 English', 'lang_en')],
        [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
    ]);
    await ctx.editMessageText('🌐 *اختر اللغة / Choose Language*', { parse_mode: 'Markdown', ...keyboard });
});

bot.action('lang_ar', rateLimitMiddleware, async (ctx) => {
    await db.setLanguage(ctx.from.id, 'ar');
    await ctx.answerCbQuery('✅ تم تغيير اللغة إلى العربية');
    await ctx.editMessageText('✅ تم تغيير اللغة إلى العربية', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('lang_en', rateLimitMiddleware, async (ctx) => {
    await db.setLanguage(ctx.from.id, 'en');
    await ctx.answerCbQuery('✅ Language changed to English');
    await ctx.editMessageText('✅ Language changed to English', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
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
    
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
});

// عرض المستخدمين المحظورين (للأدمن)
bot.action('banned_users', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        await ctx.answerCbQuery('⛔ هذا الأمر للأدمن فقط!');
        return;
    }
    
    await ctx.answerCbQuery();
    const now = Date.now();
    const activeBans = [];
    
    for (const [userId, banData] of bannedUsers) {
        if (banData.expires > now || banData.permanent) {
            const remaining = banData.permanent ? 'دائم' : `${Math.ceil((banData.expires - now) / 1000 / 60)} دقيقة`;
            activeBans.push({ userId, remaining, count: banData.count });
        }
    }
    
    if (activeBans.length === 0) {
        await ctx.editMessageText('✅ لا يوجد مستخدمين محظورين حالياً', {
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
        });
        return;
    }
    
    let text = '🚫 *المستخدمين المحظورين* 🚫\n\n';
    for (const ban of activeBans) {
        text += `🆔 المستخدم: \`${ban.userId}\`\n`;
        text += `⏰ المتبقي: ${ban.remaining}\n`;
        text += `⚠️ عدد الحظائر: ${ban.count}\n`;
        text += `━━━━━━━━━━━━━━━━━━\n`;
    }
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔓 رفع الحظر عن الكل', 'unban_all')],
        [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
    ]);
    
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
});

// رفع الحظر عن الكل (للأدمن)
bot.action('unban_all', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        await ctx.answerCbQuery('⛔ هذا الأمر للأدمن فقط!');
        return;
    }
    
    bannedUsers.clear();
    userWarningCount.clear();
    userActionCount.clear();
    
    await ctx.answerCbQuery('✅ تم رفع الحظر عن جميع المستخدمين');
    await ctx.editMessageText('✅ تم رفع الحظر عن جميع المستخدمين', {
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
    });
});

// إحصائيات عامة (للأدمن)
bot.action('global_stats', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        await ctx.answerCbQuery('⛔ هذا الأمر للأدمن فقط!');
        return;
    }
    
    await ctx.answerCbQuery();
    const stats = await db.getGlobalStats();
    
    const text = `
📊 *إحصائيات عامة* 📊

👥 *المستخدمين:* ${stats.users}
💎 *إجمالي الكريستال:* ${stats.totalCrystals}
⛏️ *إجمالي التعدين:* ${stats.totalMined}
📈 *متوسط المستوى:* ${stats.avgLevel}
👑 *متوسط VIP:* ${stats.avgVip || 0}

💰 *السيولة:* ${stats.available?.toFixed(2) || 0} CRYSTAL متاحة

🛡️ *الحماية:*
• الإجراءات: 8 في الدقيقة
• تأخير: 2 ثانية
• تحذيرات: 2 = حظر 10 دقائق
• 3 حظائر = حظر دائم
    `;
    
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

// إحصائيات اليوم (للأدمن)
bot.action('today_stats', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        await ctx.answerCbQuery('⛔ هذا الأمر للأدمن فقط!');
        return;
    }
    
    await ctx.answerCbQuery();
    const stats = await db.getTodayStats();
    
    const text = `
📅 *إحصائيات اليوم* 📅
${new Date().toLocaleDateString('ar')}

👥 *مستخدمين جدد:* ${stats?.totalUsers || 0}
⛏️ *تم التعدين:* ${stats?.totalMined?.toFixed(2) || 0} CRYSTAL
💰 *عمليات شراء:* ${stats?.totalPurchases || 0}
⚡ *عمليات ترقية:* ${stats?.totalUpgrades || 0}
🔄 *صفقات P2P:* ${stats?.p2pTrades || 0}
👥 *إحالات اليوم:* ${stats?.totalReferrals || 0}
    `;
    
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

// بحث عن مستخدم (للأدمن)
bot.action('search_user', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        await ctx.answerCbQuery('⛔ هذا الأمر للأدمن فقط!');
        return;
    }
    
    await ctx.answerCbQuery();
    await ctx.reply('🔍 الرجاء إرسال اسم المستخدم أو المعرف للبحث:');
    ctx.session = { state: 'search_user' };
});

// العودة للقائمة الرئيسية
bot.action('back_to_menu', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const stats = await db.getUserStats(ctx.from.id);
    const progress = Math.min(100, (stats.dailyMined / DAILY_LIMIT) * 100);
    
    const text = `
✨ *قائمة CRYSTAL الرئيسية* ✨

👤 *${ctx.from.first_name}*
💎 *الرصيد:* ${stats.crystalBalance.toFixed(2)} CRYSTAL
💰 *القيمة:* ${stats.usdtValue.toFixed(2)} USDT
⚡ *معدل التعدين:* ${stats.miningRate}x
👑 *VIP:* المستوى ${stats.vipLevel || 0}
📊 *تعدين اليوم:* ${stats.dailyMined}/${DAILY_LIMIT}
📈 *نسبة الإنجاز:* ${Math.floor(progress)}%
    `;
    
    const keyboard = ctx.from.id === ADMIN_ID ? adminKeyboard : mainKeyboard;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
});

// ========== معالجة الرسائل النصية ==========
bot.on('text', messageRateLimitMiddleware, async (ctx) => {
    // معالجة إنشاء عرض P2P
    if (ctx.session?.state === 'p2p_create') {
        const parts = ctx.message.text.split(' ');
        if (parts.length !== 3) {
            await ctx.reply('❌ الصيغة: [sell/buy] [الكمية] [السعر]\nمثال: sell 1000 10');
            delete ctx.session.state;
            return;
        }
        
        const [type, amount, usdt] = parts;
        const crystalAmount = parseFloat(amount);
        const usdtAmount = parseFloat(usdt);
        
        if (isNaN(crystalAmount) || isNaN(usdtAmount) || usdtAmount < 5) {
            await ctx.reply('❌ البيانات غير صحيحة! الحد الأدنى 5 USDT');
            delete ctx.session.state;
            return;
        }
        
        const result = await db.createP2pOffer(ctx.from.id, type, crystalAmount, usdtAmount);
        await ctx.reply(result.message, { parse_mode: 'Markdown' });
        delete ctx.session.state;
    } 
    // معالجة طلب ترقية بـ USDT
    else if (ctx.session?.state === 'upgrade_usdt_amount') {
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

👤 المستخدم: ${ctx.from.first_name}
🆔 المعرف: ${ctx.from.id}
📊 المستوى الحالي: ${result.current_level}
📈 المستوى المطلوب: ${result.requested_level}
💰 المبلغ: ${result.usdt_amount} USDT
📋 رقم الطلب: \`${result.request_id}\`
            `, { parse_mode: 'Markdown' });
        } else {
            await ctx.reply(`❌ ${result.message}`);
        }
        
        delete ctx.session.state;
    }
    // معالجة البحث (للأدمن)
    else if (ctx.session?.state === 'search_user' && ctx.from.id === ADMIN_ID) {
        const query = ctx.message.text;
        const users = await db.searchUsers(query);
        
        if (users.length === 0) {
            await ctx.reply('❌ لم يتم العثور على مستخدمين');
        } else {
            let text = '🔍 *نتائج البحث:*\n\n';
            for (const user of users) {
                text += `👤 ${user.firstName || user.username || user.userId}\n`;
                text += `🆔 \`${user.userId}\`\n`;
                text += `💎 ${user.crystalBalance.toFixed(2)} CRYSTAL\n`;
                text += `📈 المستوى ${user.miningLevel}\n`;
                text += `━━━━━━━━━━━━━━━━━━\n`;
            }
            await ctx.reply(text, { parse_mode: 'Markdown' });
        }
        
        delete ctx.session.state;
    }
});

// ========== الأوامر النصية ==========

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
        await ctx.reply('❌ المبلغ غير صحيح! الحد الأدنى 3 USDT');
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

👤 المستخدم: ${ctx.from.first_name}
🆔 المعرف: ${ctx.from.id}
💰 المبلغ: ${result.usdt_amount} USDT
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
    
    const result = await db.confirmUpgrade(args[1], args[2], ctx.from.id);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
    if (result.user_id) {
        await bot.telegram.sendMessage(result.user_id, result.message, { parse_mode: 'Markdown' });
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

👤 المستخدم: ${ctx.from.first_name}
🆔 المعرف: ${ctx.from.id}
💎 الكمية: ${result.crystal_amount} CRYSTAL
💰 المبلغ: ${result.usdt_amount} USDT
        `, { parse_mode: 'Markdown' });
    } else {
        await ctx.reply(`❌ ${result.message}`);
    }
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
    
    const result = await db.confirmPurchase(args[1], args[2], ctx.from.id);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

// زر نسخ عنوان TRON
bot.action(/copy_address_(.+)/, async (ctx) => {
    const address = ctx.match[1];
    await ctx.answerCbQuery('✅ تم نسخ العنوان!');
    await ctx.reply(`📋 *العنوان المنسوخ:*\n\`${address}\``, { parse_mode: 'Markdown' });
});

// أمر شراء عرض P2P
bot.command('buy_offer', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) {
        await ctx.reply('❌ الصيغة: /buy_offer [رقم العرض]');
        return;
    }
    
    const result = await db.startP2pTrade(args[1], ctx.from.id);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
    if (result.success) {
        await ctx.reply(`📤 *أرسل المبلغ إلى:*\n\`${TRON_ADDRESS}\`\n\n📎 *بعد الإرسال:* /send_proof ${args[1]} [رابط الصورة]`, { parse_mode: 'Markdown' });
    }
});

// أمر بيع عرض P2P
bot.command('sell_offer', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) {
        await ctx.reply('❌ الصيغة: /sell_offer [رقم العرض]');
        return;
    }
    
    const result = await db.startP2pTrade(args[1], ctx.from.id);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
    if (result.success) {
        await ctx.reply(`📤 *أرسل المبلغ إلى:*\n\`${TRON_ADDRESS}\`\n\n📎 *بعد الإرسال:* /send_proof ${args[1]} [رابط الصورة]`, { parse_mode: 'Markdown' });
    }
});

// أمر إرسال إثبات الدفع
bot.command('send_proof', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length !== 3) {
        await ctx.reply('❌ الصيغة: /send_proof [رقم العرض] [رابط الصورة]');
        return;
    }
    
    const result = await db.sendPaymentProof(args[1], ctx.from.id, args[2]);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
    
    if (result.success && result.sellerId) {
        await bot.telegram.sendMessage(result.sellerId, `
🔔 *تم استلام إثبات الدفع!*

📋 *رقم العرض:* ${args[1]}
🖼️ *رابط الإثبات:* ${args[2]}

✅ *لتأكيد الاستلام وإطلاق العملة:* /release_crystals ${args[1]}
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
    
    const result = await db.releaseCrystals(args[1], ctx.from.id);
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
    
    const result = await db.openDispute(args[1], ctx.from.id);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
    await bot.telegram.sendMessage(ADMIN_ID, `
⚠️ *نزاع جديد!*

👤 المستخدم: ${ctx.from.first_name}
🆔 المعرف: ${ctx.from.id}
📋 رقم العرض: ${args[1]}
    `, { parse_mode: 'Markdown' });
});

// أمر تعدين مباشر
bot.command('mine', async (ctx) => {
    const result = await db.mine(ctx.from.id);
    
    if (result.success) {
        const stats = await db.getUserStats(ctx.from.id);
        await ctx.reply(`
🎉 *تم التعدين!*
⛏️ +${result.reward} CRYSTAL
💎 الرصيد: ${stats.crystalBalance.toFixed(2)}
📊 المتبقي: ${DAILY_LIMIT - stats.dailyMined}/${DAILY_LIMIT}
        `, { parse_mode: 'Markdown' });
    } else {
        await ctx.reply(result.message, { parse_mode: 'Markdown' });
    }
});

// أمر إحصائيات
bot.command('stats', async (ctx) => {
    const stats = await db.getUserStats(ctx.from.id);
    await ctx.reply(`
📊 *إحصائياتك*
💎 الرصيد: ${stats.crystalBalance.toFixed(2)}
💰 القيمة: ${stats.usdtValue.toFixed(2)} USDT
⚡ معدل التعدين: ${stats.miningRate}x
📈 المستوى: ${stats.miningLevel}
👑 VIP: المستوى ${stats.vipLevel}
📅 تعدين اليوم: ${stats.dailyMined}/${DAILY_LIMIT}
👥 الإحالات: ${stats.referralsCount}
    `, { parse_mode: 'Markdown' });
});

// أمر المتصدرين
bot.command('top', async (ctx) => {
    const leaders = await db.getLeaderboard(10);
    
    if (!leaders || leaders.length === 0) {
        await ctx.reply('🏆 لا يوجد متصدرين بعد!');
        return;
    }
    
    let text = '🏆 *قائمة المتصدرين* 🏆\n\n';
    for (let i = 0; i < leaders.length; i++) {
        const leader = leaders[i];
        const name = leader.firstName || leader.username || `مستخدم ${leader.userId}`;
        const medal = i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        text += `${medal} *${name}*\n   💎 ${leader.crystalBalance.toFixed(2)} CRYSTAL\n\n`;
    }
    
    await ctx.reply(text, { parse_mode: 'Markdown' });
});

// طلبات الترقية المعلقة (للأدمن)
bot.action('pending_upgrades', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        await ctx.answerCbQuery('⛔ هذا الأمر للأدمن فقط!');
        return;
    }
    
    const pending = await db.getPendingUpgrades();
    
    if (!pending || pending.length === 0) {
        await ctx.editMessageText('📭 لا توجد طلبات ترقية معلقة', {
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
        });
        return;
    }
    
    let text = '📋 *طلبات الترقية المعلقة*\n\n';
    for (const req of pending) {
        text += `🆔 \`${req._id}\` | 👤 ${req.firstName || req.username}\n`;
        text += `📊 ${req.currentLevel} → ${req.requestedLevel} | 💰 ${req.usdtAmount} USDT\n`;
        text += `━━━━━━━━━━━━━━━━━━\n`;
    }
    
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

// طلبات الشراء المعلقة (للأدمن)
bot.action('pending_purchases', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        await ctx.answerCbQuery('⛔ هذا الأمر للأدمن فقط!');
        return;
    }
    
    const pending = await db.getPendingPurchases();
    
    if (!pending || pending.length === 0) {
        await ctx.editMessageText('📭 لا توجد طلبات شراء معلقة', {
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
        });
        return;
    }
    
    let text = '💰 *طلبات الشراء المعلقة*\n\n';
    for (const req of pending) {
        text += `🆔 \`${req._id}\` | 👤 ${req.firstName || req.username}\n`;
        text += `💎 ${req.crystalAmount} CRYSTAL | 💰 ${req.usdtAmount} USDT\n`;
        text += `━━━━━━━━━━━━━━━━━━\n`;
    }
    
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

// النزاعات المعلقة (للأدمن)
bot.action('pending_disputes', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        await ctx.answerCbQuery('⛔ هذا الأمر للأدمن فقط!');
        return;
    }
    
    const disputes = await db.getP2pOffers();
    const pendingDisputes = disputes.filter(d => d.status === 'disputed');
    
    if (pendingDisputes.length === 0) {
        await ctx.editMessageText('📭 لا توجد نزاعات معلقة', {
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
        });
        return;
    }
    
    let text = '⚠️ *النزاعات المعلقة*\n\n';
    for (const dispute of pendingDisputes) {
        text += `🆔 \`${dispute._id}\`\n`;
        text += `👤 البائع: ${dispute.firstName || dispute.username}\n`;
        text += `💎 ${dispute.crystalAmount} CRYSTAL | 💰 ${dispute.usdtAmount} USDT\n`;
        text += `━━━━━━━━━━━━━━━━━━\n`;
    }
    
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

// تشغيل البوت
bot.launch().then(() => {
    console.log('🚀 Bot is running...');
    console.log('👑 Admin ID:', ADMIN_ID);
    console.log('🛡️ Anti-Spam Protection:');
    console.log('   - Actions: 2s delay, max 8 per minute');
    console.log('   - Messages: 1.5s delay, max 5 per minute');
    console.log('   - 2 warnings = 10 min ban');
    console.log('   - 3 bans = permanent ban');
}).catch((err) => {
    console.error('Error starting bot:', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
