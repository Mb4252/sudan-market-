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
    max: 60,
    message: { success: false, message: '⚠️ الكثير من الطلبات، يرجى الانتظار قليلاً' },
    skip: (req) => req.body?.user_id === parseInt(process.env.ADMIN_ID)
});

app.use(limiter);
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'mining-app')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'mining-app', 'index.html')));
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ========== API Routes ==========
app.get('/api/global_stats', async (req, res) => res.json(await db.getGlobalStats()));
app.get('/api/user/:userId', async (req, res) => {
    const u = await db.getUser(parseInt(req.params.userId));
    res.json(u || { usdBalance: 0, crystalBalance: 0 });
});
app.post('/api/trade', async (req, res) => res.json(await db.trade(parseInt(req.body.user_id), req.body.type, req.body.currency, parseFloat(req.body.amount))));
app.get('/api/prices', async (req, res) => res.json(await db.getAllPrices()));
app.get('/api/leaderboard', async (req, res) => {
    const l = await db.getLeaderboard(15);
    res.json(l.map(x => ({ name: x.firstName || x.username || `مستخدم ${x.userId}`, balance: x.crystalBalance || 0, usd: x.usdBalance || 0 })));
});
app.get('/api/liquidity', async (req, res) => {
    const l = await db.getLiquidity();
    res.json({ total_supply: l.totalCrystalSupply, circulating: l.circulatingCrystal, price: l.crystalPrice });
});
app.post('/api/register', async (req, res) => {
    await db.registerUser(parseInt(req.body.user_id), req.body.username, req.body.first_name, null, req.body.language || 'ar');
    res.json({ success: true });
});
app.post('/api/set_language', async (req, res) => { await db.setLanguage(parseInt(req.body.user_id), req.body.language); res.json({ success: true }); });
app.get('/api/user/stats/:userId', async (req, res) => res.json(await db.getUserStats(parseInt(req.params.userId))));
app.get('/api/wallet/:userId', async (req, res) => {
    const w = await db.getUserWallet(parseInt(req.params.userId));
    res.json({ addresses: { bnb: w.bnbAddress, polygon: w.polygonAddress, solana: w.solanaAddress, aptos: w.aptosAddress }, usdBalance: w.usdBalance });
});
app.post('/api/deposit', async (req, res) => res.json(await db.requestDeposit(parseInt(req.body.user_id), parseFloat(req.body.amount), req.body.currency, req.body.network)));
app.post('/api/withdraw', async (req, res) => res.json(await db.requestWithdraw(parseInt(req.body.user_id), parseFloat(req.body.amount), req.body.currency, req.body.network, req.body.address)));
app.post('/api/daily_task', async (req, res) => res.json(await db.completeDailyTask(parseInt(req.body.user_id))));
app.post('/api/complete_twitter_task', async (req, res) => res.json(await db.completeTwitterTask(parseInt(req.body.user_id))));
app.get('/api/p2p/offers', async (req, res) => res.json(await db.getP2pOffers(req.query.type, req.query.currency)));
app.post('/api/p2p/create', async (req, res) => res.json(await db.createP2pOffer(parseInt(req.body.user_id), req.body.type, req.body.currency, parseFloat(req.body.fiatAmount), parseFloat(req.body.crystalAmount), req.body.paymentMethod, req.body.bankDetails)));
app.post('/api/p2p/start', async (req, res) => res.json(await db.startP2pTrade(req.body.offer_id, parseInt(req.body.user_id))));
app.post('/api/p2p/confirm', async (req, res) => res.json(await db.confirmP2pTrade(req.body.offer_id, parseInt(req.body.user_id), req.body.proof_image)));

app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Web server on port ${PORT}`));

// ========== إعداد بوت التلجرام ==========
(async () => { try { await db.connect(); console.log('✅ Database connected'); } catch (e) { console.error('❌ DB error:', e); } })();

const bot = new Telegraf(process.env.BOT_TOKEN);
const WEBAPP_URL = process.env.WEBAPP_URL || `https://sdm-security-bot.onrender.com`;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'hmood19931130';
const TWITTER_URL = process.env.TWITTER_URL || 'https://x.com/AlmBd37526';
const COMMISSION_ADDRESSES = {
    bnb: process.env.COMMISSION_ADDRESS_BNB,
    polygon: process.env.COMMISSION_ADDRESS_POLYGON,
    solana: process.env.COMMISSION_ADDRESS_SOLANA,
    aptos: process.env.COMMISSION_ADDRESS_APTOS
};

// ========== نظام منع الإغراق ==========
const userLastAction = new Map(), userLastMessage = new Map(), userActionCount = new Map(), userWarningCount = new Map(), bannedUsers = new Map();
const RATE_LIMIT = {
    ACTION_DELAY: 2000, MESSAGE_DELAY: 1500, MAX_ACTIONS_PER_MINUTE: 8, MAX_MESSAGES_PER_MINUTE: 5,
    MAX_WARNINGS: 2, TEMP_BAN_DURATION: 600000, PERMANENT_BAN_THRESHOLD: 3, ADMIN_ID: ADMIN_ID
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
    if (ctx.from.id === ADMIN_ID) return next();
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
    if (ctx.from.id === ADMIN_ID) return next();
    if (isBanned(ctx.from.id)) { await ctx.reply('⛔ محظور مؤقتاً'); return; }
    const now = Date.now();
    if (now - (userLastMessage.get(ctx.from.id) || 0) < RATE_LIMIT.MESSAGE_DELAY) return;
    const track = trackAction(ctx.from.id, 'message');
    if (track.blocked) { await ctx.reply(track.reason); return; }
    userLastMessage.set(ctx.from.id, now);
    await next();
}

// ========== القوائم ==========
const startKeyboard = Markup.inlineKeyboard([[Markup.button.webApp('🚀 فتح تطبيق التداول', WEBAPP_URL)]]);

const mainKeyboard = Markup.inlineKeyboard([
    [Markup.button.webApp('🚀 فتح تطبيق التداول', WEBAPP_URL)],
    [Markup.button.callback('💰 الرصيد', 'show_balance')],
    [Markup.button.callback('📈 تداول', 'trade_menu')],
    [Markup.button.callback('🏆 المتصدرين', 'leaderboard')],
    [Markup.button.callback('📊 P2P محلي', 'p2p_menu')],
    [Markup.button.callback('💼 محفظتي', 'my_wallet')],
    [Markup.button.callback('📋 مهام', 'tasks_menu')],
    [Markup.button.callback('🌐 اللغة', 'change_language')],
    [Markup.button.callback('📞 الدعم', 'support')],
    [Markup.button.callback('📈 إحصائياتي', 'my_stats')]
]);

const adminKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💰 طلبات السحب', 'pending_withdraws')],
    [Markup.button.callback('📊 صفقات P2P', 'pending_p2p')],
    [Markup.button.callback('📊 إحصائيات عامة', 'global_stats')],
    [Markup.button.callback('📅 إحصائيات اليوم', 'today_stats')],
    [Markup.button.callback('🚫 مستخدمين محظورين', 'banned_users')],
    [Markup.button.callback('🔓 رفع الحظر', 'unban_all')],
    [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
]);

bot.start(async (ctx) => {
    const user = ctx.from;
    const referrer = ctx.startPayload ? parseInt(ctx.startPayload) : null;
    await db.registerUser(user.id, user.username, user.first_name, referrer, 'ar');
    const stats = await db.getUserStats(user.id);
    await ctx.reply(
        `✨ *مرحباً بك في منصة CRYSTAL للتداول!* ✨\n\n` +
        `👤 *المستخدم:* ${user.first_name}\n` +
        `💵 *الرصيد:* ${stats.usdBalance.toFixed(2)} USD\n` +
        `💎 *الكرستال:* ${stats.crystalBalance.toFixed(2)} CRYSTAL\n` +
        `💰 *القيمة:* ${stats.usdtValue.toFixed(2)} USD\n` +
        `📊 *سعر CRYSTAL:* ${stats.crystalPrice.toFixed(6)} USD\n\n` +
        `🚀 *اضغط على الزر أدناه لفتح منصة التداول*`,
        { parse_mode: 'Markdown', ...startKeyboard }
    );
});

// ========== الأزرار ==========
bot.action('show_balance', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const s = await db.getUserStats(ctx.from.id);
    await ctx.editMessageText(
        `💰 *رصيدك*\n\n` +
        `💵 *USD:* ${s.usdBalance.toFixed(2)}\n` +
        `💎 *CRYSTAL:* ${s.crystalBalance.toFixed(2)}\n` +
        `💰 *القيمة الإجمالية:* ${s.usdtValue.toFixed(2)} USD\n` +
        `📊 *سعر CRYSTAL:* ${s.crystalPrice.toFixed(6)} USD`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) }
    );
});

bot.action('trade_menu', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const prices = await db.getAllPrices();
    const s = await db.getUserStats(ctx.from.id);
    await ctx.editMessageText(
        `📈 *سوق التداول*\n\n` +
        `💰 *رصيدك:* ${s.usdBalance.toFixed(2)} USD\n` +
        `💎 *رصيد CRYSTAL:* ${s.crystalBalance.toFixed(2)}\n` +
        `📊 *سعر CRYSTAL:* ${s.crystalPrice.toFixed(6)} USD\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🟠 *BTC:* ${prices.BTC.price.toFixed(2)} USD (${prices.BTC.change24h > 0 ? `+${prices.BTC.change24h.toFixed(2)}%` : `${prices.BTC.change24h.toFixed(2)}%`})\n` +
        `🔵 *ETH:* ${prices.ETH.price.toFixed(2)} USD (${prices.ETH.change24h > 0 ? `+${prices.ETH.change24h.toFixed(2)}%` : `${prices.ETH.change24h.toFixed(2)}%`})\n` +
        `🟢 *SOL:* ${prices.SOL.price.toFixed(2)} USD\n` +
        `🟡 *BNB:* ${prices.BNB.price.toFixed(2)} USD\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +
        `📝 *الأوامر:*\n` +
        `/buy [المبلغ بالدولار] - شراء CRYSTAL\n` +
        `/sell [المبلغ بالدولار] - بيع CRYSTAL\n\n` +
        `💸 *العمولة:* 0.5%`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) }
    );
});

bot.command('buy', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) return ctx.reply('❌ /buy [المبلغ بالدولار]\nمثال: /buy 100');
    const amount = parseFloat(args[1]);
    if (isNaN(amount) || amount <= 0) return ctx.reply('❌ المبلغ غير صحيح');
    const result = await db.trade(ctx.from.id, 'buy', 'CRYSTAL', amount);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

bot.command('sell', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) return ctx.reply('❌ /sell [المبلغ بالدولار]\nمثال: /sell 100');
    const amount = parseFloat(args[1]);
    if (isNaN(amount) || amount <= 0) return ctx.reply('❌ المبلغ غير صحيح');
    const result = await db.trade(ctx.from.id, 'sell', 'CRYSTAL', amount);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

bot.command('price', async (ctx) => {
    const p = await db.getAllPrices();
    const liq = await db.getLiquidity();
    await ctx.reply(
        `📊 *الأسعار الحالية*\n\n` +
        `💎 *CRYSTAL:* ${liq.crystalPrice.toFixed(6)} USD\n` +
        `🟠 *BTC:* ${p.BTC.price.toFixed(2)} USD\n` +
        `🔵 *ETH:* ${p.ETH.price.toFixed(2)} USD\n` +
        `🟢 *SOL:* ${p.SOL.price.toFixed(2)} USD\n` +
        `🟡 *BNB:* ${p.BNB.price.toFixed(2)} USD\n` +
        `🟣 *MATIC:* ${p.MATIC.price.toFixed(2)} USD\n` +
        `🔷 *APT:* ${p.APT.price.toFixed(2)} USD`,
        { parse_mode: 'Markdown' }
    );
});

// ========== P2P محلي ==========
bot.action('p2p_menu', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
        `📊 *سوق P2P المحلي* 📊\n\n` +
        `يمكنك شراء أو بيع CRYSTAL مباشرة مع مستخدمين آخرين\n\n` +
        `🏦 *العملات المدعومة:* USD, EUR, SAR, AED, EGP\n` +
        `🏧 *طرق الدفع:* تحويل بنكي, باي بال, فودافون كاش, أورنج كاش\n\n` +
        `📝 *الأوامر:*\n` +
        `/p2p_sell [المبلغ] [العملة] [السعر] [طريقة الدفع] - عرض بيع\n` +
        `/p2p_buy [المبلغ] [العملة] [السعر] [طريقة الدفع] - عرض شراء\n` +
        `/p2p_offers [sell/buy] [العملة] - عرض العروض\n\n` +
        `⚠️ *الحد الأدنى:* 10 USD`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) }
    );
});

bot.command('p2p_sell', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 5) return ctx.reply('❌ /p2p_sell [المبلغ] [العملة] [السعر] [طريقة الدفع]\nمثال: /p2p_sell 100 USD 0.01 بنكي');
    const fiatAmount = parseFloat(args[1]);
    const currency = args[2].toUpperCase();
    const price = parseFloat(args[3]);
    const paymentMethod = args.slice(4).join(' ');
    const crystalAmount = fiatAmount / price;
    const result = await db.createP2pOffer(ctx.from.id, 'sell', currency, fiatAmount, crystalAmount, paymentMethod, '');
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

bot.command('p2p_buy', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 5) return ctx.reply('❌ /p2p_buy [المبلغ] [العملة] [السعر] [طريقة الدفع]\nمثال: /p2p_buy 100 USD 0.01 بنكي');
    const fiatAmount = parseFloat(args[1]);
    const currency = args[2].toUpperCase();
    const price = parseFloat(args[3]);
    const paymentMethod = args.slice(4).join(' ');
    const crystalAmount = fiatAmount / price;
    const result = await db.createP2pOffer(ctx.from.id, 'buy', currency, fiatAmount, crystalAmount, paymentMethod, '');
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

bot.command('p2p_offers', async (ctx) => {
    const args = ctx.message.text.split(' ');
    const type = args[1] || 'sell';
    const currency = args[2] || 'USD';
    const offers = await db.getP2pOffers(type, currency);
    if (!offers.length) return ctx.reply('📭 لا توجد عروض');
    let text = `📊 *عروض ${type === 'sell' ? 'البيع' : 'الشراء'} (${currency})*\n\n`;
    for (const o of offers) {
        text += `👤 ${o.firstName || o.username}\n💎 ${o.crystalAmount.toFixed(2)} CRYSTAL\n💰 ${o.fiatAmount} ${o.currency}\n📊 ${o.pricePerCrystal.toFixed(4)} ${o.currency}/CRYSTAL\n🏦 ${o.paymentMethod}\n🆔 \`${o._id}\`\n━━━━━━━━━━━━━━━━━━\n`;
    }
    text += `\n📝 /buy_offer [رقم العرض] - شراء\n/sell_offer [رقم العرض] - بيع`;
    await ctx.reply(text, { parse_mode: 'Markdown' });
});

bot.command('buy_offer', async (ctx) => {
    const id = ctx.message.text.split(' ')[1];
    if (!id) return ctx.reply('❌ /buy_offer [رقم العرض]');
    const r = await db.startP2pTrade(id, ctx.from.id);
    await ctx.reply(r.message, { parse_mode: 'Markdown' });
});

// ========== محفظة المستخدم ==========
bot.action('my_wallet', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const w = await db.getUserWallet(ctx.from.id);
    const s = await db.getUserStats(ctx.from.id);
    await ctx.editMessageText(
        `💼 *محفظتي*\n\n` +
        `💵 *USD:* ${s.usdBalance.toFixed(2)}\n` +
        `💎 *CRYSTAL:* ${s.crystalBalance.toFixed(2)}\n` +
        `💰 *القيمة:* ${s.usdtValue.toFixed(2)} USD\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🌐 *عناوين استقبال العملات:*\n\n` +
        `🟡 *BNB:*\n\`${w.bnbAddress}\`\n\n` +
        `🟣 *POLYGON:*\n\`${w.polygonAddress}\`\n\n` +
        `🟢 *SOLANA:*\n\`${w.solanaAddress}\`\n\n` +
        `🔷 *APTOS:*\n\`${w.aptosAddress}\`\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `📝 *الأوامر:*\n` +
        `/deposit [العملة] [الشبكة] - عنوان للإيداع\n` +
        `/withdraw [العملة] [الشبكة] [المبلغ] [العنوان] - سحب`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('📋 نسخ العناوين', 'copy_addresses'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) }
    );
});

bot.action('copy_addresses', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const w = await db.getUserWallet(ctx.from.id);
    await ctx.editMessageText(
        `📋 *عناوين محفظتك*\n\n` +
        `🟡 BNB:\n\`${w.bnbAddress}\`\n\n` +
        `🟣 POLYGON:\n\`${w.polygonAddress}\`\n\n` +
        `🟢 SOLANA:\n\`${w.solanaAddress}\`\n\n` +
        `🔷 APTOS:\n\`${w.aptosAddress}\``,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'my_wallet')]]) }
    );
});

bot.command('deposit', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply('❌ /deposit [العملة] [الشبكة]\nمثال: /deposit USDT bnb');
    const currency = args[1].toUpperCase();
    const network = args[2].toLowerCase();
    const r = await db.requestDeposit(ctx.from.id, 0, currency, network);
    await ctx.reply(r.message, { parse_mode: 'Markdown' });
});

bot.command('withdraw', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 5) return ctx.reply('❌ /withdraw [العملة] [الشبكة] [المبلغ] [العنوان]\nمثال: /withdraw USDT bnb 10 0x...');
    const currency = args[1].toUpperCase();
    const network = args[2].toLowerCase();
    const amount = parseFloat(args[3]);
    const address = args[4];
    if (isNaN(amount) || amount <= 0) return ctx.reply('❌ المبلغ غير صحيح');
    const r = await db.requestWithdraw(ctx.from.id, amount, currency, network, address);
    await ctx.reply(r.message, { parse_mode: 'Markdown' });
});

// ========== المهام ==========
bot.action('tasks_menu', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const s = await db.getUserStats(ctx.from.id);
    const twitterDone = s.twitterTaskCompleted;
    await ctx.editMessageText(
        `📋 *المهام*\n\n` +
        `📅 *المهمة اليومية*\n` +
        `🎁 المكافأة: ${5 + (s.dailyTasks?.streak || 0)} USD\n` +
        `📈 السلسلة: ${s.dailyTasks?.streak || 0} يوم\n\n` +
        `🐦 *متابعة تويتر*\n` +
        `🎁 المكافأة: 15 USD\n` +
        `✅ الحالة: ${twitterDone ? 'مكتملة ✅' : 'غير مكتملة ❌'}\n\n` +
        `🔗 ${TWITTER_URL}`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([
            [Markup.button.callback('📅 إكمال المهمة اليومية', 'daily_task')],
            [Markup.button.callback('🐦 إكمال مهمة تويتر', 'twitter_task')],
            [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
        ]) }
    );
});

bot.action('daily_task', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const r = await db.completeDailyTask(ctx.from.id);
    await ctx.editMessageText(r.message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'tasks_menu')]]) });
});

bot.action('twitter_task', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const s = await db.getUserStats(ctx.from.id);
    if (s.twitterTaskCompleted) return ctx.editMessageText('✅ لقد أكملت هذه المهمة بالفعل!', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'tasks_menu')]]) });
    await ctx.editMessageText(
        `🐦 *مهمة متابعة تويتر*\n\n📌 الخطوات:\n1. اضغط على الرابط أدناه\n2. اضغط "متابعة" (Follow)\n3. عد واضغط "تم المتابعة"\n\n🎁 المكافأة: 15 USD\n\n🔗 ${TWITTER_URL}`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([
            [Markup.button.url('🔗 الذهاب إلى تويتر', TWITTER_URL)],
            [Markup.button.callback('✅ تم المتابعة', 'confirm_twitter')],
            [Markup.button.callback('🔙 رجوع', 'tasks_menu')]
        ]) }
    );
});

bot.action('confirm_twitter', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const r = await db.completeTwitterTask(ctx.from.id);
    const s = await db.getUserStats(ctx.from.id);
    if (r.success) await ctx.editMessageText(`✅ *تم إكمال المهمة!*\n🎁 +15 USD\n💵 رصيدك: ${s.usdBalance.toFixed(2)} USD`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'tasks_menu')]]) });
    else await ctx.editMessageText(r.message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'tasks_menu')]]) });
});

// ========== المتصدرين ==========
bot.action('leaderboard', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const leaders = await db.getLeaderboard(15);
    const stats = await db.getGlobalStats();
    if (!leaders.length) return ctx.editMessageText('🏆 لا يوجد متصدرين', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    let text = `🏆 *قائمة المتصدرين* 🏆\n👥 *المستخدمين:* ${stats.users}\n💎 *إجمالي CRYSTAL:* ${stats.totalCrystals}\n💵 *إجمالي USD:* ${stats.totalUsd}\n━━━━━━━━━━━━━━━━━━\n\n`;
    const max = leaders[0].crystalBalance;
    for (let i = 0; i < leaders.length; i++) {
        const l = leaders[i];
        const name = l.firstName || l.username || `مستخدم ${l.userId}`;
        const medal = i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
        const bar = '█'.repeat(Math.floor((l.crystalBalance / max) * 20)) + '░'.repeat(20 - Math.floor((l.crystalBalance / max) * 20));
        text += `${medal} *${name}*\n   💎 ${l.crystalBalance.toFixed(2)} CRYSTAL\n   💵 ${l.usdBalance.toFixed(2)} USD\n   📊 [${bar}] ${Math.floor((l.crystalBalance / max) * 100)}%\n━━━━━━━━━━━━━━━━━━\n`;
    }
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔄 تحديث', 'leaderboard'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

// ========== إحصائياتي ==========
bot.action('my_stats', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const s = await db.getUserStats(ctx.from.id);
    await ctx.editMessageText(
        `📊 *إحصائياتي*\n\n` +
        `👤 *${s.firstName}*\n` +
        `💵 *USD:* ${s.usdBalance.toFixed(2)}\n` +
        `💎 *CRYSTAL:* ${s.crystalBalance.toFixed(2)}\n` +
        `💰 *القيمة:* ${s.usdtValue.toFixed(2)} USD\n` +
        `📊 *سعر CRYSTAL:* ${s.crystalPrice.toFixed(6)} USD\n` +
        `📈 *إجمالي التداول:* ${s.totalTraded.toFixed(2)} USD\n` +
        `👥 *الإحالات:* ${s.referralCount}/10\n` +
        `📅 *تاريخ التسجيل:* ${new Date(s.createdAt).toLocaleDateString('ar')}`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) }
    );
});

// ========== اللغة ==========
bot.action('change_language', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText('🌐 *اختر اللغة*', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([
        [Markup.button.callback('🇸🇦 العربية', 'lang_ar'), Markup.button.callback('🇬🇧 English', 'lang_en')],
        [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
    ]) });
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

// ========== الدعم ==========
bot.action('support', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
        `📞 *الدعم الفني*\n\n👤 *الأدمن:* @${ADMIN_USERNAME}\n🆔 *المعرف:* ${ADMIN_ID}\n\n💸 *عناوين العمولات:*\n🟡 BNB: \`${COMMISSION_ADDRESSES.bnb}\`\n🟣 POLYGON: \`${COMMISSION_ADDRESSES.polygon}\`\n🟢 SOLANA: \`${COMMISSION_ADDRESSES.solana}\`\n🔷 APTOS: \`${COMMISSION_ADDRESSES.aptos}\``,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.url('📨 تواصل', `https://t.me/${ADMIN_USERNAME}`)], [Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) }
    );
});

// ========== العودة للقائمة ==========
bot.action('back_to_menu', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const s = await db.getUserStats(ctx.from.id);
    const text = `✨ *القائمة الرئيسية*\n👤 ${ctx.from.first_name}\n💵 ${s.usdBalance.toFixed(2)} USD\n💎 ${s.crystalBalance.toFixed(2)} CRYSTAL\n💰 ${s.usdtValue.toFixed(2)} USD\n📊 سعر CRYSTAL: ${s.crystalPrice.toFixed(6)} USD`;
    const kb = ctx.from.id === ADMIN_ID ? adminKeyboard : mainKeyboard;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb });
});

// ========== أوامر الأدمن ==========
bot.action('pending_withdraws', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const p = await db.getPendingWithdraws();
    if (!p.length) return ctx.editMessageText('📭 لا طلبات سحب', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    let text = '💰 *طلبات السحب*\n\n';
    p.forEach(r => { text += `🆔 \`${r._id}\` | 👤 ${r.userId}\n💰 ${r.amount} ${r.currency}\n🌐 ${r.network}\n📤 ${r.address}\n━━━━━━━━━━━━━━━━━━\n`; });
    text += `\n📝 /confirm_withdraw [الرقم] [رابط]`;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.command('confirm_withdraw', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const [_, id, hash] = ctx.message.text.split(' ');
    if (!id || !hash) return ctx.reply('❌ /confirm_withdraw [id] [hash]');
    const r = await db.confirmWithdraw(id, hash, ctx.from.id);
    await ctx.reply(r.message);
});

bot.action('pending_p2p', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const p = await db.getPendingP2p();
    if (!p.length) return ctx.editMessageText('📭 لا صفقات P2P معلقة', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    let text = '📊 *صفقات P2P المعلقة*\n\n';
    p.forEach(r => { text += `🆔 \`${r._id}\`\n👤 البائع: ${r.userId}\n👤 المشتري: ${r.counterpartyId}\n💎 ${r.crystalAmount} CRYSTAL\n💰 ${r.fiatAmount} ${r.currency}\n━━━━━━━━━━━━━━━━━━\n`; });
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('global_stats', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const s = await db.getGlobalStats();
    const liq = await db.getLiquidity();
    await ctx.editMessageText(
        `📊 *إحصائيات عامة*\n\n` +
        `👥 *المستخدمين:* ${s.users}\n` +
        `💎 *إجمالي CRYSTAL:* ${s.totalCrystals}\n` +
        `💵 *إجمالي USD:* ${s.totalUsd}\n` +
        `📈 *حجم التداول:* ${s.totalTraded} USD\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `💎 *CRYSTAL:*\n` +
        `• الإجمالي: ${liq.totalCrystalSupply.toLocaleString()}\n` +
        `• المتداول: ${liq.circulatingCrystal.toLocaleString()}\n` +
        `• السعر: ${liq.crystalPrice.toFixed(6)} USD`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) }
    );
});

bot.action('today_stats', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const s = await db.getTodayStats();
    await ctx.editMessageText(
        `📅 *إحصائيات اليوم*\n${new Date().toLocaleDateString('ar')}\n\n` +
        `👥 مستخدمين جدد: ${s?.totalUsers || 0}\n` +
        `📈 صفقات: ${s?.totalTrades || 0}\n` +
        `💰 حجم التداول: ${s?.totalVolume?.toFixed(2) || 0} USD\n` +
        `💸 عمولات: ${s?.totalCommission?.toFixed(2) || 0} USD\n` +
        `🔄 صفقات P2P: ${s?.p2pTrades || 0}\n` +
        `👥 إحالات: ${s?.totalReferrals || 0}`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) }
    );
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
    await ctx.answerCbQuery('✅ تم رفع الحظر');
    await ctx.editMessageText('✅ تم رفع الحظر', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

// ========== معالجة الرسائل النصية ==========
bot.on('text', messageRateLimitMiddleware, async (ctx) => {
    if (ctx.session?.state === 'p2p_create') {
        // معالجة إنشاء عرض P2P
        delete ctx.session.state;
    }
});

// تشغيل البوت
bot.launch().then(() => {
    console.log('🚀 Bot running');
    console.log('👑 Admin:', ADMIN_ID);
    console.log('💎 Total CRYSTAL Supply: 30,000,000');
    console.log('📊 Crystal price linked to BTC');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
