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
const CHANNEL_LINK = 'https://t.me/+8pUE4W3aK7lmYzY0';

function isAdmin(userId) { return ADMIN_IDS.includes(parseInt(userId)); }

// ✅ دالة هروب الرموز الخاصة
function esc(text) {
    if (!text) return '';
    return String(text).replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

app.use((req, res, next) => { console.log(`📡 ${new Date().toISOString()} - ${req.method} ${req.url}`); next(); });

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'mining-app', 'index.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'mining-app', 'terms.html')));
app.get('/health', async (req, res) => { try { const price = await db.getMarketPrice(); res.json({ status: 'ok', timestamp: new Date(), supply: 5000000, price }); } catch (e) { res.json({ status: 'ok', timestamp: new Date() }); } });

// ========== API ==========
app.get('/api/market/price', async (req, res) => { try { const price = await db.getMarketPrice(); res.json({ success: true, price }); } catch(e) { res.json({ success: true, price: 0.002 }); } });
app.get('/api/market/stats', async (req, res) => { try { const stats = await db.getMarketStats(); res.json({ success: true, ...stats }); } catch(e) { res.json({ success: true, price: 0.002 }); } });
app.get('/api/market/candles/:timeframe', async (req, res) => { try { const candles = await db.getCandlesticks(req.params.timeframe, parseInt(req.query.limit) || 100); res.json(candles || []); } catch(e) { res.json([]); } });
app.get('/api/orders', async (req, res) => { try { const orders = await db.getActiveOrders(req.query.type, parseInt(req.query.limit) || 50); res.json({ success: true, orders }); } catch(e) { res.json({ success: true, orders: [] }); } });
app.get('/api/orders/:userId', async (req, res) => { try { const orders = await db.getUserOrders(parseInt(req.params.userId)); res.json(orders || []); } catch(e) { res.json([]); } });
app.post('/api/order/create', async (req, res) => { try { const { user_id, type, price, amount } = req.body; if (!user_id || !type || !price || !amount) return res.json({ success: false, message: '⚠️ جميع الحقول مطلوبة' }); const result = await db.createOrder(parseInt(user_id), type, parseFloat(price), parseFloat(amount)); res.json(result); } catch(e) { res.json({ success: false, message: '❌ حدث خطأ' }); } });
app.post('/api/order/cancel', async (req, res) => { try { const { order_id, user_id } = req.body; if (!order_id || !user_id) return res.json({ success: false, message: '⚠️ معرف الطلب والمستخدم مطلوب' }); const result = await db.cancelOrder(order_id, parseInt(user_id)); res.json(result); } catch(e) { res.json({ success: false, message: '❌ حدث خطأ' }); } });
app.get('/api/user/:userId', async (req, res) => { try { const stats = await db.getUserStats(parseInt(req.params.userId)); res.json(stats || { usdtBalance: 0, crystalBalance: 0, isVerified: false }); } catch(e) { res.json({ usdtBalance: 0, crystalBalance: 0, isVerified: false }); } });
app.post('/api/register', async (req, res) => { try { const { user_id, username, first_name, referrer_id } = req.body; if (!user_id) return res.json({ success: false, message: '⚠️ معرف المستخدم مطلوب' }); const result = await db.registerUser(parseInt(user_id), username || '', first_name || '', '', '', '', 'SD', '', referrer_id ? parseInt(referrer_id) : null, 'ar', req.ip, req.headers['user-agent']); res.json(result); } catch(e) { res.json({ success: false, message: '❌ حدث خطأ' }); } });
app.get('/api/user/trades/:userId', async (req, res) => { try { const trades = await db.getUserTradeHistory(parseInt(req.params.userId), 50); res.json(trades || []); } catch(e) { res.json([]); } });
app.get('/api/wallet/:userId', async (req, res) => { try { const wallet = await db.getUserWallet(parseInt(req.params.userId)); res.json({ usdtBalance: wallet.usdtBalance || 0, crystalBalance: wallet.crystalBalance || 0, addresses: { bnb: wallet.bnbAddress, polygon: wallet.polygonAddress } }); } catch(e) { res.json({ usdtBalance: 0, crystalBalance: 0, addresses: {} }); } });
app.post('/api/deposit', async (req, res) => { try { const { user_id, amount, network } = req.body; if (!user_id || !amount || !network) return res.json({ success: false, message: '⚠️ جميع الحقول مطلوبة' }); if (!['bnb', 'polygon'].includes(network)) return res.json({ success: false, message: '⚠️ فقط BNB و Polygon' }); const result = await db.requestDeposit(parseInt(user_id), parseFloat(amount), 'USDT', network); res.json(result); } catch(e) { res.json({ success: false, message: '❌ حدث خطأ' }); } });
app.post('/api/withdraw', async (req, res) => { try { const { user_id, amount, network, address, twofa_code } = req.body; if (!user_id || !amount || !network || !address) return res.json({ success: false, message: '⚠️ جميع الحقول مطلوبة' }); if (!['bnb', 'polygon'].includes(network)) return res.json({ success: false, message: '⚠️ فقط BNB و Polygon' }); const result = await db.requestWithdraw(parseInt(user_id), parseFloat(amount), 'USDT', network, address, twofa_code); res.json(result); } catch(e) { res.json({ success: false, message: '❌ حدث خطأ' }); } });
app.get('/api/kyc/status/:userId', async (req, res) => { try { const status = await db.getKycStatus(parseInt(req.params.userId)); res.json(status); } catch(e) { res.json({ status: 'not_submitted' }); } });

// ✅ KYC Submit - إرسال الصور لتليجرام وحفظ file_id
app.post('/api/kyc/submit', upload.fields([{ name: 'passportPhoto', maxCount: 1 }, { name: 'personalPhoto', maxCount: 1 }]), async (req, res) => {
    try {
        const { user_id, fullName } = req.body;
        if (!user_id || !fullName) return res.json({ success: false, message: '⚠️ البيانات مطلوبة' });
        
        const userId = parseInt(user_id);
        if (!req.files?.passportPhoto?.[0] || !req.files?.personalPhoto?.[0]) {
            return res.json({ success: false, message: '⚠️ يجب رفع الصورتين' });
        }
        
        let passportFileId = null, personalFileId = null;
        
        if (global.botInstance) {
            try {
                const msg1 = await global.botInstance.telegram.sendPhoto(
                    ADMIN_IDS[0], { source: req.files.passportPhoto[0].buffer },
                    { caption: `📄 صورة الهوية - ${fullName} (${userId})\n\nاختر الإجراء:`, ...Markup.inlineKeyboard([[Markup.button.callback('✅ قبول', `appkyc_${userId}`), Markup.button.callback('❌ رفض', `rejkyc_${userId}`)]]) }
                );
                passportFileId = msg1.photo[msg1.photo.length - 1].file_id;
                
                const msg2 = await global.botInstance.telegram.sendPhoto(
                    ADMIN_IDS[0], { source: req.files.personalPhoto[0].buffer },
                    { caption: `📸 صورة شخصية - ${fullName} (${userId})` }
                );
                personalFileId = msg2.photo[msg2.photo.length - 1].file_id;
            } catch(e) {}
        }
        
        const KycRequest = require('./models').KycRequest;
        await KycRequest.deleteOne({ userId, status: { $in: ['pending', 'rejected'] } });
        await KycRequest.create({ userId, fullName, passportPhotoFileId: passportFileId || 'pending', personalPhotoFileId: personalFileId || 'pending', status: 'pending', createdAt: new Date() });
        
        res.json({ success: true, message: '✅ تم إرسال طلب التوثيق!' });
    } catch(e) { res.json({ success: false, message: '❌ حدث خطأ' }); }
});

app.get('/api/user/referral/:userId', async (req, res) => { try { const data = await db.getReferralData(parseInt(req.params.userId)); res.json(data); } catch(e) { res.json({ referralCount: 0, referralEarnings: 0 }); } });
app.post('/api/referral/transfer', async (req, res) => { try { const result = await db.transferReferralEarningsToWallet(parseInt(req.body.user_id)); res.json(result); } catch(e) { res.json({ success: false, message: '❌ حدث خطأ' }); } });
app.get('/api/chat/global', async (req, res) => { try { const messages = await db.getGlobalMessages(50); res.json(messages || []); } catch(e) { res.json([]); } });
app.post('/api/chat/send', async (req, res) => { try { const result = await db.sendMessage(parseInt(req.body.senderId), null, req.body.message); res.json({ success: true, message: result }); } catch(e) { res.json({ success: false, message: '❌ حدث خطأ' }); } });
app.post('/api/2fa/generate', async (req, res) => { try { const result = await db.generate2FASecret(parseInt(req.body.user_id)); res.json(result); } catch(e) { res.json({ success: false, message: '❌ حدث خطأ' }); } });
app.post('/api/2fa/enable', async (req, res) => { try { const result = await db.enable2FA(parseInt(req.body.user_id), req.body.code); res.json(result); } catch(e) { res.json({ success: false, message: '❌ حدث خطأ' }); } });
app.post('/api/2fa/disable', async (req, res) => { try { const result = await db.disable2FA(parseInt(req.body.user_id), req.body.code); res.json(result); } catch(e) { res.json({ success: false, message: '❌ حدث خطأ' }); } });
app.get('/api/supply', async (req, res) => { try { const sc = await db.validateTotalSupply(); res.json({ success: true, ...sc }); } catch(e) { res.json({ success: true, totalSupply: 5000000 }); } });

app.post('/api/channel/check', async (req, res) => {
    try { const { user_id } = req.body; if (!user_id) return res.json({ success: false, message: '⚠️ معرف المستخدم مطلوب' }); const userId = parseInt(user_id); const user = await db.getUser(userId); if (!user || !user.isVerified) return res.json({ success: false, message: '⚠️ يجب توثيق حسابك أولاً!', subscribed: false, needKyc: true }); const result = await db.giveChannelReward(userId); res.json({ ...result, subscribed: true }); } catch(e) { res.json({ success: false, message: '❌ حدث خطأ' }); }
});

app.use((err, req, res, next) => { console.error('❌', err.message); res.status(500).json({ success: false, message: '❌ خطأ في الخادم' }); });

// ========== بوت ==========
const bot = new Telegraf(process.env.BOT_TOKEN);
global.botInstance = bot;
module.exports.bot = bot;

bot.start(async (ctx) => {
    try {
        const user = ctx.from;
        const result = await db.registerUser(user.id, user.username || '', user.first_name || '', '', '', '', 'SD', '', ctx.startPayload ? parseInt(ctx.startPayload) : null, 'ar');
        const price = await db.getMarketPrice();
        const sc = await db.validateTotalSupply();
        let msg;
        if (result.isAdmin) msg = `👑 أهلاً بالأدمن!\n\n📦 رصيدك: ${(sc.adminBalance || 5000000).toLocaleString()} CRYSTAL\n💰 السعر: ${price} USDT`;
        else if (result.isNew) msg = `🎉 أهلاً بك في CRYSTAL Exchange!\n\n✨ تم إنشاء حسابك\n💰 السعر: ${price} USDT\n\n💡 للبدء:\n1️⃣ وثق حسابك\n2️⃣ أودع USDT\n3️⃣ ابدأ التداول`;
        else msg = `👋 أهلاً بعودتك ${user.first_name}!\n\n💰 السعر: ${price} USDT`;
        await ctx.reply(msg, Markup.inlineKeyboard([[Markup.button.webApp('💎 فتح منصة التداول', WEBAPP_URL)], [Markup.button.url('📢 قناتنا', CHANNEL_LINK)]]));
    } catch(e) { await ctx.reply('👋 أهلاً بك في CRYSTAL Exchange!\n\n💰 منصة تداول عملة الكريستال\n\nاضغط على الزر للبدء:', Markup.inlineKeyboard([[Markup.button.webApp('💎 فتح منصة التداول', WEBAPP_URL)]])).catch(() => {}); }
});

bot.command('help', async (ctx) => { let t = '📚 /start /price /balance /stats /supply /orders /buy /sell /cancel /referral /reward'; if (isAdmin(ctx.from.id)) t += '\n\n👑 /admin /admin_balance /kyc_list /pending /fix /maintenance /ban /unban'; await ctx.reply(t); });
bot.command('price', async (ctx) => { try { await ctx.reply(`💎 ${await db.getMarketPrice()} USDT`); } catch(e) {} });
bot.command('supply', async (ctx) => { try { const sc = await db.validateTotalSupply(); await ctx.reply(`📊 العرض: ${sc.totalSupply.toLocaleString()}\n🔄 متداول: ${sc.circulating.toFixed(2)}\n👑 أدمن: ${sc.adminBalance.toFixed(2)}`); } catch(e) {} });
bot.command('balance', async (ctx) => { try { const s = await db.getUserStats(ctx.from.id); if (!s) return ctx.reply('⚠️ /start أولاً'); await ctx.reply(`💰 CRYSTAL: ${(s.crystalBalance||0).toFixed(2)}\n💵 USDT: ${(s.usdtBalance||0).toFixed(2)}`); } catch(e) {} });
bot.command('stats', async (ctx) => { try { const s = await db.getMarketStats(); await ctx.reply(`📊 💎${s.price} 📈${(s.change24h||0).toFixed(2)}% 🟢${s.buyOrders} 🔴${s.sellOrders}`); } catch(e) {} });
bot.command('referral', async (ctx) => { try { const d = await db.getReferralData(ctx.from.id); await ctx.reply(`👥 ${d.referralCount} | 💰 ${(d.referralEarnings||0).toFixed(2)}\n🔗 ${d.referralLink}`); } catch(e) {} });
bot.command('buy', async (ctx) => { try { const a = ctx.message.text.split(' '); if (a.length<3) return ctx.reply('/buy [سعر] [كمية]'); await ctx.reply((await db.createOrder(ctx.from.id, 'buy', parseFloat(a[1]), parseFloat(a[2]))).message); } catch(e) {} });
bot.command('sell', async (ctx) => { try { const a = ctx.message.text.split(' '); if (a.length<3) return ctx.reply('/sell [سعر] [كمية]'); await ctx.reply((await db.createOrder(ctx.from.id, 'sell', parseFloat(a[1]), parseFloat(a[2]))).message); } catch(e) {} });
bot.command('cancel', async (ctx) => { try { const oid = ctx.message.text.split(' ')[1]; if (!oid) return ctx.reply('/cancel [رقم]'); await ctx.reply((await db.cancelOrder(oid, ctx.from.id)).message); } catch(e) {} });
bot.command('orders', async (ctx) => { try { const buys = await db.getActiveOrders('buy', 5), sells = await db.getActiveOrders('sell', 5); let t = '📊 شراء:\n'; for (const o of buys.slice(0,5)) t += `💰${o.price} 📦${(o.amount||0).toFixed(2)}\n`; t += '\n📊 بيع:\n'; for (const o of sells.slice(0,5)) t += `💰${o.price} 📦${(o.amount||0).toFixed(2)}\n`; await ctx.reply(t); } catch(e) {} });

// ========== أدمن ==========
bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('⛔');
    const kyc = await db.getPendingKycRequests(), w = await db.getPendingWithdraws();
    await ctx.reply(
        `👑 لوحة الأدمن\n\n🆔 توثيق: ${kyc.length}\n💰 سحب: ${w.length}\n\n📸 استخدم /kyc_list لعرض الصور`,
        Markup.inlineKeyboard([
            [Markup.button.callback(`🆔 توثيق (${kyc.length})`, 'admin_kyc')],
            [Markup.button.callback(`💰 سحب (${w.length})`, 'admin_withdraws')]
        ])
    );
});

bot.command('admin_balance', async (ctx) => { if (!isAdmin(ctx.from.id)) return; const b = await db.getAdminBalance(ctx.from.id); await ctx.reply(`👑 CRYSTAL: ${b.crystalBalance.toLocaleString()}\n💵 USDT: ${b.usdtBalance.toFixed(2)}`); });

// ✅ KYC List
bot.command('kyc_list', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('⛔');
    const pending = await db.getPendingKycRequests();
    if (!pending.length) return ctx.reply('📭 لا توجد طلبات توثيق');
    
    await ctx.reply(`🆔 ${pending.length} طلبات توثيق\n📸 جاري عرض الصور...`);
    
    for (const req of pending) {
        if (req.passportPhotoFileId && req.passportPhotoFileId !== 'pending') {
            try {
                await ctx.replyWithPhoto(req.passportPhotoFileId, {
                    caption: `📄 صورة الهوية - ${req.fullName} (${req.userId})`,
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('✅ قبول', `appkyc_${req.userId}`), Markup.button.callback('❌ رفض', `rejkyc_${req.userId}`)]
                    ])
                });
            } catch(e) {
                await ctx.reply(`📄 صورة هوية ${req.fullName} - غير متوفرة\nاستخدم: /appkyc_${req.userId} أو /rejkyc_${req.userId}`);
            }
        } else {
            await ctx.reply(`⚠️ ${req.fullName} (${req.userId}) - الصور لم تصل\nاستخدم: /appkyc_${req.userId} أو /rejkyc_${req.userId}`);
        }
        
        if (req.personalPhotoFileId && req.personalPhotoFileId !== 'pending') {
            try { await ctx.replyWithPhoto(req.personalPhotoFileId, { caption: `📸 صورة شخصية - ${req.fullName}` }); } catch(e) {}
        }
    }
});

bot.command('pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('⛔');
    const w = await db.getPendingWithdraws();
    if (!w.length) return ctx.reply('📭 لا توجد طلبات سحب');
    for (const r of w) {
        await ctx.reply(`💰 طلب سحب\n👤 ${r.userId}\n💰 ${r.amount} USDT\n🌐 ${r.network}\n📤 ${(r.address||'').slice(0,25)}...`,
            Markup.inlineKeyboard([[Markup.button.callback('✅ تأكيد وإرسال', `confirm_withdraw_${r._id}`)]])
        );
    }
});

bot.command('fix', async (ctx) => { if (!isAdmin(ctx.from.id)) return; await ctx.reply(`🔧 ${await db.fixStuckOrders()} أوامر`); });
bot.command('maintenance', async (ctx) => { if (!isAdmin(ctx.from.id)) return; const orders = await require('./models').Order.find({ status: { $in: ['open', 'partial'] } }); for (const o of orders) await db.cancelOrder(o._id, o.userId); await ctx.reply(`✅ ${orders.length} أمر`); });
bot.command('ban', async (ctx) => { if (!isAdmin(ctx.from.id)) return; const a = ctx.message.text.split(' '); await ctx.reply((await db.banUser(parseInt(a[1]), a.slice(2).join(' ')||'مخالفة')).message); });
bot.command('unban', async (ctx) => { if (!isAdmin(ctx.from.id)) return; await ctx.reply((await db.unbanUser(parseInt(ctx.message.text.split(' ')[1]))).message); });

// ✅ أوامر القبول والرفض
bot.command(/appkyc_(.+)/, async (ctx) => {
    const userId = parseInt(ctx.message.text.split('_')[1]);
    if (!isAdmin(ctx.from.id)) return;
    try {
        const KycRequest = require('./models').KycRequest;
        const request = await KycRequest.findOne({ userId, status: 'pending' });
        if (!request) return ctx.reply('⚠️ لا يوجد طلب معلق');
        const result = await db.approveKyc(request._id, ctx.from.id);
        await ctx.reply(`✅ ${result.message}\n👤 ${userId}`);
        if (global.botInstance) { try { await global.botInstance.telegram.sendMessage(userId, '🎉 تم توثيق حسابك! ✅ (+100 CRYSTAL)'); } catch(e) {} }
    } catch(e) { await ctx.reply('❌ حدث خطأ'); }
});

bot.command(/rejkyc_(.+)/, async (ctx) => {
    const userId = parseInt(ctx.message.text.split('_')[1]);
    if (!isAdmin(ctx.from.id)) return;
    try {
        const KycRequest = require('./models').KycRequest;
        const request = await KycRequest.findOne({ userId, status: 'pending' });
        if (!request) return ctx.reply('⚠️ لا يوجد طلب معلق');
        await db.rejectKyc(request._id, ctx.from.id, 'صور غير واضحة');
        await ctx.reply(`❌ تم الرفض\n👤 ${userId}`);
        if (global.botInstance) { try { await global.botInstance.telegram.sendMessage(userId, '⚠️ تم رفض التوثيق - أعد الإرسال'); } catch(e) {} }
    } catch(e) { await ctx.reply('❌ حدث خطأ'); }
});

// ========== Callbacks ==========
bot.action('admin_kyc', async (ctx) => { await ctx.answerCbQuery(); await ctx.reply('📸 استخدم /kyc_list لعرض الصور'); });
bot.action('admin_withdraws', async (ctx) => { await ctx.answerCbQuery(); const p = await db.getPendingWithdraws(); for (const r of p.slice(0,5)) await ctx.reply(`💰 ${r.amount} USDT | 👤 ${r.userId}`, Markup.inlineKeyboard([[Markup.button.callback('✅ إرسال', `confirm_withdraw_${r._id}`)]])); });

// ✅ أزرار القبول والرفض
bot.action(/appkyc_(.+)/, async (ctx) => {
    const userId = parseInt(ctx.match[1]);
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔');
    await ctx.answerCbQuery('⏳ جاري الموافقة...');
    try {
        const KycRequest = require('./models').KycRequest;
        const request = await KycRequest.findOne({ userId, status: 'pending' });
        if (!request) { await ctx.reply('⚠️ الطلب غير موجود'); return; }
        const result = await db.approveKyc(request._id, ctx.from.id);
        await ctx.editMessageCaption({ caption: `✅ تمت الموافقة - ${request.fullName}\n🎁 +100 CRYSTAL` });
        if (global.botInstance) { try { await global.botInstance.telegram.sendMessage(userId, '🎉 تم توثيق حسابك! ✅ (+100 CRYSTAL)'); } catch(e) {} }
    } catch(e) { await ctx.reply('❌ حدث خطأ'); }
});

bot.action(/rejkyc_(.+)/, async (ctx) => {
    const userId = parseInt(ctx.match[1]);
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔');
    await ctx.answerCbQuery('⏳ جاري الرفض...');
    try {
        const KycRequest = require('./models').KycRequest;
        const request = await KycRequest.findOne({ userId, status: 'pending' });
        if (!request) { await ctx.reply('⚠️ الطلب غير موجود'); return; }
        await db.rejectKyc(request._id, ctx.from.id, 'صور غير واضحة');
        await ctx.editMessageCaption({ caption: `❌ تم الرفض - ${request.fullName}` });
        if (global.botInstance) { try { await global.botInstance.telegram.sendMessage(userId, '⚠️ تم رفض التوثيق - أعد الإرسال'); } catch(e) {} }
    } catch(e) { await ctx.reply('❌ حدث خطأ'); }
});

bot.action(/confirm_withdraw_(.+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔');
    await ctx.answerCbQuery('⏳ جاري الإرسال...');
    const result = await db.confirmWithdraw(ctx.match[1], '', ctx.from.id);
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.reply(result.message);
});

bot.catch((err, ctx) => console.error(`❌ Bot error:`, err.message));

// ========== تشغيل ==========
const server = app.listen(PORT, '0.0.0.0', () => { console.log(`🌐 Server on port ${PORT}`); });

(async () => {
    try {
        await db.connect(); console.log('✅ Database connected');
        await db.startFakePriceMovement(); console.log('📊 Fake price started');
        blockchainMonitor.startMonitoring(db); console.log('🔍 Blockchain monitor started');
        await bot.telegram.deleteWebhook();
        const webhookUrl = `${WEBAPP_URL}/webhook`;
        await bot.telegram.setWebhook(webhookUrl); console.log(`✅ Webhook: ${webhookUrl}`);
        app.use(bot.webhookCallback('/webhook'));
        console.log(`✅ Bot @${(await bot.telegram.getMe()).username} ready`);
        console.log('🚀 CRYSTAL Exchange is running!');
    } catch(e) { console.error('❌ Startup:', e.message); try { await bot.telegram.deleteWebhook(); bot.launch(); } catch(e) {} }
})();

process.once('SIGINT', async () => { await db.stopFakePriceMovement(); await bot.telegram.deleteWebhook(); bot.stop('SIGINT'); server.close(); process.exit(0); });
process.once('SIGTERM', async () => { await db.stopFakePriceMovement(); await bot.telegram.deleteWebhook(); bot.stop('SIGTERM'); server.close(); process.exit(0); });
