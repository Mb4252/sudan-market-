require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const db = require('./database');
const blockchainMonitor = require('./blockchain');
const express = require('express');
const path = require('path');
const multer = require('multer');
const cors = require('cors');

// ========== إعداد خادم الويب ==========
const app = express();
const PORT = process.env.PORT || 10000;

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'mining-app')));

const WEBAPP_URL = process.env.WEBAPP_URL || `https://${process.env.RENDER_EXTERNAL_URL || 'localhost'}`;
const ADMIN_IDS = (process.env.ADMIN_IDS || '6701743450,8181305474').split(',').map(Number);
const BOT_USERNAME = process.env.BOT_USERNAME || 'TradeCrystalBot';

function isAdmin(userId) {
    return ADMIN_IDS.includes(parseInt(userId));
}

// ========== Middleware ==========
app.use((req, res, next) => {
    console.log(`📡 ${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// ========== الصفحات ==========
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'mining-app', 'index.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'mining-app', 'terms.html')));

// ========== Health ==========
app.get('/health', async (req, res) => {
    try { const price = await db.getMarketPrice(); res.json({ status: 'ok', timestamp: new Date(), supply: 5000000, price }); } catch (e) { res.json({ status: 'ok', timestamp: new Date() }); }
});

// ========== API ==========

app.get('/api/market/price', async (req, res) => {
    try { const price = await db.getMarketPrice(); res.json({ success: true, price }); } catch(e) { res.json({ success: true, price: 0.002 }); }
});

app.get('/api/market/stats', async (req, res) => {
    try { const stats = await db.getMarketStats(); res.json({ success: true, ...stats }); } catch(e) { res.json({ success: true, price: 0.002 }); }
});

app.get('/api/market/candles/:timeframe', async (req, res) => {
    try { const candles = await db.getCandlesticks(req.params.timeframe, parseInt(req.query.limit) || 100); res.json(candles || []); } catch(e) { res.json([]); }
});

app.get('/api/orders', async (req, res) => {
    try { const orders = await db.getActiveOrders(req.query.type, parseInt(req.query.limit) || 50); res.json({ success: true, orders }); } catch(e) { res.json({ success: true, orders: [] }); }
});

app.get('/api/orders/:userId', async (req, res) => {
    try { const orders = await db.getUserOrders(parseInt(req.params.userId)); res.json(orders || []); } catch(e) { res.json([]); }
});

app.post('/api/order/create', async (req, res) => {
    try {
        const { user_id, type, price, amount } = req.body;
        if (!user_id || !type || !price || !amount) return res.json({ success: false, message: '⚠️ جميع الحقول مطلوبة' });
        const result = await db.createOrder(parseInt(user_id), type, parseFloat(price), parseFloat(amount));
        res.json(result);
    } catch(e) { res.json({ success: false, message: '❌ حدث خطأ' }); }
});

app.post('/api/order/cancel', async (req, res) => {
    try {
        const { order_id, user_id } = req.body;
        if (!order_id || !user_id) return res.json({ success: false, message: '⚠️ معرف الطلب والمستخدم مطلوب' });
        const result = await db.cancelOrder(order_id, parseInt(user_id));
        res.json(result);
    } catch(e) { res.json({ success: false, message: '❌ حدث خطأ' }); }
});

app.get('/api/user/:userId', async (req, res) => {
    try { const stats = await db.getUserStats(parseInt(req.params.userId)); res.json(stats || { usdtBalance: 0, crystalBalance: 0, isVerified: false }); } catch(e) { res.json({ usdtBalance: 0, crystalBalance: 0, isVerified: false }); }
});

app.post('/api/register', async (req, res) => {
    try {
        const { user_id, username, first_name, referrer_id } = req.body;
        if (!user_id) return res.json({ success: false, message: '⚠️ معرف المستخدم مطلوب' });
        const result = await db.registerUser(parseInt(user_id), username || '', first_name || '', '', '', '', 'SD', '', referrer_id ? parseInt(referrer_id) : null, 'ar', req.ip, req.headers['user-agent']);
        res.json(result);
    } catch(e) { res.json({ success: false, message: '❌ حدث خطأ' }); }
});

app.get('/api/user/trades/:userId', async (req, res) => {
    try { const trades = await db.getUserTradeHistory(parseInt(req.params.userId), 50); res.json(trades || []); } catch(e) { res.json([]); }
});

app.get('/api/wallet/:userId', async (req, res) => {
    try { const wallet = await db.getUserWallet(parseInt(req.params.userId)); res.json({ usdtBalance: wallet.usdtBalance || 0, crystalBalance: wallet.crystalBalance || 0, addresses: { bnb: wallet.bnbAddress, polygon: wallet.polygonAddress, solana: wallet.solanaAddress, aptos: wallet.aptosAddress } }); } catch(e) { res.json({ usdtBalance: 0, crystalBalance: 0, addresses: {} }); }
});

app.post('/api/deposit', async (req, res) => {
    try {
        const { user_id, amount, network } = req.body;
        if (!user_id || !amount || !network) return res.json({ success: false, message: '⚠️ جميع الحقول مطلوبة' });
        const result = await db.requestDeposit(parseInt(user_id), parseFloat(amount), 'USDT', network);
        res.json(result);
    } catch(e) { res.json({ success: false, message: '❌ حدث خطأ' }); }
});

app.post('/api/withdraw', async (req, res) => {
    try {
        const { user_id, amount, network, address, twofa_code } = req.body;
        if (!user_id || !amount || !network || !address) return res.json({ success: false, message: '⚠️ جميع الحقول مطلوبة' });
        const result = await db.requestWithdraw(parseInt(user_id), parseFloat(amount), 'USDT', network, address, twofa_code);
        res.json(result);
    } catch(e) { res.json({ success: false, message: '❌ حدث خطأ' }); }
});

app.get('/api/kyc/status/:userId', async (req, res) => {
    try { const status = await db.getKycStatus(parseInt(req.params.userId)); res.json(status); } catch(e) { res.json({ status: 'not_submitted' }); }
});

app.post('/api/kyc/submit', upload.fields([{ name: 'passportPhoto', maxCount: 1 }, { name: 'personalPhoto', maxCount: 1 }]), async (req, res) => {
    try {
        const { user_id, fullName } = req.body;
        if (!user_id || !fullName) return res.json({ success: false, message: '⚠️ الاسم ومعرف المستخدم مطلوبان' });
        let pf = null, sf = null;
        if (global.botInstance) {
            try {
                if (req.files?.passportPhoto?.[0]) { const m = await global.botInstance.telegram.sendPhoto(ADMIN_IDS[0], { source: req.files.passportPhoto[0].buffer }, { caption: `📄 ${fullName} (${user_id})` }); pf = m.photo[m.photo.length-1].file_id; }
                if (req.files?.personalPhoto?.[0]) { const m = await global.botInstance.telegram.sendPhoto(ADMIN_IDS[0], { source: req.files.personalPhoto[0].buffer }, { caption: `📸 ${fullName} (${user_id})` }); sf = m.photo[m.photo.length-1].file_id; }
            } catch(e) {}
        }
        const result = await db.createKycRequest(parseInt(user_id), fullName, 'N/A', 'N/A', 'N/A', '', 'SD', '', pf, sf, '', '', '');
        res.json(result);
    } catch(e) { res.json({ success: false, message: '❌ حدث خطأ' }); }
});

app.get('/api/user/referral/:userId', async (req, res) => {
    try { const data = await db.getReferralData(parseInt(req.params.userId)); res.json(data); } catch(e) { res.json({ referralCount: 0, referralEarnings: 0 }); }
});

app.post('/api/referral/transfer', async (req, res) => {
    try { const result = await db.transferReferralEarningsToWallet(parseInt(req.body.user_id)); res.json(result); } catch(e) { res.json({ success: false, message: '❌ حدث خطأ' }); }
});

app.get('/api/chat/global', async (req, res) => {
    try { const messages = await db.getGlobalMessages(50); res.json(messages || []); } catch(e) { res.json([]); }
});

app.post('/api/chat/send', async (req, res) => {
    try { const result = await db.sendMessage(parseInt(req.body.senderId), null, req.body.message); res.json({ success: true, message: result }); } catch(e) { res.json({ success: false, message: '❌ حدث خطأ' }); }
});

app.post('/api/2fa/generate', async (req, res) => {
    try { const result = await db.generate2FASecret(parseInt(req.body.user_id)); res.json(result); } catch(e) { res.json({ success: false, message: '❌ حدث خطأ' }); }
});

app.post('/api/2fa/enable', async (req, res) => {
    try { const result = await db.enable2FA(parseInt(req.body.user_id), req.body.code); res.json(result); } catch(e) { res.json({ success: false, message: '❌ حدث خطأ' }); }
});

app.post('/api/2fa/disable', async (req, res) => {
    try { const result = await db.disable2FA(parseInt(req.body.user_id), req.body.code); res.json(result); } catch(e) { res.json({ success: false, message: '❌ حدث خطأ' }); }
});

app.get('/api/supply', async (req, res) => {
    try { const sc = await db.validateTotalSupply(); res.json({ success: true, ...sc }); } catch(e) { res.json({ success: true, totalSupply: 5000000 }); }
});

// ========== معالج أخطاء ==========
app.use((err, req, res, next) => { console.error('❌', err.message); res.status(500).json({ success: false, message: '❌ خطأ في الخادم' }); });

// ========== بوت ==========
const bot = new Telegraf(process.env.BOT_TOKEN);
global.botInstance = bot;
module.exports.bot = bot;

// ========== أوامر ==========

bot.start(async (ctx) => {
    try {
        const user = ctx.from;
        const result = await db.registerUser(user.id, user.username || '', user.first_name || '', '', '', '', 'SD', '', ctx.startPayload ? parseInt(ctx.startPayload) : null);
        const price = await db.getMarketPrice();
        const sc = await db.validateTotalSupply();
        
        let msg;
        if (result.isAdmin) msg = `👑 *أهلاً بالأدمن!*\n\n📦 رصيدك: ${sc.adminBalance.toLocaleString()} CRYSTAL\n💰 السعر: ${price} USDT`;
        else if (result.isNew) msg = `🎉 *أهلاً بك!*\n\n💰 السعر: ${price} USDT\n💡 أودع USDT ثم اشترِ CRYSTAL`;
        else msg = `👋 *أهلاً بعودتك!*\n💰 السعر: ${price} USDT`;
        
        await ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.webApp('💎 فتح المنصة', WEBAPP_URL)]]) });
    } catch (e) { await ctx.reply('❌ حدث خطأ'); }
});

bot.command('help', async (ctx) => {
    let t = '📚 *الأوامر:*\n/start /price /balance /stats /supply /orders /buy /sell /cancel /referral';
    if (isAdmin(ctx.from.id)) t += '\n\n👑 *أدمن:*\n/admin /admin_balance /kyc_list /pending /fix /maintenance /ban /unban';
    await ctx.reply(t, { parse_mode: 'Markdown' });
});

bot.command('price', async (ctx) => { try { const p = await db.getMarketPrice(); await ctx.reply(`💎 السعر: ${p} USDT`, { parse_mode: 'Markdown' }); } catch(e) {} });
bot.command('supply', async (ctx) => { try { const sc = await db.validateTotalSupply(); await ctx.reply(`📊 العرض: ${sc.totalSupply.toLocaleString()}\n🔄 متداول: ${sc.circulating.toFixed(2)}\n👑 أدمن: ${sc.adminBalance.toFixed(2)}`, { parse_mode: 'Markdown' }); } catch(e) {} });

bot.command('balance', async (ctx) => {
    try { const s = await db.getUserStats(ctx.from.id); if (!s) return ctx.reply('⚠️ سجل أولاً'); await ctx.reply(`💰 CRYSTAL: ${s.crystalBalance?.toFixed(2)||0}\n💵 USDT: ${s.usdtBalance?.toFixed(2)||0}`, { parse_mode: 'Markdown' }); } catch(e) {}
});

bot.command('stats', async (ctx) => {
    try { const s = await db.getMarketStats(); await ctx.reply(`📊 السوق\n💎 ${s.price}\n📈 ${s.change24h?.toFixed(2)||0}%\n🟢 ${s.buyOrders} | 🔴 ${s.sellOrders}\n💰 حجم: ${s.volume24h?.toFixed(0)||0}`, { parse_mode: 'Markdown' }); } catch(e) {}
});

bot.command('referral', async (ctx) => { try { const d = await db.getReferralData(ctx.from.id); await ctx.reply(`👥 ${d.referralCount} | 💰 ${(d.referralEarnings||0).toFixed(2)}\n🔗 ${d.referralLink}`, { parse_mode: 'Markdown' }); } catch(e) {} });

bot.command('buy', async (ctx) => { try { const a = ctx.message.text.split(' '); if (a.length<3) return ctx.reply('/buy [سعر] [كمية]'); const r = await db.createOrder(ctx.from.id, 'buy', parseFloat(a[1]), parseFloat(a[2])); await ctx.reply(r.message); } catch(e) {} });
bot.command('sell', async (ctx) => { try { const a = ctx.message.text.split(' '); if (a.length<3) return ctx.reply('/sell [سعر] [كمية]'); const r = await db.createOrder(ctx.from.id, 'sell', parseFloat(a[1]), parseFloat(a[2])); await ctx.reply(r.message); } catch(e) {} });
bot.command('cancel', async (ctx) => { try { const oid = ctx.message.text.split(' ')[1]; if (!oid) return ctx.reply('/cancel [رقم]'); const r = await db.cancelOrder(oid, ctx.from.id); await ctx.reply(r.message); } catch(e) {} });

bot.command('orders', async (ctx) => {
    try {
        const buys = await db.getActiveOrders('buy', 5), sells = await db.getActiveOrders('sell', 5);
        let t = '📊 *شراء:*\n'; for (const o of buys.slice(0,5)) t += `💰 ${o.price} | 📦 ${o.amount?.toFixed(2)}\n`;
        t += '\n📊 *بيع:*\n'; for (const o of sells.slice(0,5)) t += `💰 ${o.price} | 📦 ${o.amount?.toFixed(2)}\n`;
        await ctx.reply(t, { parse_mode: 'Markdown' });
    } catch(e) {}
});

// ========== أدمن ==========

bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('⛔');
    const kyc = await db.getPendingKycRequests(), w = await db.getPendingWithdraws(), d = await db.getPendingDeposits();
    await ctx.reply(`👑 *لوحة الأدمن*\n🆔 توثيق: ${kyc.length}\n💰 سحب: ${w.length}\n📤 إيداع: ${d.length}`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback(`🆔 توثيق (${kyc.length})`, 'admin_kyc')],
            [Markup.button.callback(`💰 سحب (${w.length})`, 'admin_withdraws')],
            [Markup.button.callback(`📤 إيداع (${d.length})`, 'admin_deposits')]
        ])
    });
});

bot.command('admin_balance', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('⛔');
    const b = await db.getAdminBalance(ctx.from.id), sc = await db.validateTotalSupply();
    await ctx.reply(`👑 CRYSTAL: ${b.crystalBalance.toLocaleString()}\n💵 USDT: ${b.usdtBalance.toFixed(2)}\n📊 عرض: ${sc.totalSupply.toLocaleString()}`, { parse_mode: 'Markdown' });
});

bot.command('kyc_list', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('⛔');
    const pending = await db.getPendingKycRequests();
    if (!pending.length) return ctx.reply('📭 لا توجد طلبات');
    for (const req of pending) {
        await ctx.reply(`📋 ${req.fullName}`, Markup.inlineKeyboard([[Markup.button.callback('✅ قبول', `approve_kyc_${req._id}`), Markup.button.callback('❌ رفض', `reject_kyc_${req._id}`)]]));
        if (req.passportPhotoFileId) { try { await ctx.replyWithPhoto(req.passportPhotoFileId); } catch(e) {} }
        if (req.personalPhotoFileId) { try { await ctx.replyWithPhoto(req.personalPhotoFileId); } catch(e) {} }
    }
});

bot.command('pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('⛔');
    const w = await db.getPendingWithdraws(), d = await db.getPendingDeposits();
    for (const r of w) await ctx.reply(`💰 سحب: ${r.userId} - ${r.amount} USDT - ${r.network}\n📤 ${r.address?.slice(0,20)}...`, Markup.inlineKeyboard([[Markup.button.callback('✅ تأكيد وإرسال', `confirm_withdraw_${r._id}`)]]));
    for (const r of d) await ctx.reply(`📤 إيداع: ${r.userId} - ${r.amount} USDT - ${r.network}`, Markup.inlineKeyboard([[Markup.button.callback('✅ تأكيد', `confirm_deposit_${r._id}`)]]));
});

bot.command('fix', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('⛔');
    const fixed = await db.fixStuckOrders(), balance = await db.validateBalances();
    await ctx.reply(`🔧 تم تصحيح: ${fixed}\n✅ الأرصدة: ${balance.isValid?'سليمة':'خطأ'}`, { parse_mode: 'Markdown' });
});

bot.command('maintenance', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('⛔');
    const orders = await require('./models').Order.find({ status: { $in: ['open', 'partial'] } });
    for (const o of orders) await db.cancelOrder(o._id, o.userId);
    await ctx.reply(`✅ تم إلغاء ${orders.length} أمر`);
});

bot.command('ban', async (ctx) => { if (!isAdmin(ctx.from.id)) return; const a = ctx.message.text.split(' '); const r = await db.banUser(parseInt(a[1]), a.slice(2).join(' ')||'مخالفة'); await ctx.reply(r.message); });
bot.command('unban', async (ctx) => { if (!isAdmin(ctx.from.id)) return; const r = await db.unbanUser(parseInt(ctx.message.text.split(' ')[1])); await ctx.reply(r.message); });

// ========== Callbacks ==========

bot.action('admin_kyc', async (ctx) => { await ctx.answerCbQuery(); const p = await db.getPendingKycRequests(); for (const r of p.slice(0,5)) await ctx.reply(`📋 ${r.fullName}`, Markup.inlineKeyboard([[Markup.button.callback('✅', `approve_kyc_${r._id}`), Markup.button.callback('❌', `reject_kyc_${r._id}`)]])); });
bot.action('admin_withdraws', async (ctx) => { await ctx.answerCbQuery(); const p = await db.getPendingWithdraws(); for (const r of p.slice(0,5)) await ctx.reply(`💰 ${r.amount} USDT | 👤 ${r.userId}`, Markup.inlineKeyboard([[Markup.button.callback('✅ إرسال', `confirm_withdraw_${r._id}`)]])); });
bot.action('admin_deposits', async (ctx) => { await ctx.answerCbQuery(); const p = await db.getPendingDeposits(); for (const r of p.slice(0,5)) await ctx.reply(`📤 ${r.amount} USDT | 👤 ${r.userId}`, Markup.inlineKeyboard([[Markup.button.callback('✅', `confirm_deposit_${r._id}`)]])); });

bot.action(/approve_kyc_(.+)/, async (ctx) => { if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔'); await ctx.answerCbQuery(); const r = await db.approveKyc(ctx.match[1], ctx.from.id); await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); await ctx.reply(r.message); });
bot.action(/reject_kyc_(.+)/, async (ctx) => { if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔'); await ctx.answerCbQuery(); const r = await db.rejectKyc(ctx.match[1], ctx.from.id, 'غير مستوفي'); await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); await ctx.reply(r.message); });

// ✅ تأكيد السحب مع إرسال حقيقي
bot.action(/confirm_withdraw_(.+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔');
    await ctx.answerCbQuery('⏳ جاري الإرسال على البلوكشين...');
    const result = await db.confirmWithdraw(ctx.match[1], '', ctx.from.id);
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.reply(result.message);
});

bot.action(/confirm_deposit_(.+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔');
    await ctx.answerCbQuery();
    const result = await db.confirmDeposit(ctx.match[1], 'manual_confirm', ctx.from.id);
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.reply(result.message);
});

bot.catch((err, ctx) => console.error(`❌ Bot error:`, err.message));

// ========== تشغيل ==========
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Server on port ${PORT}`);
    console.log(`🌐 URL: ${WEBAPP_URL}`);
});

(async () => {
    try {
        await db.connect();
        console.log('✅ Database connected');
        await db.startFakePriceMovement();
        console.log('📊 Fake price started');
        blockchainMonitor.startMonitoring(db);
        console.log('🔍 Blockchain monitor started');
        
        await bot.telegram.deleteWebhook();
        const webhookUrl = `${WEBAPP_URL}/webhook`;
        await bot.telegram.setWebhook(webhookUrl);
        console.log(`✅ Webhook: ${webhookUrl}`);
        app.use(bot.webhookCallback('/webhook'));
        
        const botInfo = await bot.telegram.getMe();
        console.log(`✅ Bot @${botInfo.username} ready`);
        console.log('🚀 CRYSTAL Exchange running!');
    } catch (error) {
        console.error('❌ Startup error:', error.message);
        try { await bot.telegram.deleteWebhook(); bot.launch(); console.log('✅ Polling mode'); } catch(e) {}
    }
})();

process.once('SIGINT', async () => { await db.stopFakePriceMovement(); await bot.telegram.deleteWebhook(); bot.stop('SIGINT'); server.close(); process.exit(0); });
process.once('SIGTERM', async () => { await db.stopFakePriceMovement(); await bot.telegram.deleteWebhook(); bot.stop('SIGTERM'); server.close(); process.exit(0); });
