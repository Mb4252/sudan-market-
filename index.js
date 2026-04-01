require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const db = require('./database');
const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');

// ========== إعداد خادم الويب ==========
const app = express();
const PORT = process.env.PORT || 10000;

const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { success: false, message: '⚠️ الكثير من الطلبات، يرجى الانتظار قليلاً' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.body?.user_id === parseInt(process.env.ADMIN_ID)
});

app.use(limiter);
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'mining-app')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'mining-app', 'index.html')));
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ========== API Routes ==========
app.get('/api/global_stats', async (req, res) => {
    try { res.json(await db.getGlobalStats()); } catch (e) { res.json({ users: 0, totalCrystals: 0, totalMined: 0 }); }
});

app.get('/api/user/:userId', async (req, res) => {
    try {
        const user = await db.getUser(parseInt(req.params.userId));
        if (user) {
            res.json({
                balance: user.crystalBalance, miningRate: user.miningRate, miningLevel: user.miningLevel,
                totalMined: user.totalMined, lastMiningTime: user.lastMiningTime, dailyMined: user.dailyMined,
                lastMiningDate: user.lastMiningDate, vipLevel: user.vipLevel || 0, comboCount: user.comboCount || 0,
                dailyTasks: user.dailyTasks || { streak: 0 }, twitterTaskCompleted: user.twitterTaskCompleted || false
            });
        } else res.json({ balance: 0, miningRate: 1, miningLevel: 1, totalMined: 0, vipLevel: 0, comboCount: 0, twitterTaskCompleted: false });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/mine', async (req, res) => {
    try { res.json(await db.mine(parseInt(req.body.user_id))); } catch (e) { res.json({ success: false, message: e.message }); }
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        const leaders = await db.getLeaderboard(15);
        res.json(leaders.map(l => ({ name: l.firstName || l.username || `مستخدم ${l.userId}`, balance: l.crystalBalance || 0, level: l.miningLevel || 1, vipLevel: l.vipLevel || 0 })));
    } catch (e) { res.json([]); }
});

app.get('/api/liquidity', async (req, res) => {
    try {
        const l = await db.getLiquidity();
        res.json({ total_liquidity: l?.totalLiquidity || 1000000, total_sold: l?.totalSold || 0, available: (l?.totalLiquidity || 1000000) - (l?.totalSold || 0) });
    } catch (e) { res.json({ total_liquidity: 1000000, total_sold: 0, available: 1000000 }); }
});

app.post('/api/purchase', async (req, res) => {
    try { res.json(await db.requestPurchase(parseInt(req.body.user_id), parseFloat(req.body.amount))); } catch (e) { res.json({ success: false, message: e.message }); }
});

app.post('/api/upgrade', async (req, res) => {
    try { res.json(await db.upgradeMiningRate(parseInt(req.body.user_id))); } catch (e) { res.json({ success: false, message: e.message }); }
});

app.post('/api/register', async (req, res) => {
    try { await db.registerUser(parseInt(req.body.user_id), req.body.username, req.body.first_name, null, req.body.language || 'ar'); res.json({ success: true }); } catch (e) { res.json({ success: true }); }
});

app.post('/api/set_language', async (req, res) => {
    try { await db.setLanguage(parseInt(req.body.user_id), req.body.language); res.json({ success: true }); } catch (e) { res.json({ success: false }); }
});

app.get('/api/user/daily/:userId', async (req, res) => {
    try {
        const s = await db.getUserStats(parseInt(req.params.userId));
        res.json({ daily_mined: s?.dailyMined || 0, daily_limit: 70, remaining: 70 - (s?.dailyMined || 0), progress: Math.min(100, ((s?.dailyMined || 0) / 70) * 100) });
    } catch (e) { res.json({ daily_mined: 0, daily_limit: 70, remaining: 70, progress: 0 }); }
});

app.post('/api/daily_task', async (req, res) => {
    try { res.json(await db.completeDailyTask(parseInt(req.body.user_id))); } catch (e) { res.json({ success: false, message: e.message }); }
});

app.post('/api/upgrade_vip', async (req, res) => {
    try { res.json(await db.upgradeVIP(parseInt(req.body.user_id))); } catch (e) { res.json({ success: false, message: e.message }); }
});

app.post('/api/complete_twitter_task', async (req, res) => {
    try { res.json(await db.completeTwitterTask(parseInt(req.body.user_id))); } catch (e) { res.json({ success: false, message: e.message }); }
});

app.get('/api/user/stats/:userId', async (req, res) => {
    try { res.json(await db.getUserStats(parseInt(req.params.userId))); } catch (e) { res.json(null); }
});

app.get('/api/p2p/offers', async (req, res) => {
    try { res.json(await db.getP2pOffers(req.query.type)); } catch (e) { res.json([]); }
});

app.post('/api/p2p/create', async (req, res) => {
    try { res.json(await db.createP2pOffer(parseInt(req.body.user_id), req.body.type, parseFloat(req.body.amount), parseFloat(req.body.usdt))); } catch (e) { res.json({ success: false, message: e.message }); }
});

app.post('/api/p2p/start', async (req, res) => {
    try { res.json(await db.startP2pTrade(req.body.offer_id, parseInt(req.body.user_id))); } catch (e) { res.json({ success: false, message: e.message }); }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Web server on port ${PORT}`));

// ========== إعداد بوت التلجرام ==========
(async () => { try { await db.connect(); console.log('✅ Database connected'); } catch (e) { console.error('❌ DB connection failed:', e); process.exit(1); } })();

const bot = new Telegraf(process.env.BOT_TOKEN, { handlerTimeout: 90000 });

// ========== نظام منع الإغراق ==========
const userLastAction = new Map(), userLastMessage = new Map(), userActionCount = new Map(), userWarningCount = new Map(), bannedUsers = new Map();
const RATE_LIMIT = {
    ACTION_DELAY: 2000, MESSAGE_DELAY: 1500, MAX_ACTIONS_PER_MINUTE: 8, MAX_MESSAGES_PER_MINUTE: 5,
    MAX_WARNINGS: 2, TEMP_BAN_DURATION: 600000, PERMANENT_BAN_THRESHOLD: 3, ADMIN_ID: 6701743450
};

function isBanned(userId) {
    const ban = bannedUsers.get(userId);
    if (!ban) return false;
    if (ban.expires > Date.now()) return true;
    bannedUsers.delete(userId);
    userWarningCount.delete(userId);
    return false;
}

function trackAction(userId, type = 'action') {
    const now = Date.now();
    const limit = type === 'action' ? RATE_LIMIT.MAX_ACTIONS_PER_MINUTE : RATE_LIMIT.MAX_MESSAGES_PER_MINUTE;
    const actions = (userActionCount.get(userId) || []).filter(t => now - t < 60000);
    actions.push(now);
    userActionCount.set(userId, actions);
    
    if (actions.length > limit) {
        const warnings = (userWarningCount.get(userId) || 0) + 1;
        userWarningCount.set(userId, warnings);
        if (warnings >= RATE_LIMIT.MAX_WARNINGS) {
            const banCount = (bannedUsers.get(userId)?.count || 0) + 1;
            if (banCount >= RATE_LIMIT.PERMANENT_BAN_THRESHOLD) {
                bannedUsers.set(userId, { expires: Infinity, count: banCount, permanent: true });
                return { blocked: true, reason: '⛔ تم حظر حسابك نهائياً' };
            }
            bannedUsers.set(userId, { expires: now + RATE_LIMIT.TEMP_BAN_DURATION, count: banCount });
            return { blocked: true, reason: `⚠️ تم حظرك مؤقتاً 10 دقائق` };
        }
        return { blocked: true, reason: `⚠️ تحذير! ${actions.length}/${limit} إجراء` };
    }
    return { blocked: false };
}

async function rateLimitMiddleware(ctx, next) {
    if (ctx.from.id === RATE_LIMIT.ADMIN_ID) return next();
    if (isBanned(ctx.from.id)) { await ctx.answerCbQuery('⛔ محظور مؤقتاً'); return; }
    const now = Date.now();
    if (now - (userLastAction.get(ctx.from.id) || 0) < RATE_LIMIT.ACTION_DELAY) {
        await ctx.answerCbQuery(`⚠️ انتظر ${Math.ceil((RATE_LIMIT.ACTION_DELAY - (now - (userLastAction.get(ctx.from.id) || 0))) / 1000)} ثانية`);
        return;
    }
    const track = trackAction(ctx.from.id, 'action');
    if (track.blocked) { await ctx.answerCbQuery(track.reason); return; }
    userLastAction.set(ctx.from.id, now);
    await next();
}

async function messageRateLimitMiddleware(ctx, next) {
    if (ctx.from.id === RATE_LIMIT.ADMIN_ID) return next();
    if (isBanned(ctx.from.id)) { await ctx.reply('⛔ محظور مؤقتاً'); return; }
    const now = Date.now();
    if (now - (userLastMessage.get(ctx.from.id) || 0) < RATE_LIMIT.MESSAGE_DELAY) return;
    const track = trackAction(ctx.from.id, 'message');
    if (track.blocked) { await ctx.reply(track.reason); return; }
    userLastMessage.set(ctx.from.id, now);
    await next();
}

const WEBAPP_URL = process.env.WEBAPP_URL;
const ADMIN_ID = 6701743450, ADMIN_USERNAME = 'hmood19931130', UPGRADE_USDT_PRICE = 3, CRYSTAL_PRICE = 0.01, DAILY_LIMIT = 70, TRON_ADDRESS = process.env.TRON_ADDRESS, TWITTER_URL = process.env.TWITTER_URL || 'https://x.com/AlmBd37526';

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
    [Markup.button.callback('🐦 متابعة تويتر', 'twitter_task')],
    [Markup.button.callback('👑 نظام VIP', 'vip_system')],
    [Markup.button.callback('🌐 اللغة', 'change_language')],
    [Markup.button.callback('📞 الدعم', 'support')],
    [Markup.button.callback('📈 إحصائياتي', 'my_stats')]
]);

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

bot.start(async (ctx) => {
    const user = ctx.from;
    const referrer = ctx.startPayload ? parseInt(ctx.startPayload) : null;
    await db.registerUser(user.id, user.username, user.first_name, referrer, 'ar');
    const s = await db.getUserStats(user.id);
    const link = `https://t.me/${ctx.botInfo.username}?start=${user.id}`;
    await ctx.reply(db.getText('welcome', s.language, { name: user.first_name, balance: s.crystalBalance, rate: s.miningRate, level: s.miningLevel, daily: s.dailyMined, limit: DAILY_LIMIT }), { parse_mode: 'Markdown', ...mainKeyboard });
    await ctx.reply(`🔗 *رابط الإحالة:*\n\`${link}\``, { parse_mode: 'Markdown' });
});

bot.action('mine_action', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const r = await db.mine(ctx.from.id);
    await ctx.editMessageText(r.message || (r.success ? `✅ +${r.reward} CRYSTAL\n📊 ${r.dailyMined}/${DAILY_LIMIT}` : r.message), { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('leaderboard', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const leaders = await db.getLeaderboard(15);
    const stats = await db.getGlobalStats();
    if (!leaders.length) return ctx.editMessageText('🏆 لا يوجد متصدرين', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    let text = `🏆 *قائمة المتصدرين* 🏆\n👥 *المستخدمين:* ${stats.users}\n💎 *الإجمالي:* ${stats.totalCrystals}\n━━━━━━━━━━━━━━━━━━\n\n`;
    const max = leaders[0].crystalBalance;
    for (let i = 0; i < leaders.length; i++) {
        const l = leaders[i];
        const name = l.firstName || l.username || `مستخدم ${l.userId}`;
        const medal = i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
        const bar = '█'.repeat(Math.floor((l.crystalBalance / max) * 20)) + '░'.repeat(20 - Math.floor((l.crystalBalance / max) * 20));
        text += `${medal} *${name}${l.vipLevel > 0 ? ' 👑' : ''}*\n   💎 ${l.crystalBalance.toFixed(2)} CRYSTAL\n   📊 [${bar}] ${Math.floor((l.crystalBalance / max) * 100)}%\n━━━━━━━━━━━━━━━━━━\n`;
    }
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔄 تحديث', 'leaderboard'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('show_usdt', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const s = await db.getUserStats(ctx.from.id);
    await ctx.editMessageText(db.getText('usdtValue', s.language, { crystals: s.crystalBalance, usdt: s.usdtValue }), { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('vip_system', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const s = await db.getUserStats(ctx.from.id);
    const next = (s.vipLevel + 1) * 1000;
    const prog = Math.min(100, (s.totalMined / next) * 100);
    await ctx.editMessageText(`👑 *نظام VIP*\n🎖️ مستواك: ${s.vipLevel}\n📊 الخبرة: ${s.totalMined.toFixed(0)}/${next}\n📈 التقدم: ${Math.floor(prog)}%\n✨ VIP 1: +10% | VIP 2: +20% | VIP 3: +30%`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('⭐ ترقية VIP', 'do_vip_upgrade'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('do_vip_upgrade', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const r = await db.upgradeVIP(ctx.from.id);
    await ctx.editMessageText(r.message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('daily_task', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const r = await db.completeDailyTask(ctx.from.id);
    await ctx.editMessageText(r.message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('twitter_task', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const s = await db.getUserStats(ctx.from.id);
    if (s.twitterTaskCompleted) {
        return ctx.editMessageText('✅ لقد أكملت مهمة تويتر بالفعل!', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    }
    await ctx.editMessageText(`🐦 *مهمة متابعة تويتر*\n\n📌 الخطوات:\n1. اضغط على الرابط أدناه\n2. اضغط "متابعة" (Follow)\n3. عد واضغط "تم المتابعة"\n\n🎁 المكافأة: 15 كريستال\n\n🔗 ${TWITTER_URL}`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.url('🔗 الذهاب إلى تويتر', TWITTER_URL)], [Markup.button.callback('✅ تم المتابعة', 'confirm_twitter')], [Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('confirm_twitter', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const r = await db.completeTwitterTask(ctx.from.id);
    const s = await db.getUserStats(ctx.from.id);
    if (r.success) {
        await ctx.editMessageText(`✅ *تم إكمال المهمة!*\n🎁 +15 CRYSTAL\n💎 رصيدك: ${s.crystalBalance.toFixed(2)} CRYSTAL\n🐦 شكراً لمتابعتنا!`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    } else {
        await ctx.editMessageText(r.message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    }
});

bot.action('upgrade_menu', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const s = await db.getUserStats(ctx.from.id);
    const cost = 100 * s.miningLevel;
    await ctx.editMessageText(`⚡ *ترقية معدل التعدين*\n📊 مستواك: ${s.miningLevel}\n⚡ المعدل: ${s.miningRate}x\n📈 بعد الترقية: ${(s.miningRate+0.5).toFixed(1)}x\n💰 التكلفة: ${cost} CRYSTAL (${(cost*0.01).toFixed(2)} USDT)\n\n/upgrade - ترقية بالكريستال\n/upgrade_usdt ${UPGRADE_USDT_PRICE} - ترقية بـ USDT`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('⚡ ترقية بالكريستال', 'do_upgrade'), Markup.button.callback('💰 ترقية بـ USDT', 'upgrade_usdt_request'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('do_upgrade', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const r = await db.upgradeMiningRate(ctx.from.id);
    await ctx.editMessageText(r.message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('upgrade_usdt_request', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('📝 أدخل المبلغ (الحد الأدنى 3 USDT):');
    ctx.session = { state: 'upgrade_usdt_amount' };
});

bot.action('p2p_market', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const s = await db.getUserStats(ctx.from.id);
    await ctx.editMessageText(db.getText('p2pMarket', s.language, { balance: s.crystalBalance, usdt: s.usdtValue }), { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🟢 عروض البيع', 'p2p_buy_offers'), Markup.button.callback('🔴 عروض الشراء', 'p2p_sell_offers')], [Markup.button.callback('➕ إنشاء عرض', 'p2p_create_offer'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('p2p_buy_offers', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const offers = await db.getP2pOffers('sell');
    if (!offers.length) return ctx.editMessageText('📭 لا توجد عروض بيع', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'p2p_market')]]) });
    let text = '🟢 *عروض البيع*\n\n';
    offers.forEach(o => { text += `👤 ${o.firstName || o.username}\n💎 ${o.crystalAmount} CRYSTAL\n💰 ${o.usdtAmount} USDT\n🆔 \`${o._id}\`\n━━━━━━━━━━━━━━━━━━\n`; });
    text += `\n📝 /buy_offer [رقم العرض]`;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'p2p_market')]]) });
});

bot.action('p2p_sell_offers', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const offers = await db.getP2pOffers('buy');
    if (!offers.length) return ctx.editMessageText('📭 لا توجد عروض شراء', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'p2p_market')]]) });
    let text = '🔴 *عروض الشراء*\n\n';
    offers.forEach(o => { text += `👤 ${o.firstName || o.username}\n💎 ${o.crystalAmount} CRYSTAL\n💰 ${o.usdtAmount} USDT\n🆔 \`${o._id}\`\n━━━━━━━━━━━━━━━━━━\n`; });
    text += `\n📝 /sell_offer [رقم العرض]`;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'p2p_market')]]) });
});

bot.action('p2p_create_offer', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(`📝 *إنشاء عرض P2P*\n\nأرسل:\n\`sell 1000 10\` - بيع\n\`buy 500 5\` - شراء\n⚠️ الحد الأدنى 5 USDT`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'p2p_market')]]) });
    ctx.session = { state: 'p2p_create' };
});

bot.action('referral_system', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const s = await db.getUserStats(ctx.from.id);
    const link = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
    await ctx.editMessageText(`👥 *نظام الإحالة*\n🎁 10 إحالات = 3000 كريستال\n📊 إحالاتك: ${s.referralsCount}/10\n📊 اليوم: ${s.todayReferrals || 0}/10\n🔗 \`${link}\``, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('📤 مشاركة', 'share_referral'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('share_referral', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const link = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
    await ctx.reply(`🔗 *رابط الإحالة:*\n\`${link}\``, { parse_mode: 'Markdown' });
});

bot.action('my_stats', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const s = await db.getUserStats(ctx.from.id);
    const prog = Math.min(100, (s.dailyMined / 70) * 100);
    await ctx.editMessageText(`📊 *إحصائياتك*\n👤 ${s.firstName}\n💎 الرصيد: ${s.crystalBalance.toFixed(2)} CRYSTAL\n💰 القيمة: ${s.usdtValue.toFixed(2)} USDT\n⚡ معدل التعدين: ${s.miningRate}x\n📈 المستوى: ${s.miningLevel}\n👑 VIP: ${s.vipLevel}\n📅 اليوم: ${s.dailyMined}/70\n📈 الإنجاز: ${Math.floor(prog)}%\n🔥 الكومبو: ${s.comboCount || 0} يوم\n👥 الإحالات: ${s.referralsCount}/10\n🐦 تويتر: ${s.twitterTaskCompleted ? '✅' : '❌'}`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('change_language', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText('🌐 *اختر اللغة*', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🇸🇦 العربية', 'lang_ar'), Markup.button.callback('🇬🇧 English', 'lang_en')], [Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('lang_ar', rateLimitMiddleware, async (ctx) => {
    await db.setLanguage(ctx.from.id, 'ar');
    await ctx.answerCbQuery('✅ العربية');
    await ctx.editMessageText('✅ تم تغيير اللغة', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('lang_en', rateLimitMiddleware, async (ctx) => {
    await db.setLanguage(ctx.from.id, 'en');
    await ctx.answerCbQuery('✅ English');
    await ctx.editMessageText('✅ Language changed', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('support', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const s = await db.getUserStats(ctx.from.id);
    await ctx.editMessageText(db.getText('support', s.language, { adminUsername: ADMIN_USERNAME, adminId: ADMIN_ID }), { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.url('📨 تواصل', `https://t.me/${ADMIN_USERNAME}`)], [Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('banned_users', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const now = Date.now();
    const bans = [...bannedUsers.entries()].filter(([_, b]) => b.expires > now || b.permanent);
    if (!bans.length) return ctx.editMessageText('✅ لا يوجد محظورين', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    let text = '🚫 *المحظورين*\n\n';
    bans.forEach(([id, b]) => { text += `🆔 \`${id}\`\n⏰ ${b.permanent ? 'دائم' : Math.ceil((b.expires - now)/60000)+' دقيقة'}\n━━━━━━━━━━━━━━━━━━\n`; });
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔓 رفع الكل', 'unban_all'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('unban_all', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ للأدمن فقط');
    bannedUsers.clear(); userWarningCount.clear(); userActionCount.clear();
    await ctx.answerCbQuery('✅ تم رفع الحظر عن الكل');
    await ctx.editMessageText('✅ تم رفع الحظر', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('pending_upgrades', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const p = await db.getPendingUpgrades();
    if (!p.length) return ctx.editMessageText('📭 لا طلبات', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    let text = '📋 *طلبات الترقية*\n\n';
    p.forEach(r => { text += `🆔 \`${r._id}\` | 👤 ${r.firstName || r.username}\n📊 ${r.currentLevel}→${r.requestedLevel} | 💰 ${r.usdtAmount} USDT\n━━━━━━━━━━━━━━━━━━\n`; });
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('pending_purchases', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const p = await db.getPendingPurchases();
    if (!p.length) return ctx.editMessageText('📭 لا طلبات', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    let text = '💰 *طلبات الشراء*\n\n';
    p.forEach(r => { text += `🆔 \`${r._id}\` | 👤 ${r.firstName || r.username}\n💎 ${r.crystalAmount} | 💰 ${r.usdtAmount} USDT\n━━━━━━━━━━━━━━━━━━\n`; });
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('pending_disputes', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const offers = await db.getP2pOffers();
    const disputes = offers.filter(o => o.status === 'disputed');
    if (!disputes.length) return ctx.editMessageText('📭 لا نزاعات', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    let text = '⚠️ *النزاعات*\n\n';
    disputes.forEach(d => { text += `🆔 \`${d._id}\` | 👤 ${d.firstName || d.username}\n💎 ${d.crystalAmount} | 💰 ${d.usdtAmount} USDT\n━━━━━━━━━━━━━━━━━━\n`; });
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('global_stats', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const s = await db.getGlobalStats();
    await ctx.editMessageText(`📊 *إحصائيات عامة*\n👥 مستخدمين: ${s.users}\n💎 إجمالي: ${s.totalCrystals}\n⛏️ تعدين: ${s.totalMined}\n📈 متوسط المستوى: ${s.avgLevel}\n👑 متوسط VIP: ${s.avgVip}\n💰 السيولة: ${s.available?.toFixed(2) || 0} CRYSTAL`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('today_stats', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const s = await db.getTodayStats();
    await ctx.editMessageText(`📅 *إحصائيات اليوم*\n${new Date().toLocaleDateString('ar')}\n👥 مستخدمين جدد: ${s?.totalUsers || 0}\n⛏️ تم التعدين: ${s?.totalMined?.toFixed(2) || 0}\n💰 عمليات شراء: ${s?.totalPurchases || 0}\n⚡ ترقيات: ${s?.totalUpgrades || 0}\n🔄 صفقات P2P: ${s?.p2pTrades || 0}\n👥 إحالات: ${s?.totalReferrals || 0}\n🐦 تويتر: ${s?.twitterTasks || 0}`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('back_to_menu', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const s = await db.getUserStats(ctx.from.id);
    const prog = Math.min(100, (s.dailyMined / 70) * 100);
    const text = `✨ *القائمة الرئيسية*\n👤 ${ctx.from.first_name}\n💎 ${s.crystalBalance.toFixed(2)} CRYSTAL\n💰 ${s.usdtValue.toFixed(2)} USDT\n⚡ ${s.miningRate}x\n👑 VIP ${s.vipLevel}\n📊 ${s.dailyMined}/70 (${Math.floor(prog)}%)\n🔥 ${s.comboCount || 0} يوم`;
    const kb = ctx.from.id === ADMIN_ID ? adminKeyboard : mainKeyboard;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb });
});

// ========== معالجة الرسائل ==========
bot.on('text', messageRateLimitMiddleware, async (ctx) => {
    if (ctx.session?.state === 'p2p_create') {
        const p = ctx.message.text.split(' ');
        if (p.length !== 3) return ctx.reply('❌ الصيغة: [sell/buy] [الكمية] [السعر]\nمثال: sell 1000 10');
        const [t, a, u] = p;
        const amt = parseFloat(a), usd = parseFloat(u);
        if (isNaN(amt) || isNaN(usd) || usd < 5) return ctx.reply('❌ الحد الأدنى 5 USDT');
        const r = await db.createP2pOffer(ctx.from.id, t, amt, usd);
        await ctx.reply(r.message, { parse_mode: 'Markdown' });
        delete ctx.session.state;
    } else if (ctx.session?.state === 'upgrade_usdt_amount') {
        const amt = parseFloat(ctx.message.text);
        if (isNaN(amt) || amt < 3) return ctx.reply('❌ الحد الأدنى 3 USDT');
        const r = await db.requestUpgrade(ctx.from.id, amt);
        if (r.success) {
            await ctx.reply(r.message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('📋 نسخ', `copy_address_${TRON_ADDRESS}`)]]) });
            await bot.telegram.sendMessage(ADMIN_ID, `🔔 طلب ترقية\n👤 ${ctx.from.first_name}\n💰 ${r.usdt_amount} USDT\n🆔 ${r.request_id}`);
        } else await ctx.reply(r.message);
        delete ctx.session.state;
    }
});

bot.action(/copy_address_(.+)/, async (ctx) => {
    await ctx.answerCbQuery('✅ تم النسخ');
    await ctx.reply(`📋 *العنوان:*\n\`${ctx.match[1]}\``, { parse_mode: 'Markdown' });
});

bot.command('upgrade', async (ctx) => {
    const r = await db.upgradeMiningRate(ctx.from.id);
    await ctx.reply(r.message, { parse_mode: 'Markdown' });
});

bot.command('upgrade_usdt', async (ctx) => {
    const a = ctx.message.text.split(' ')[1];
    const amt = a ? parseFloat(a) : UPGRADE_USDT_PRICE;
    if (isNaN(amt) || amt < 3) return ctx.reply('❌ /upgrade_usdt 5');
    const r = await db.requestUpgrade(ctx.from.id, amt);
    if (r.success) {
        await ctx.reply(r.message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('📋 نسخ', `copy_address_${TRON_ADDRESS}`)]]) });
        await bot.telegram.sendMessage(ADMIN_ID, `🔔 طلب ترقية\n👤 ${ctx.from.first_name}\n💰 ${r.usdt_amount} USDT\n🆔 ${r.request_id}`);
    } else await ctx.reply(r.message);
});

bot.command('confirm_upgrade', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const [_, id, hash] = ctx.message.text.split(' ');
    if (!id || !hash) return ctx.reply('❌ /confirm_upgrade [id] [hash]');
    const r = await db.confirmUpgrade(id, hash, ctx.from.id);
    await ctx.reply(r.message, { parse_mode: 'Markdown' });
    if (r.user_id) await bot.telegram.sendMessage(r.user_id, r.message, { parse_mode: 'Markdown' });
});

bot.command('buy', async (ctx) => {
    const a = ctx.message.text.split(' ')[1];
    const amt = parseFloat(a);
    if (isNaN(amt) || amt <= 0) return ctx.reply('❌ /buy 1000');
    const r = await db.requestPurchase(ctx.from.id, amt);
    if (r.success) {
        await ctx.reply(r.message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('📋 نسخ', `copy_address_${r.payment_address}`)]]) });
        await bot.telegram.sendMessage(ADMIN_ID, `🔔 طلب شراء\n👤 ${ctx.from.first_name}\n💎 ${r.crystal_amount}\n💰 ${r.usdt_amount} USDT\n🆔 ${r.request_id}`);
    } else await ctx.reply(r.message);
});

bot.command('confirm_purchase', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const [_, id, hash] = ctx.message.text.split(' ');
    if (!id || !hash) return ctx.reply('❌ /confirm_purchase [id] [hash]');
    const r = await db.confirmPurchase(id, hash, ctx.from.id);
    await ctx.reply(r.message);
});

bot.command('buy_offer', async (ctx) => {
    const id = ctx.message.text.split(' ')[1];
    if (!id) return ctx.reply('❌ /buy_offer [id]');
    const r = await db.startP2pTrade(id, ctx.from.id);
    await ctx.reply(r.message, { parse_mode: 'Markdown' });
    if (r.success) await ctx.reply(`📤 *أرسل إلى:*\n\`${TRON_ADDRESS}\`\n📎 /send_proof ${id} [رابط الصورة]`, { parse_mode: 'Markdown' });
});

bot.command('sell_offer', async (ctx) => {
    const id = ctx.message.text.split(' ')[1];
    if (!id) return ctx.reply('❌ /sell_offer [id]');
    const r = await db.startP2pTrade(id, ctx.from.id);
    await ctx.reply(r.message, { parse_mode: 'Markdown' });
    if (r.success) await ctx.reply(`📤 *أرسل إلى:*\n\`${TRON_ADDRESS}\`\n📎 /send_proof ${id} [رابط الصورة]`, { parse_mode: 'Markdown' });
});

bot.command('send_proof', async (ctx) => {
    const [_, id, url] = ctx.message.text.split(' ');
    if (!id || !url) return ctx.reply('❌ /send_proof [id] [url]');
    const r = await db.sendPaymentProof(id, ctx.from.id, url);
    await ctx.reply(r.message);
    if (r.success && r.sellerId) await bot.telegram.sendMessage(r.sellerId, `🔔 إثبات دفع\n📋 ${id}\n🖼️ ${url}\n/release_crystals ${id}`);
});

bot.command('release_crystals', async (ctx) => {
    const id = ctx.message.text.split(' ')[1];
    if (!id) return ctx.reply('❌ /release_crystals [id]');
    const r = await db.releaseCrystals(id, ctx.from.id);
    await ctx.reply(r.message);
    if (r.success && r.buyerId) await bot.telegram.sendMessage(r.buyerId, r.message);
});

bot.command('dispute', async (ctx) => {
    const id = ctx.message.text.split(' ')[1];
    if (!id) return ctx.reply('❌ /dispute [id]');
    const r = await db.openDispute(id, ctx.from.id);
    await ctx.reply(r.message);
    await bot.telegram.sendMessage(ADMIN_ID, `⚠️ نزاع جديد\n👤 ${ctx.from.first_name}\n📋 ${id}`);
});

bot.command('mine', async (ctx) => {
    const r = await db.mine(ctx.from.id);
    if (r.success) {
        const s = await db.getUserStats(ctx.from.id);
        await ctx.reply(`🎉 +${r.reward} CRYSTAL\n💎 ${s.crystalBalance.toFixed(2)}\n📊 ${s.dailyMined}/70`, { parse_mode: 'Markdown' });
    } else await ctx.reply(r.message);
});

bot.command('stats', async (ctx) => {
    const s = await db.getUserStats(ctx.from.id);
    await ctx.reply(`📊 *إحصائياتك*\n💎 ${s.crystalBalance.toFixed(2)} CRYSTAL\n💰 ${s.usdtValue.toFixed(2)} USDT\n⚡ ${s.miningRate}x\n📈 المستوى ${s.miningLevel}\n👑 VIP ${s.vipLevel}\n📅 ${s.dailyMined}/70\n🔥 ${s.comboCount || 0} يوم\n👥 ${s.referralsCount}/10`, { parse_mode: 'Markdown' });
});

bot.command('top', async (ctx) => {
    const l = await db.getLeaderboard(10);
    if (!l.length) return ctx.reply('🏆 لا متصدرين');
    let t = '🏆 *المتصدرين*\n\n';
    l.forEach((u, i) => { t += `${i===0?'👑':i===1?'🥈':i===2?'🥉':`${i+1}.`} *${u.firstName || u.username || u.userId}*\n   💎 ${u.crystalBalance.toFixed(2)} CRYSTAL\n\n`; });
    await ctx.reply(t, { parse_mode: 'Markdown' });
});

bot.launch().then(() => {
    console.log('🚀 Bot running');
    console.log('🛡️ Anti-Spam: 2s actions, 1.5s messages, 8/min max');
    console.log('🐦 Twitter: https://x.com/AlmBd37526');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
