require('dotenv').config();
const express = require('express');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');
const cors = require('cors');
const db = require('./database');

// ========== إعدادات السيرفر ==========
const app = express();
const PORT = process.env.PORT || 10000;

// ========== إعدادات البوت ==========
const bot = new Telegraf(process.env.BOT_TOKEN);
const WEBHOOK_PATH = `/webhook/${process.env.BOT_TOKEN ? process.env.BOT_TOKEN.split(':')[1] : 'secret'}`;
const WEBAPP_URL = process.env.WEBAPP_URL || `https://${process.env.RENDER_EXTERNAL_URL || 'localhost'}`;
const ADMIN_IDS = (process.env.ADMIN_IDS || '6701743450').split(',').map(Number);

function isAdmin(userId) {
    return ADMIN_IDS.includes(parseInt(userId));
}

// ========== إعدادات Express ==========
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ========== مسارات API ==========

// السوق
app.get('/api/market/price', async (req, res) => {
    try {
        const price = await db.getMarketPrice();
        res.json({ price });
    } catch(e) { res.json({ price: 0.002 }); }
});

app.get('/api/market/stats', async (req, res) => {
    try {
        const stats = await db.getMarketStats();
        res.json(stats);
    } catch(e) { res.json({}); }
});

app.get('/api/market/candles/:timeframe', async (req, res) => {
    try {
        const candles = await db.getCandlesticks(req.params.timeframe, parseInt(req.query.limit) || 100);
        res.json(candles);
    } catch(e) { res.json([]); }
});

// الأوامر
app.get('/api/orders', async (req, res) => {
    try {
        const orders = await db.getActiveOrders(req.query.type, parseInt(req.query.limit) || 50);
        res.json(orders);
    } catch(e) { res.json({ orders: [] }); }
});

app.get('/api/orders/:userId', async (req, res) => {
    try {
        const orders = await db.getUserOrders(parseInt(req.params.userId));
        res.json(orders);
    } catch(e) { res.json([]); }
});

app.post('/api/order/create', async (req, res) => {
    try {
        const { user_id, type, price, amount } = req.body;
        const result = await db.createOrder(parseInt(user_id), type, parseFloat(price), parseFloat(amount));
        res.json(result);
    } catch(e) { res.json({ success: false, message: e.message }); }
});

app.post('/api/order/cancel', async (req, res) => {
    try {
        const { order_id, user_id } = req.body;
        const result = await db.cancelOrder(order_id, parseInt(user_id));
        res.json(result);
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// المستخدم
app.get('/api/user/:userId', async (req, res) => {
    try {
        const stats = await db.getUserStats(parseInt(req.params.userId));
        res.json(stats);
    } catch(e) { res.json({}); }
});

app.post('/api/register', async (req, res) => {
    try {
        const { user_id, username, first_name, language } = req.body;
        await db.registerUser(parseInt(user_id), username, first_name, '', '', '', 'SD', '', null, language || 'ar', req.ip, req.headers['user-agent']);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

app.get('/api/user/trades/:userId', async (req, res) => {
    try {
        const trades = await db.getUserTradeHistory(parseInt(req.params.userId), 50);
        res.json(trades);
    } catch(e) { res.json([]); }
});

// المحفظة
app.get('/api/wallet/:userId', async (req, res) => {
    try {
        const wallet = await db.getUserWallet(parseInt(req.params.userId));
        res.json({ 
            usdtBalance: wallet.usdtBalance || 0, 
            crystalBalance: wallet.crystalBalance || 0,
            addresses: { 
                bnb: wallet.bnbAddress, 
                polygon: wallet.polygonAddress, 
                solana: wallet.solanaAddress, 
                aptos: wallet.aptosAddress 
            }
        });
    } catch(e) { res.json({ usdtBalance: 0, crystalBalance: 0, addresses: {} }); }
});

app.post('/api/deposit', async (req, res) => {
    try {
        const { user_id, amount, network } = req.body;
        const result = await db.requestDeposit(parseInt(user_id), parseFloat(amount), 'USDT', network);
        res.json(result);
    } catch(e) { res.json({ success: false, message: e.message }); }
});

app.post('/api/withdraw', async (req, res) => {
    try {
        const { user_id, amount, network, address, twofa_code } = req.body;
        const result = await db.requestWithdraw(parseInt(user_id), parseFloat(amount), 'USDT', network, address, twofa_code);
        res.json(result);
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// KYC
app.get('/api/kyc/status/:userId', async (req, res) => {
    try {
        const status = await db.getKycStatus(parseInt(req.params.userId));
        res.json(status);
    } catch(e) { res.json({ status: 'not_submitted' }); }
});

// الإحالات
app.get('/api/user/referral/:userId', async (req, res) => {
    try {
        const data = await db.getReferralData(parseInt(req.params.userId));
        res.json(data);
    } catch(e) { res.json({ referralCount: 0, referralEarnings: 0 }); }
});

app.post('/api/referral/transfer', async (req, res) => {
    try {
        const { user_id } = req.body;
        const result = await db.transferReferralEarningsToWallet(parseInt(user_id));
        res.json(result);
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// 2FA
app.post('/api/2fa/generate', async (req, res) => {
    try {
        const { user_id } = req.body;
        const result = await db.generate2FASecret(parseInt(user_id));
        res.json(result);
    } catch(e) { res.json({ success: false, message: e.message }); }
});

app.post('/api/2fa/enable', async (req, res) => {
    try {
        const { user_id, code } = req.body;
        const result = await db.enable2FA(parseInt(user_id), code);
        res.json(result);
    } catch(e) { res.json({ success: false, message: e.message }); }
});

app.post('/api/2fa/disable', async (req, res) => {
    try {
        const { user_id, code } = req.body;
        const result = await db.disable2FA(parseInt(user_id), code);
        res.json(result);
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// الدردشة
app.get('/api/chat/global', async (req, res) => {
    try {
        const messages = await db.getGlobalMessages(50);
        res.json(messages);
    } catch(e) { res.json([]); }
});

app.post('/api/chat/send', async (req, res) => {
    try {
        const { senderId, message } = req.body;
        const result = await db.sendMessage(parseInt(senderId), null, message);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

// ========== الصفحات الثابتة ==========
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// ========== أوامر البوت ==========

// أمر /start
bot.start(async (ctx) => {
    const user = ctx.from;
    const referrer = ctx.startPayload ? parseInt(ctx.startPayload) : null;
    
    await db.registerUser(user.id, user.username, user.first_name, '', '', '', 'SD', '', referrer, 'ar', ctx.message?.chat?.id, 'User');
    
    const stats = await db.getUserStats(user.id);
    const price = await db.getMarketPrice();
    
    await ctx.replyWithHTML(
        `💎 <b>CRYSTAL Exchange</b> 💎\n\n` +
        `✨ مرحباً بك في منصة تداول عملة الكريستال!\n\n` +
        `👤 <b>المستخدم:</b> ${user.first_name}\n` +
        `💎 <b>رصيد CRYSTAL:</b> ${stats?.crystalBalance?.toFixed(2) || 0}\n` +
        `💵 <b>رصيد USDT:</b> ${stats?.usdtBalance?.toFixed(2) || 0}\n` +
        `💰 <b>سعر CRYSTAL:</b> ${price} USDT\n\n` +
        `🚀 <a href="${WEBAPP_URL}">اضغط هنا لفتح منصة التداول</a>\n\n` +
        `📊 <b>الأوامر المتاحة:</b>\n` +
        `/price - سعر CRYSTAL الحالي\n` +
        `/balance - رصيدك\n` +
        `/stats - إحصائيات السوق\n` +
        `/buy [السعر] [الكمية] - شراء CRYSTAL\n` +
        `/sell [السعر] [الكمية] - بيع CRYSTAL\n` +
        `/orders - أخر 5 طلبات شراء وبيع\n` +
        `/admin - لوحة الأدمن (للمدراء فقط)`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💎 فتح منصة التداول', web_app: { url: WEBAPP_URL } }],
                    [{ text: '📊 السوق', callback_data: 'market_stats' }, { text: '💰 رصيدي', callback_data: 'my_balance' }],
                    [{ text: '🟢 شراء', callback_data: 'buy_menu' }, { text: '🔴 بيع', callback_data: 'sell_menu' }],
                    [{ text: '📖 المساعدة', callback_data: 'help_menu' }]
                ]
            }
        }
    );
});

// أمر السعر
bot.command('price', async (ctx) => {
    const price = await db.getMarketPrice();
    await ctx.reply(`💎 <b>سعر CRYSTAL الحالي:</b> ${price} USDT\n📊 <b>1 USDT =</b> ${(1/price).toFixed(2)} CRYSTAL`, { parse_mode: 'HTML' });
});

// أمر الرصيد
bot.command('balance', async (ctx) => {
    const stats = await db.getUserStats(ctx.from.id);
    await ctx.reply(
        `💰 <b>رصيدك</b>\n\n` +
        `💎 <b>CRYSTAL:</b> ${stats?.crystalBalance?.toFixed(2) || 0}\n` +
        `💵 <b>USDT:</b> ${stats?.usdtBalance?.toFixed(2) || 0}\n` +
        `⭐ <b>التقييم:</b> ${stats?.rating || 5.0}/5\n` +
        `📊 <b>إجمالي الصفقات:</b> ${stats?.totalTrades || 0}`,
        { parse_mode: 'HTML' }
    );
});

// أمر الإحصائيات
bot.command('stats', async (ctx) => {
    const stats = await db.getMarketStats();
    await ctx.reply(
        `📊 <b>إحصائيات السوق</b>\n\n` +
        `💎 <b>سعر CRYSTAL:</b> ${stats.price} USDT\n` +
        `📈 <b>التغير 24h:</b> ${stats.change24h?.toFixed(2) || 0}%\n` +
        `📊 <b>حجم 24h:</b> ${stats.volume24h?.toFixed(0) || 0} CRYSTAL\n` +
        `📈 <b>أعلى سعر:</b> ${stats.high24h} USDT\n` +
        `📉 <b>أدنى سعر:</b> ${stats.low24h} USDT\n\n` +
        `🟢 <b>طلبات الشراء:</b> ${stats.buyOrders || 0}\n` +
        `🔴 <b>طلبات البيع:</b> ${stats.sellOrders || 0}\n` +
        `🔄 <b>إجمالي الصفقات:</b> ${stats.totalTrades || 0}`,
        { parse_mode: 'HTML' }
    );
});

// أمر شراء
bot.command('buy', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 3) {
        return ctx.reply('❌ <b>طريقة الاستخدام:</b>\n/buy [السعر] [الكمية]\n\nمثال: /buy 0.002 1000', { parse_mode: 'HTML' });
    }
    const price = parseFloat(args[1]);
    const amount = parseFloat(args[2]);
    if (isNaN(price) || isNaN(amount) || price <= 0 || amount <= 0) {
        return ctx.reply('❌ يرجى إدخال سعر وكمية صحيحة');
    }
    const result = await db.createOrder(ctx.from.id, 'buy', price, amount);
    ctx.reply(result.message);
});

// أمر بيع
bot.command('sell', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 3) {
        return ctx.reply('❌ <b>طريقة الاستخدام:</b>\n/sell [السعر] [الكمية]\n\nمثال: /sell 0.003 500', { parse_mode: 'HTML' });
    }
    const price = parseFloat(args[1]);
    const amount = parseFloat(args[2]);
    if (isNaN(price) || isNaN(amount) || price <= 0 || amount <= 0) {
        return ctx.reply('❌ يرجى إدخال سعر وكمية صحيحة');
    }
    const result = await db.createOrder(ctx.from.id, 'sell', price, amount);
    ctx.reply(result.message);
});

// أمر الطلبات
bot.command('orders', async (ctx) => {
    const buys = await db.getActiveOrders('buy', 5);
    const sells = await db.getActiveOrders('sell', 5);
    
    let text = `📊 <b>أحدث الطلبات</b>\n\n`;
    text += `🟢 <b>طلبات الشراء</b>\n`;
    for (const o of (buys.orders || buys).slice(0, 5)) {
        text += `💰 ${o.price} USDT | 📦 ${o.amount.toFixed(2)} CRYSTAL\n`;
    }
    text += `\n🔴 <b>طلبات البيع</b>\n`;
    for (const o of (sells.orders || sells).slice(0, 5)) {
        text += `💰 ${o.price} USDT | 📦 ${o.amount.toFixed(2)} CRYSTAL\n`;
    }
    ctx.reply(text, { parse_mode: 'HTML' });
});

// أمر الأدمن
bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('⛔ هذا الأمر للأدمن فقط');
    await ctx.reply(
        `👑 <b>لوحة تحكم الأدمن</b> 👑\n\n` +
        `اختر أحد الخيارات:`,
        {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🆔 طلبات التوثيق', callback_data: 'admin_kyc' }],
                    [{ text: '💰 طلبات السحب', callback_data: 'admin_withdraws' }],
                    [{ text: '📤 طلبات الإيداع', callback_data: 'admin_deposits' }],
                    [{ text: '📊 إحصائيات', callback_data: 'admin_stats' }],
                    [{ text: '🔙 رجوع', callback_data: 'back_to_start' }]
                ]
            }
        }
    );
});

// ========== أزرار البوت (Callback Queries) ==========

bot.action('market_stats', async (ctx) => {
    await ctx.answerCbQuery();
    const stats = await db.getMarketStats();
    await ctx.editMessageText(
        `📊 <b>إحصائيات السوق</b>\n\n` +
        `💎 <b>سعر CRYSTAL:</b> ${stats.price} USDT\n` +
        `📈 <b>التغير 24h:</b> ${stats.change24h?.toFixed(2) || 0}%\n` +
        `📊 <b>حجم 24h:</b> ${stats.volume24h?.toFixed(0) || 0} CRYSTAL\n` +
        `🟢 <b>طلبات الشراء:</b> ${stats.buyOrders || 0}\n` +
        `🔴 <b>طلبات البيع:</b> ${stats.sellOrders || 0}`,
        { parse_mode: 'HTML' }
    );
});

bot.action('my_balance', async (ctx) => {
    await ctx.answerCbQuery();
    const stats = await db.getUserStats(ctx.from.id);
    await ctx.editMessageText(
        `💰 <b>رصيدك</b>\n\n` +
        `💎 <b>CRYSTAL:</b> ${stats?.crystalBalance?.toFixed(2) || 0}\n` +
        `💵 <b>USDT:</b> ${stats?.usdtBalance?.toFixed(2) || 0}\n` +
        `⭐ <b>التقييم:</b> ${stats?.rating || 5.0}/5`,
        { parse_mode: 'HTML' }
    );
});

bot.action('buy_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
        `🟢 <b>شراء CRYSTAL</b>\n\n` +
        `أرسل الأمر التالي:\n` +
        `<code>/buy [السعر] [الكمية]</code>\n\n` +
        `مثال: <code>/buy 0.002 1000</code>\n\n` +
        `💰 <b>السعر الحالي:</b> ${await db.getMarketPrice()} USDT`,
        { parse_mode: 'HTML' }
    );
});

bot.action('sell_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
        `🔴 <b>بيع CRYSTAL</b>\n\n` +
        `أرسل الأمر التالي:\n` +
        `<code>/sell [السعر] [الكمية]</code>\n\n` +
        `مثال: <code>/sell 0.003 500</code>\n\n` +
        `💰 <b>السعر الحالي:</b> ${await db.getMarketPrice()} USDT`,
        { parse_mode: 'HTML' }
    );
});

bot.action('help_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
        `📖 <b>قائمة المساعدة</b>\n\n` +
        `<b>الأوامر المتاحة:</b>\n` +
        `/start - بدء البوت\n` +
        `/price - سعر CRYSTAL\n` +
        `/balance - رصيدك\n` +
        `/stats - إحصائيات السوق\n` +
        `/buy [سعر] [كمية] - شراء\n` +
        `/sell [سعر] [كمية] - بيع\n` +
        `/orders - آخر الطلبات\n\n` +
        `<b>روابط مهمة:</b>\n` +
        `<a href="${WEBAPP_URL}">🚀 فتح منصة التداول</a>`,
        { parse_mode: 'HTML' }
    );
});

bot.action('back_to_start', async (ctx) => {
    await ctx.answerCbQuery();
    const user = ctx.from;
    const stats = await db.getUserStats(user.id);
    const price = await db.getMarketPrice();
    await ctx.editMessageText(
        `💎 <b>CRYSTAL Exchange</b> 💎\n\n` +
        `👤 <b>المستخدم:</b> ${user.first_name}\n` +
        `💎 <b>رصيد CRYSTAL:</b> ${stats?.crystalBalance?.toFixed(2) || 0}\n` +
        `💵 <b>رصيد USDT:</b> ${stats?.usdtBalance?.toFixed(2) || 0}\n` +
        `💰 <b>سعر CRYSTAL:</b> ${price} USDT`,
        {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💎 فتح منصة التداول', web_app: { url: WEBAPP_URL } }],
                    [{ text: '📊 السوق', callback_data: 'market_stats' }, { text: '💰 رصيدي', callback_data: 'my_balance' }],
                    [{ text: '🟢 شراء', callback_data: 'buy_menu' }, { text: '🔴 بيع', callback_data: 'sell_menu' }],
                    [{ text: '📖 المساعدة', callback_data: 'help_menu' }]
                ]
            }
        }
    );
});

// أزرار الأدمن
bot.action('admin_kyc', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const pending = await db.getPendingKycRequests();
    if (!pending.length) return ctx.reply('📭 لا توجد طلبات توثيق');
    let text = '🆔 <b>طلبات التوثيق</b>\n\n';
    for (const req of pending.slice(0, 10)) {
        text += `📋 <b>${req._id.toString().slice(-8)}</b>\n👤 ${req.fullName}\n📱 ${req.phoneNumber}\n━━━━━━━━━━━━━━━━━━\n`;
    }
    await ctx.reply(text, { parse_mode: 'HTML' });
});

bot.action('admin_withdraws', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const pending = await db.getPendingWithdraws();
    if (!pending.length) return ctx.reply('📭 لا توجد طلبات سحب');
    let text = '💰 <b>طلبات السحب</b>\n\n';
    for (const req of pending.slice(0, 10)) {
        text += `🆔 <b>${req._id.toString().slice(-8)}</b>\n👤 ${req.userId}\n💰 ${req.amount} USDT\n━━━━━━━━━━━━━━━━━━\n`;
    }
    await ctx.reply(text, { parse_mode: 'HTML' });
});

bot.action('admin_deposits', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const pending = await db.getPendingDeposits();
    if (!pending.length) return ctx.reply('📭 لا توجد طلبات إيداع');
    let text = '📤 <b>طلبات الإيداع</b>\n\n';
    for (const req of pending.slice(0, 10)) {
        text += `🆔 <b>${req._id.toString().slice(-8)}</b>\n👤 ${req.userId}\n💰 ${req.amount} USDT\n━━━━━━━━━━━━━━━━━━\n`;
    }
    await ctx.reply(text, { parse_mode: 'HTML' });
});

bot.action('admin_stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const stats = await db.getMarketStats();
    await ctx.reply(
        `📊 <b>إحصائيات المنصة</b>\n\n` +
        `💎 <b>سعر CRYSTAL:</b> ${stats.price} USDT\n` +
        `🟢 <b>طلبات شراء:</b> ${stats.buyOrders || 0}\n` +
        `🔴 <b>طلبات بيع:</b> ${stats.sellOrders || 0}\n` +
        `🔄 <b>إجمالي الصفقات:</b> ${stats.totalTrades || 0}\n` +
        `💰 <b>إجمالي الحجم:</b> ${stats.totalVolume?.toFixed(2) || 0} USDT`,
        { parse_mode: 'HTML' }
    );
});

// ========== تشغيل السيرفر ==========
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🌐 Web server running on port ${PORT}`);
    console.log(`🌐 WebApp URL: ${WEBAPP_URL}`);
    
    try {
        await db.connect();
        console.log('✅ Database connected');
        
        // إعداد Webhook
        await bot.telegram.deleteWebhook();
        console.log('✅ Old webhook deleted');
        
        const webhookUrl = `${WEBAPP_URL}${WEBHOOK_PATH}`;
        await bot.telegram.setWebhook(webhookUrl);
        console.log(`✅ Webhook set to: ${webhookUrl}`);
        
        const botInfo = await bot.telegram.getMe();
        console.log(`✅ Bot @${botInfo.username} is ready`);
        console.log(`✅ Bot ID: ${botInfo.id}`);
        
    } catch (error) {
        console.error('❌ Setup error:', error.message);
    }
});

// ========== إيقاف آمن ==========
process.once('SIGINT', () => {
    bot.stop('SIGINT');
    process.exit(0);
});
process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
    process.exit(0);
});

module.exports = { bot, app };
