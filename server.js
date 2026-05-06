require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const db = require('./database');
const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const cors = require('cors');
const fetch = require('node-fetch');

// ========== إعداد خادم الويب ==========
const app = express();
const PORT = process.env.PORT || 10000;

const upload = multer({ storage: multer.memoryStorage() });

// CORS
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ========== تعديل المسار: استخدام mining-app بدلاً من public ==========
app.use(express.static(path.join(__dirname, 'mining-app')));

const WEBAPP_URL = process.env.WEBAPP_URL || `https://${process.env.RENDER_EXTERNAL_URL || 'localhost'}`;
const ADMIN_IDS = (process.env.ADMIN_IDS || '6701743450,8181305474').split(',').map(Number);
const BOT_USERNAME = process.env.BOT_USERNAME || 'crystal_exchange_bot';

function isAdmin(userId) {
    return ADMIN_IDS.includes(parseInt(userId));
}

// ========== API Routes ==========

// عامة
app.get('/api/market/price', async (req, res) => {
    try {
        const price = await db.getMarketPrice();
        res.json({ price });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/market/stats', async (req, res) => {
    try {
        const stats = await db.getMarketStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/market/candles/:timeframe', async (req, res) => {
    try {
        const candles = await db.getCandlesticks(req.params.timeframe, parseInt(req.query.limit) || 100);
        res.json(candles);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// الأوامر (Order Book)
app.get('/api/orders', async (req, res) => {
    try {
        const orders = await db.getActiveOrders(req.query.type, parseInt(req.query.limit) || 50);
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/orders/:userId', async (req, res) => {
    try {
        const orders = await db.getUserOrders(parseInt(req.params.userId));
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/order/create', async (req, res) => {
    try {
        const { user_id, type, price, amount } = req.body;
        const result = await db.createOrder(parseInt(user_id), type, parseFloat(price), parseFloat(amount));
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/order/cancel', async (req, res) => {
    try {
        const result = await db.cancelOrder(req.body.order_id, parseInt(req.body.user_id));
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// المستخدم
app.get('/api/user/:userId', async (req, res) => {
    try {
        const stats = await db.getUserStats(parseInt(req.params.userId));
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        await db.registerUser(
            parseInt(req.body.user_id), 
            req.body.username, 
            req.body.first_name, 
            '', 
            '', 
            '', 
            req.body.country || 'SD', 
            '', 
            null, 
            'ar', 
            req.ip, 
            req.headers['user-agent']
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/user/trades/:userId', async (req, res) => {
    try {
        const trades = await db.getUserTradeHistory(parseInt(req.params.userId), 50);
        res.json(trades);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// المحفظة
app.get('/api/wallet/:userId', async (req, res) => {
    try {
        const w = await db.getUserWallet(parseInt(req.params.userId));
        res.json({ 
            usdtBalance: w.usdtBalance, 
            crystalBalance: w.crystalBalance, 
            addresses: { 
                bnb: w.bnbAddress, 
                polygon: w.polygonAddress, 
                solana: w.solanaAddress, 
                aptos: w.aptosAddress 
            } 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/deposit', async (req, res) => {
    try {
        const result = await db.requestDeposit(
            parseInt(req.body.user_id), 
            parseFloat(req.body.amount), 
            'USDT', 
            req.body.network
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/withdraw', async (req, res) => {
    try {
        const result = await db.requestWithdraw(
            parseInt(req.body.user_id), 
            parseFloat(req.body.amount), 
            'USDT', 
            req.body.network, 
            req.body.address, 
            req.body.twofa_code
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// KYC
app.get('/api/kyc/status/:userId', async (req, res) => {
    try {
        const status = await db.getKycStatus(parseInt(req.params.userId));
        res.json(status);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/kyc/submit', upload.fields([
    { name: 'passportPhoto' }, 
    { name: 'personalPhoto' }
]), async (req, res) => {
    try {
        const { user_id, fullName, passportNumber, nationalId, phoneNumber, email, country, city, bankName, bankAccountNumber, bankAccountName } = req.body;
        
        let passportFileId = null, personalFileId = null;
        const bot = require('./server').bot;
        
        if (req.files['passportPhoto'] && bot) {
            const msg = await bot.telegram.sendPhoto(ADMIN_IDS[0], { source: req.files['passportPhoto'][0].buffer });
            passportFileId = msg.photo[msg.photo.length - 1].file_id;
        }
        if (req.files['personalPhoto'] && bot) {
            const msg = await bot.telegram.sendPhoto(ADMIN_IDS[0], { source: req.files['personalPhoto'][0].buffer });
            personalFileId = msg.photo[msg.photo.length - 1].file_id;
        }
        
        const result = await db.createKycRequest(
            parseInt(user_id), fullName, passportNumber, nationalId, phoneNumber, email, 
            country, city, passportFileId, personalFileId, bankName, bankAccountNumber, bankAccountName
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// الإحالات
app.get('/api/user/referral/:userId', async (req, res) => {
    try {
        const data = await db.getReferralData(parseInt(req.params.userId));
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/referral/transfer', async (req, res) => {
    try {
        const result = await db.transferReferralEarningsToWallet(parseInt(req.body.user_id));
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// الدردشة
app.get('/api/chat/global', async (req, res) => {
    try {
        const messages = await db.getGlobalMessages(50);
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/chat/send', async (req, res) => {
    try {
        const result = await db.sendMessage(parseInt(req.body.senderId), null, req.body.message);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/chat/send-image', upload.single('image'), async (req, res) => {
    try {
        let imageFileId = null;
        const bot = require('./server').bot;
        if (bot && req.file) {
            const msg = await bot.telegram.sendPhoto(ADMIN_IDS[0], { source: req.file.buffer });
            imageFileId = msg.photo[msg.photo.length - 1].file_id;
        }
        const result = await db.sendMessage(parseInt(req.body.senderId), null, req.body.message || '📸 صورة', imageFileId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2FA
app.post('/api/2fa/generate', async (req, res) => {
    try {
        const result = await db.generate2FASecret(parseInt(req.body.user_id));
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/2fa/enable', async (req, res) => {
    try {
        const result = await db.enable2FA(parseInt(req.body.user_id), req.body.code);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/2fa/disable', async (req, res) => {
    try {
        const result = await db.disable2FA(parseInt(req.body.user_id), req.body.code);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== نقطة الصحة (Health Check) لـ Render ==========
app.get('/health', async (req, res) => {
    try {
        const price = await db.getMarketPrice();
        res.json({ 
            status: 'ok', 
            timestamp: new Date(), 
            supply: 5000000, 
            price: price 
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// ========== الصفحات الرئيسية - تعديل المسار إلى mining-app ==========
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'mining-app', 'index.html'));
});

app.get('/terms', (req, res) => {
    res.sendFile(path.join(__dirname, 'mining-app', 'terms.html'));
});

// ========== إعداد بوت التلجرام ==========
const bot = new Telegraf(process.env.BOT_TOKEN);
module.exports.bot = bot;

// ========== أوامر البوت ==========
bot.start(async (ctx) => {
    try {
        const user = ctx.from;
        const referrer = ctx.startPayload ? parseInt(ctx.startPayload) : null;
        
        await db.registerUser(user.id, user.username, user.first_name, '', '', '', 'SD', '', referrer, 'ar', ctx.message?.chat?.id, ctx.message?.from?.is_bot ? 'Bot' : 'User');
        
        const price = await db.getMarketPrice();
        
        await ctx.reply(
            `💎 *CRYSTAL Exchange* 💎\n\n` +
            `✨ *مرحباً بك في منصة تداول عملة الكريستال!*\n\n` +
            `👤 *المستخدم:* ${user.first_name}\n\n` +
            `📊 *إجمالي العرض:* 5,000,000 CRYSTAL\n` +
            `💰 *السعر الحالي:* ${price} USDT\n` +
            `📈 *1 CRYSTAL = ${(price * 500).toFixed(2)} حبة*\n\n` +
            `🚀 *اضغط على الزر أدناه لبدء التداول*`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.webApp('💎 فتح منصة التداول', WEBAPP_URL)],
                    [Markup.button.url('📜 الشروط والأحكام', `${WEBAPP_URL}/terms`)]
                ])
            }
        );
    } catch (error) {
        console.error('Start command error:', error);
        ctx.reply('❌ حدث خطأ، يرجى المحاولة لاحقاً');
    }
});

bot.command('price', async (ctx) => {
    try {
        const price = await db.getMarketPrice();
        await ctx.reply(`💎 *سعر CRYSTAL الحالي:* ${price} USDT\n📊 *1 CRYSTAL = ${(price * 500).toFixed(2)} حبة*`, { parse_mode: 'Markdown' });
    } catch (error) {
        ctx.reply('❌ حدث خطأ');
    }
});

bot.command('balance', async (ctx) => {
    try {
        const stats = await db.getUserStats(ctx.from.id);
        await ctx.reply(
            `💰 *رصيدك*\n\n` +
            `💎 CRYSTAL: ${stats.crystalBalance?.toFixed(2) || 0}\n` +
            `💵 USDT: ${stats.usdtBalance?.toFixed(2) || 0}`,
            { parse_mode: 'Markdown' }
        );
    } catch (error) {
        ctx.reply('❌ حدث خطأ');
    }
});

bot.command('stats', async (ctx) => {
    try {
        const stats = await db.getMarketStats();
        await ctx.reply(
            `📊 *إحصائيات السوق*\n\n` +
            `💎 *سعر CRYSTAL:* ${stats.price} USDT\n` +
            `📈 *التغير 24h:* ${stats.change24h?.toFixed(2) || 0}%\n` +
            `📊 *حجم التداول 24h:* ${stats.volume24h?.toFixed(2) || 0} CRYSTAL\n` +
            `📈 *أعلى سعر 24h:* ${stats.high24h} USDT\n` +
            `📉 *أدنى سعر 24h:* ${stats.low24h} USDT\n\n` +
            `🟢 *طلبات الشراء:* ${stats.buyOrders}\n` +
            `🔴 *طلبات البيع:* ${stats.sellOrders}\n` +
            `🔄 *إجمالي الصفقات:* ${stats.totalTrades}`,
            { parse_mode: 'Markdown' }
        );
    } catch (error) {
        ctx.reply('❌ حدث خطأ');
    }
});

bot.command('buy', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 3) {
        return ctx.reply('❌ /buy [السعر] [الكمية]\nمثال: /buy 0.002 1000');
    }
    try {
        const price = parseFloat(args[1]);
        const amount = parseFloat(args[2]);
        const result = await db.createOrder(ctx.from.id, 'buy', price, amount);
        await ctx.reply(result.message);
    } catch (error) {
        ctx.reply('❌ حدث خطأ');
    }
});

bot.command('sell', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 3) {
        return ctx.reply('❌ /sell [السعر] [الكمية]\nمثال: /sell 0.003 500');
    }
    try {
        const price = parseFloat(args[1]);
        const amount = parseFloat(args[2]);
        const result = await db.createOrder(ctx.from.id, 'sell', price, amount);
        await ctx.reply(result.message);
    } catch (error) {
        ctx.reply('❌ حدث خطأ');
    }
});

bot.command('cancel', async (ctx) => {
    const orderId = ctx.message.text.split(' ')[1];
    if (!orderId) {
        return ctx.reply('❌ /cancel [رقم الطلب]');
    }
    try {
        const result = await db.cancelOrder(orderId, ctx.from.id);
        await ctx.reply(result.message);
    } catch (error) {
        ctx.reply('❌ حدث خطأ');
    }
});

bot.command('orders', async (ctx) => {
    try {
        const buys = await db.getActiveOrders('buy', 10);
        const sells = await db.getActiveOrders('sell', 10);
        
        let text = '📊 *طلبات الشراء*\n';
        const buyOrders = buys.orders || buys;
        for (const o of buyOrders.slice(0, 5)) {
            text += `💰 ${o.price} USDT | 📦 ${o.amount.toFixed(2)} CRYSTAL\n`;
        }
        text += '\n📊 *طلبات البيع*\n';
        const sellOrders = sells.orders || sells;
        for (const o of sellOrders.slice(0, 5)) {
            text += `💰 ${o.price} USDT | 📦 ${o.amount.toFixed(2)} CRYSTAL\n`;
        }
        await ctx.reply(text, { parse_mode: 'Markdown' });
    } catch (error) {
        ctx.reply('❌ حدث خطأ');
    }
});

bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('⛔ للأدمن فقط');
    await ctx.reply('👑 *لوحة تحكم الأدمن*', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🆔 طلبات التوثيق', 'pending_kyc')],
            [Markup.button.callback('💰 طلبات السحب', 'pending_withdraws')],
            [Markup.button.callback('📤 طلبات الإيداع', 'pending_deposits')],
            [Markup.button.callback('📊 إحصائيات', 'global_stats')],
            [Markup.button.webApp('💎 فتح المنصة', WEBAPP_URL)]
        ])
    });
});

// أزرار الأدمن
bot.action('pending_kyc', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ للأدمن فقط');
    try {
        const pending = await db.getPendingKycRequests();
        if (!pending.length) return ctx.editMessageText('📭 لا توجد طلبات');
        let text = '🆔 *طلبات التوثيق*\n\n';
        for (const req of pending) {
            text += `📋 ${req._id.toString().slice(-8)} | 👤 ${req.fullName}\n`;
        }
        await ctx.editMessageText(text, { parse_mode: 'Markdown' });
    } catch (error) {
        ctx.editMessageText('❌ حدث خطأ');
    }
});

bot.action('pending_withdraws', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ للأدمن فقط');
    try {
        const pending = await db.getPendingWithdraws();
        if (!pending.length) return ctx.editMessageText('📭 لا توجد طلبات سحب');
        let text = '💰 *طلبات السحب*\n\n';
        for (const req of pending) {
            text += `🆔 ${req._id.toString().slice(-8)} | 👤 ${req.userId} | 💰 ${req.amount} USDT\n`;
        }
        await ctx.editMessageText(text, { parse_mode: 'Markdown' });
    } catch (error) {
        ctx.editMessageText('❌ حدث خطأ');
    }
});

bot.action('pending_deposits', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ للأدمن فقط');
    try {
        const pending = await db.getPendingDeposits();
        if (!pending.length) return ctx.editMessageText('📭 لا توجد طلبات إيداع');
        let text = '📤 *طلبات الإيداع*\n\n';
        for (const req of pending) {
            text += `🆔 ${req._id.toString().slice(-8)} | 👤 ${req.userId} | 💰 ${req.amount} USDT\n`;
        }
        await ctx.editMessageText(text, { parse_mode: 'Markdown' });
    } catch (error) {
        ctx.editMessageText('❌ حدث خطأ');
    }
});

bot.action('global_stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ للأدمن فقط');
    try {
        const stats = await db.getMarketStats();
        await ctx.editMessageText(
            `📊 *إحصائيات المنصة*\n\n` +
            `💎 *سعر CRYSTAL:* ${stats.price} USDT\n` +
            `🟢 طلبات شراء: ${stats.buyOrders}\n` +
            `🔴 طلبات بيع: ${stats.sellOrders}\n` +
            `🔄 إجمالي الصفقات: ${stats.totalTrades}\n` +
            `💰 إجمالي الحجم: ${stats.totalVolume?.toFixed(2)} USDT`,
            { parse_mode: 'Markdown' }
        );
    } catch (error) {
        ctx.editMessageText('❌ حدث خطأ');
    }
});

// ========== تشغيل الخادم ==========
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Web server on port ${PORT}`);
    console.log(`🌐 WebApp URL: ${WEBAPP_URL}`);
});

// ========== تشغيل البوت ==========
(async () => {
    try {
        await db.connect();
        console.log('✅ Database connected');
        
        // حذف أي Webhook موجود
        await bot.telegram.deleteWebhook();
        console.log('✅ Webhook deleted');
        
        // الحصول على معلومات البوت
        const botInfo = await bot.telegram.getMe();
        console.log(`✅ Bot @${botInfo.username} is ready`);
        console.log(`✅ Bot ID: ${botInfo.id}`);
        
        // تشغيل البوت باستخدام Polling
        bot.launch({
            polling: {
                timeout: 30,
                limit: 100,
                retryTimeout: 5000
            }
        });
        console.log('🚀 Bot launched with polling');
        
    } catch (error) {
        console.error('❌ Bot error:', error.message);
    }
})();

// إيقاف نظيف
process.once('SIGINT', () => {
    bot.stop('SIGINT');
    server.close();
});
process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
    server.close();
});
