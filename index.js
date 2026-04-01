require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const db = require('./database');
const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');

// ========== إعداد خادم الويب ==========
const app = express();
const PORT = process.env.PORT || 10000;

const limiter = rateLimit({ windowMs: 60 * 1000, max: 60, message: { success: false, message: '⚠️ الكثير من الطلبات' }, skip: (req) => req.body?.user_id === parseInt(process.env.ADMIN_ID) });
app.use(limiter);
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'mining-app')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'mining-app', 'index.html')));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ========== API Routes ==========
app.get('/api/global_stats', async (req, res) => res.json(await db.getGlobalStats()));
app.get('/api/user/:userId', async (req, res) => {
    const u = await db.getUser(parseInt(req.params.userId));
    res.json(u || { balance: 0, miningRate: 1, miningLevel: 1, totalMined: 0, vipLevel: 0, comboCount: 0, twitterTaskCompleted: false });
});
app.post('/api/mine', async (req, res) => res.json(await db.mine(parseInt(req.body.user_id))));
app.get('/api/leaderboard', async (req, res) => {
    const l = await db.getLeaderboard(15);
    res.json(l.map(x => ({ name: x.firstName || x.username || `مستخدم ${x.userId}`, balance: x.crystalBalance || 0, level: x.miningLevel || 1, vipLevel: x.vipLevel || 0 })));
});
app.get('/api/liquidity', async (req, res) => {
    const l = await db.getLiquidity();
    res.json({ total_liquidity: l.totalLiquidity, total_sold: l.totalSold, available: l.totalLiquidity - l.totalSold });
});
app.post('/api/purchase', async (req, res) => res.json(await db.requestPurchase(parseInt(req.body.user_id), parseFloat(req.body.amount))));
app.post('/api/upgrade', async (req, res) => res.json(await db.upgradeMiningRate(parseInt(req.body.user_id))));
app.post('/api/register', async (req, res) => {
    await db.registerUser(parseInt(req.body.user_id), req.body.username, req.body.first_name, null, req.body.language || 'ar');
    res.json({ success: true });
});
app.post('/api/set_language', async (req, res) => { await db.setLanguage(parseInt(req.body.user_id), req.body.language); res.json({ success: true }); });
app.get('/api/user/daily/:userId', async (req, res) => {
    const s = await db.getUserStats(parseInt(req.params.userId));
    res.json({ daily_mined: s?.dailyMined || 0, daily_limit: 70, remaining: 70 - (s?.dailyMined || 0), progress: Math.min(100, ((s?.dailyMined || 0) / 70) * 100) });
});
app.post('/api/daily_task', async (req, res) => res.json(await db.completeDailyTask(parseInt(req.body.user_id))));
app.post('/api/upgrade_vip', async (req, res) => res.json(await db.upgradeVIP(parseInt(req.body.user_id))));
app.post('/api/complete_twitter_task', async (req, res) => res.json(await db.completeTwitterTask(parseInt(req.body.user_id))));
app.get('/api/user/stats/:userId', async (req, res) => res.json(await db.getUserStats(parseInt(req.params.userId))));
app.get('/api/p2p/offers', async (req, res) => res.json(await db.getP2pOffers(req.query.type)));
app.post('/api/p2p/create', async (req, res) => res.json(await db.createP2pOffer(parseInt(req.body.user_id), req.body.type, parseFloat(req.body.amount), parseFloat(req.body.usdt))));
app.post('/api/p2p/start', async (req, res) => res.json(await db.startP2pTrade(req.body.offer_id, parseInt(req.body.user_id))));
app.post('/api/p2p/proof', async (req, res) => res.json(await db.sendPaymentProof(req.body.offer_id, parseInt(req.body.user_id), req.body.proof_image)));
app.post('/api/p2p/release', async (req, res) => res.json(await db.releaseCrystals(req.body.offer_id, parseInt(req.body.user_id))));
app.get('/api/wallet/:userId', async (req, res) => {
    const w = await db.getUserWallet(parseInt(req.params.userId));
    const b = await db.getWalletBalances(parseInt(req.params.userId));
    res.json({ addresses: { bnb: w.bnbAddress, polygon: w.polygonAddress, solana: w.solanaAddress, aptos: w.aptosAddress }, balances: b, signature: w.walletSignature });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Web server on port ${PORT}`));

// ========== إعداد بوت التلجرام ==========
(async () => { try { await db.connect(); console.log('✅ Database connected'); } catch (e) { console.error('❌ DB error:', e); } })();

const bot = new Telegraf(process.env.BOT_TOKEN);
const WEBAPP_URL = process.env.WEBAPP_URL || `https://sdm-security-bot.onrender.com`;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const TWITTER_URL = process.env.TWITTER_URL;

// زر واحد فقط - فتح التطبيق المصغر
const startKeyboard = Markup.inlineKeyboard([
    [Markup.button.webApp('🚀 فتح تطبيق التعدين', WEBAPP_URL)]
]);

bot.start(async (ctx) => {
    const user = ctx.from;
    const referrer = ctx.startPayload ? parseInt(ctx.startPayload) : null;
    await db.registerUser(user.id, user.username, user.first_name, referrer, 'ar');
    await ctx.reply(`✨ *مرحباً بك في بوت تعدين CRYSTAL!* ✨\n\n👤 *المستخدم:* ${user.first_name}\n💎 *اضغط على الزر أدناه لفتح التطبيق المصغر*\n\n🚀 *استمتع بالتعدين والمحفظة الرقمية!*`, { parse_mode: 'Markdown', ...startKeyboard });
});

// أوامر بسيطة للدعم
bot.command('admin', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    await ctx.reply('👑 مرحباً أيها الأدمن');
});

// تأكيد طلبات الترقية والشراء (للأدمن)
bot.command('confirm_upgrade', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const [_, id, hash] = ctx.message.text.split(' ');
    if (!id || !hash) return ctx.reply('❌ /confirm_upgrade [id] [hash]');
    const r = await db.confirmUpgrade(id, hash, ctx.from.id);
    await ctx.reply(r.message);
    if (r.user_id) await bot.telegram.sendMessage(r.user_id, r.message, { parse_mode: 'Markdown' });
});

bot.command('confirm_purchase', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const [_, id, hash] = ctx.message.text.split(' ');
    if (!id || !hash) return ctx.reply('❌ /confirm_purchase [id] [hash]');
    const r = await db.confirmPurchase(id, hash, ctx.from.id);
    await ctx.reply(r.message);
});

bot.launch().then(() => console.log('🚀 Bot running'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
