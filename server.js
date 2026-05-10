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

function isAdmin(userId) {
    return ADMIN_IDS.includes(parseInt(userId));
}

app.use((req, res, next) => {
    console.log(`📡 ${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'mining-app', 'index.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'mining-app', 'terms.html')));

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
    try { const wallet = await db.getUserWallet(parseInt(req.params.userId)); res.json({ usdtBalance: wallet.usdtBalance || 0, crystalBalance: wallet.crystalBalance || 0, addresses: { bnb: wallet.bnbAddress, polygon: wallet.polygonAddress } }); } catch(e) { res.json({ usdtBalance: 0, crystalBalance: 0, addresses: {} }); }
});

app.post('/api/deposit', async (req, res) => {
    try {
        const { user_id, amount, network } = req.body;
        if (!user_id || !amount || !network) return res.json({ success: false, message: '⚠️ جميع الحقول مطلوبة' });
        if (!['bnb', 'polygon'].includes(network)) return res.json({ success: false, message: '⚠️ فقط BNB و Polygon' });
        const result = await db.requestDeposit(parseInt(user_id), parseFloat(amount), 'USDT', network);
        res.json(result);
    } catch(e) { res.json({ success: false, message: '❌ حدث خطأ' }); }
});

app.post('/api/withdraw', async (req, res) => {
    try {
        const { user_id, amount, network, address, twofa_code } = req.body;
        if (!user_id || !amount || !network || !address) return res.json({ success: false, message: '⚠️ جميع الحقول مطلوبة' });
        if (!['bnb', 'polygon'].includes(network)) return res.json({ success: false, message: '⚠️ فقط BNB و Polygon' });
        const result = await db.requestWithdraw(parseInt(user_id), parseFloat(amount), 'USDT', network, address, twofa_code);
        res.json(result);
    } catch(e) { res.json({ success: false, message: '❌ حدث خطأ' }); }
});

app.get('/api/kyc/status/:userId', async (req, res) => {
    try { const status = await db.getKycStatus(parseInt(req.params.userId)); res.json(status); } catch(e) { res.json({ status: 'not_submitted' }); }
});

// ✅ KYC Submit - إرسال مباشر للأدمن وحفظ file_id فقط
app.post('/api/kyc/submit', upload.fields([{ name: 'passportPhoto', maxCount: 1 }, { name: 'personalPhoto', maxCount: 1 }]), async (req, res) => {
    try {
        const { user_id, fullName } = req.body;
        if (!user_id || !fullName) return res.json({ success: false, message: '⚠️ البيانات مطلوبة' });
        
        const userId = parseInt(user_id);
        
        if (!req.files?.passportPhoto?.[0] || !req.files?.personalPhoto?.[0]) {
            return res.json({ success: false, message: '⚠️ يجب رفع الصورتين' });
        }
        
        let passportFileId = null;
        let personalFileId = null;
        let sentToAdmin = false;
        
        // ✅ إرسال الصور مباشرة للأدمن في تيليجرام
        if (global.botInstance) {
            try {
                // صورة الهوية مع أزرار
                const msg1 = await global.botInstance.telegram.sendPhoto(
                    ADMIN_IDS[0],
                    { source: req.files.passportPhoto[0].buffer },
                    {
                        caption: `📄 *صورة الهوية*\n👤 ${fullName}\n🆔 \`${userId}\`\n📅 ${new Date().toLocaleString('ar-SA')}\n\nاختر الإجراء:`,
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('✅ قبول', `approve_kyc_user_${userId}`),
                             Markup.button.callback('❌ رفض', `reject_kyc_user_${userId}`)]
                        ])
                    }
                );
                passportFileId = msg1.photo[msg1.photo.length - 1].file_id;
                
                // الصورة الشخصية
                const msg2 = await global.botInstance.telegram.sendPhoto(
                    ADMIN_IDS[0],
                    { source: req.files.personalPhoto[0].buffer },
                    { caption: `📸 *صورة شخصية*\n👤 ${fullName}\n🆔 \`${userId}\``, parse_mode: 'Markdown' }
                );
                personalFileId = msg2.photo[msg2.photo.length - 1].file_id;
                
                sentToAdmin = true;
                console.log(`✅ صور KYC أرسلت للأدمن: ${userId} - ${fullName}`);
            } catch(e) {
                console.error('KYC send to admin error:', e.message);
            }
        }
        
        // ✅ حفظ الطلب مع file_id فقط (بدون base64)
        const result = await db.createKycRequest(
            userId, fullName, 'N/A', 'N/A', 'N/A', '', 'SD', '',
            passportFileId, personalFileId, '', '', ''
        );
        
        res.json({ 
            success: true, 
            message: sentToAdmin ? '✅ تم إرسال طلب التوثيق بنجاح!' : '✅ تم إرسال الطلب (قد يتأخر ظهور الصور)'
        });
    } catch(e) { 
        console.error('KYC submit error:', e.message);
        res.json({ success: false, message: '❌ حدث خطأ' }); 
    }
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

app.post('/api/channel/check', async (req, res) => {
    try {
        const { user_id } = req.body;
        if (!user_id) return res.json({ success: false, message: '⚠️ معرف المستخدم مطلوب' });
        const userId = parseInt(user_id);
        const user = await db.getUser(userId);
        if (!user || !user.isVerified) return res.json({ success: false, message: '⚠️ يجب توثيق حسابك أولاً!', subscribed: false, needKyc: true });
        let isSubscribed = false;
        try { const CHANNEL_ID = process.env.CHANNEL_ID || '-100xxxxxxxxxx'; const chatMember = await bot.telegram.getChatMember(CHANNEL_ID, userId); isSubscribed = ['member', 'administrator', 'creator'].includes(chatMember.status); } catch(e) { return res.json({ success: false, message: '⚠️ تعذر التحقق' }); }
        if (!isSubscribed) return res.json({ success: false, message: '⚠️ لم تشترك بعد!', subscribed: false });
        const result = await db.giveChannelReward(userId);
        res.json({ ...result, subscribed: true });
    } catch(e) { res.json({ success: false, message: '❌ حدث خطأ' }); }
});

app.use((err, req, res, next) => { console.error('❌', err.message); res.status(500).json({ success: false, message: '❌ خطأ في الخادم' }); });

// ========== بوت ==========
const bot = new Telegraf(process.env.BOT_TOKEN);
global.botInstance = bot;
module.exports.bot = bot;

// ========== أوامر ==========

bot.start(async (ctx) => {
    try {
        const user = ctx.from;
        const referrer = ctx.startPayload ? parseInt(ctx.startPayload) : null;
        const result = await db.registerUser(user.id, user.username || '', user.first_name || '', '', '', '', 'SD', '', referrer, 'ar');
        const price = await db.getMarketPrice();
        const sc = await db.validateTotalSupply();
        let msg;
        if (result.isAdmin) msg = `👑 *أهلاً بالأدمن!*\n\n📦 رصيدك: ${sc.adminBalance?.toLocaleString() || '5,000,000'} CRYSTAL\n💰 السعر: ${price} USDT`;
        else if (result.isNew) msg = `🎉 *أهلاً بك في CRYSTAL Exchange!*\n\n✨ تم إنشاء حسابك\n💰 السعر: ${price} USDT\n\n💡 *للبدء:*\n1️⃣ وثق حسابك\n2️⃣ أودع USDT\n3️⃣ ابدأ التداول`;
        else msg = `👋 *أهلاً بعودتك ${user.first_name}!*\n\n💰 السعر: ${price} USDT`;
        await ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.webApp('💎 فتح منصة التداول', WEBAPP_URL)], [Markup.button.url('📢 قناتنا', CHANNEL_LINK)]]) });
    } catch(e) { await ctx.reply('👋 *أهلاً بك في CRYSTAL Exchange!*\n\n💰 منصة تداول عملة الكريستال\n\nاضغط على الزر للبدء:', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.webApp('💎 فتح منصة التداول', WEBAPP_URL)]]) }).catch(() => {}); }
});

bot.command('help', async (ctx) => { let t = '📚 /start /price /balance /stats /supply /orders /buy /sell /cancel /referral /reward'; if (isAdmin(ctx.from.id)) t += '\n\n👑 /admin /admin_balance /kyc_list /pending /fix /maintenance /ban /unban'; await ctx.reply(t, { parse_mode: 'Markdown' }); });
bot.command('price', async (ctx) => { try { const p = await db.getMarketPrice(); await ctx.reply(`💎 ${p} USDT`); } catch(e) {} });
bot.command('supply', async (ctx) => { try { const sc = await db.validateTotalSupply(); await ctx.reply(`📊 ${sc.totalSupply.toLocaleString()} | 🔄 ${sc.circulating.toFixed(2)} | 👑 ${sc.adminBalance.toFixed(2)}`); } catch(e) {} });
bot.command('balance', async (ctx) => { try { const s = await db.getUserStats(ctx.from.id); if (!s) return ctx.reply('⚠️ /start أولاً'); await ctx.reply(`💰 CRYSTAL: ${s.crystalBalance?.toFixed(2)||0}\n💵 USDT: ${s.usdtBalance?.toFixed(2)||0}`); } catch(e) {} });
bot.command('stats', async (ctx) => { try { const s = await db.getMarketStats(); await ctx.reply(`📊 💎${s.price} 📈${s.change24h?.toFixed(2)||0}%`); } catch(e) {} });
bot.command('referral', async (ctx) => { try { const d = await db.getReferralData(ctx.from.id); await ctx.reply(`👥${d.referralCount} 💰${(d.referralEarnings||0).toFixed(2)}\n🔗${d.referralLink}`); } catch(e) {} });
bot.command('buy', async (ctx) => { try { const a = ctx.message.text.split(' '); if (a.length<3) return ctx.reply('/buy [سعر] [كمية]'); const r = await db.createOrder(ctx.from.id, 'buy', parseFloat(a[1]), parseFloat(a[2])); await ctx.reply(r.message); } catch(e) {} });
bot.command('sell', async (ctx) => { try { const a = ctx.message.text.split(' '); if (a.length<3) return ctx.reply('/sell [سعر] [كمية]'); const r = await db.createOrder(ctx.from.id, 'sell', parseFloat(a[1]), parseFloat(a[2])); await ctx.reply(r.message); } catch(e) {} });
bot.command('cancel', async (ctx) => { try { const oid = ctx.message.text.split(' ')[1]; if (!oid) return ctx.reply('/cancel [رقم]'); const r = await db.cancelOrder(oid, ctx.from.id); await ctx.reply(r.message); } catch(e) {} });
bot.command('orders', async (ctx) => { try { const buys = await db.getActiveOrders('buy', 5), sells = await db.getActiveOrders('sell', 5); let t = '📊 *شراء:*\n'; for (const o of buys.slice(0,5)) t += `💰${o.price} 📦${o.amount?.toFixed(2)}\n`; t += '\n📊 *بيع:*\n'; for (const o of sells.slice(0,5)) t += `💰${o.price} 📦${o.amount?.toFixed(2)}\n`; await ctx.reply(t, { parse_mode: 'Markdown' }); } catch(e) {} });

// ========== أدمن ==========

bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('⛔');
    const kyc = await db.getPendingKycRequests(), w = await db.getPendingWithdraws();
    await ctx.reply(`👑 *لوحة الأدمن*\n🆔 توثيق: ${kyc.length}\n💰 سحب: ${w.length}\n\nℹ️ الإيداع تلقائي\n📸 الصور تصل مباشرة عند طلب التوثيق`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback(`🆔 توثيق (${kyc.length})`, 'admin_kyc')],
            [Markup.button.callback(`💰 سحب (${w.length})`, 'admin_withdraws')]
        ])
    });
});

bot.command('admin_balance', async (ctx) => { if (!isAdmin(ctx.from.id)) return; const b = await db.getAdminBalance(ctx.from.id); await ctx.reply(`👑 CRYSTAL: ${b.crystalBalance.toLocaleString()}\n💵 USDT: ${b.usdtBalance.toFixed(2)}`); });

bot.command('kyc_list', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('⛔');
    const pending = await db.getPendingKycRequests();
    if (!pending.length) return ctx.reply('📭 لا توجد طلبات');
    await ctx.reply(`🆔 *${pending.length} طلبات توثيق*\n\n📸 *الصور تصل مباشرة في المحادثة*\n👆 *تفقد المحادثة أعلاه* للعثور على الصور والأزرار`, { parse_mode: 'Markdown' });
});

bot.command('pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('⛔');
    const w = await db.getPendingWithdraws();
    if (!w.length) return ctx.reply('📭 لا توجد طلبات سحب\n\nℹ️ الإيداع تلقائي', { parse_mode: 'Markdown' });
    for (const r of w) {
        await ctx.reply(`💰 *طلب سحب*\n👤 \`${r.userId}\`\n💰 ${r.amount} USDT\n🌐 ${r.network}\n📤 \`${r.address?.slice(0,25)}...\``, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('✅ تأكيد وإرسال', `confirm_withdraw_${r._id}`)]])
        });
    }
});

bot.command('fix', async (ctx) => { if (!isAdmin(ctx.from.id)) return; await ctx.reply(`🔧 ${await db.fixStuckOrders()} أوامر`); });
bot.command('maintenance', async (ctx) => { if (!isAdmin(ctx.from.id)) return; const orders = await require('./models').Order.find({ status: { $in: ['open', 'partial'] } }); for (const o of orders) await db.cancelOrder(o._id, o.userId); await ctx.reply(`✅ ${orders.length} أمر`); });
bot.command('ban', async (ctx) => { if (!isAdmin(ctx.from.id)) return; const a = ctx.message.text.split(' '); await ctx.reply((await db.banUser(parseInt(a[1]), a.slice(2).join(' ')||'مخالفة')).message); });
bot.command('unban', async (ctx) => { if (!isAdmin(ctx.from.id)) return; await ctx.reply((await db.unbanUser(parseInt(ctx.message.text.split(' ')[1]))).message); });

// ========== Callbacks ==========

bot.action('admin_kyc', async (ctx) => {
    await ctx.answerCbQuery();
    const p = await db.getPendingKycRequests();
    if (!p.length) return ctx.reply('📭 لا توجد طلبات');
    await ctx.reply('📸 *الصور تصل مباشرة في المحادثة*\n👆 *تفقد المحادثة أعلاه*', { parse_mode: 'Markdown' });
});

bot.action('admin_withdraws', async (ctx) => {
    await ctx.answerCbQuery();
    const p = await db.getPendingWithdraws();
    for (const r of p.slice(0,5)) {
        await ctx.reply(`💰 ${r.amount} USDT | 👤 ${r.userId}`, 
            Markup.inlineKeyboard([[Markup.button.callback('✅ إرسال', `confirm_withdraw_${r._id}`)]])
        );
    }
});

// ✅ قبول KYC
bot.action(/approve_kyc_user_(.+)/, async (ctx) => {
    const userId = parseInt(ctx.match[1]);
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔');
    await ctx.answerCbQuery('⏳ جاري الموافقة...');
    
    try {
        const KycRequest = require('./models').KycRequest;
        const request = await KycRequest.findOne({ userId, status: 'pending' });
        if (!request) { await ctx.reply('⚠️ الطلب غير موجود أو تم معالجته'); return; }
        
        const result = await db.approveKyc(request._id, ctx.from.id);
        
        // تحديث الكابشن
        try { await ctx.editMessageCaption({ caption: `✅ *تمت الموافقة*\n👤 ${request.fullName}\n🆔 \`${userId}\`\n🎁 +100 CRYSTAL`, parse_mode: 'Markdown' }); } catch(e) {}
        
        await ctx.reply(`✅ ${result.message}`);
        
        if (global.botInstance) {
            try { await global.botInstance.telegram.sendMessage(userId, '🎉 *تم توثيق حسابك!*\n✅ يمكنك الآن التداول\n🎁 +100 CRYSTAL مكافأة', { parse_mode: 'Markdown' }); } catch(e) {}
        }
    } catch(e) { await ctx.reply('❌ حدث خطأ'); }
});

// ✅ رفض KYC
bot.action(/reject_kyc_user_(.+)/, async (ctx) => {
    const userId = parseInt(ctx.match[1]);
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔');
    await ctx.answerCbQuery('⏳ جاري الرفض...');
    
    try {
        const KycRequest = require('./models').KycRequest;
        const request = await KycRequest.findOne({ userId, status: 'pending' });
        if (!request) { await ctx.reply('⚠️ الطلب غير موجود'); return; }
        
        const result = await db.rejectKyc(request._id, ctx.from.id, 'الصور غير واضحة - أعد الإرسال');
        
        try { await ctx.editMessageCaption({ caption: `❌ *تم الرفض*\n👤 ${request.fullName}\n🆔 \`${userId}\``, parse_mode: 'Markdown' }); } catch(e) {}
        
        if (global.botInstance) {
            try { await global.botInstance.telegram.sendMessage(userId, '⚠️ *تم رفض طلب التوثيق*\nالسبب: الصور غير واضحة\n📸 يرجى إعادة الإرسال', { parse_mode: 'Markdown' }); } catch(e) {}
        }
    } catch(e) { await ctx.reply('❌ حدث خطأ'); }
});

// ✅ تأكيد السحب
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
