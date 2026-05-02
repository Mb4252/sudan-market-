require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const db = require('./database');
const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const cors = require('cors');

// ==========================================
// 1. الإعدادات الأساسية والثوابت
// ==========================================
const PORT = process.env.PORT || 10000;
const DOMAIN = 'https://sdm-security-bot.onrender.com'; // رابط منصتك الثابت
const WEBHOOK_PATH = '/telegraf-webhook';
const WEBHOOK_URL = `${DOMAIN}${WEBHOOK_PATH}`;
const WEBAPP_URL = process.env.WEBAPP_URL || DOMAIN;

const ADMIN_IDS = (process.env.ADMIN_IDS || '6701743450,8181305474').split(',').map(Number);
function isAdmin(userId) { return ADMIN_IDS.includes(parseInt(userId)); }

// ==========================================
// 2. إعداد خادم الويب (Express) والبوت
// ==========================================
const bot = new Telegraf(process.env.BOT_TOKEN);
module.exports.bot = bot;

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// 🔴 الأهم: مسار الـ Webhook لاستقبال رسائل التلجرام فوراً (يجب أن يكون هنا)
app.use(bot.webhookCallback(WEBHOOK_PATH));

// إعدادات الحماية
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 3. مسارات API للمنصة (الخاصة بك)
// ==========================================

app.get('/api/market/price', async (req, res) => res.json({ price: await db.getMarketPrice() }));
app.get('/api/market/stats', async (req, res) => res.json(await db.getMarketStats()));
app.get('/api/market/candles/:timeframe', async (req, res) => res.json(await db.getCandlesticks(req.params.timeframe, parseInt(req.query.limit) || 100)));

app.get('/api/orders', async (req, res) => res.json(await db.getActiveOrders(req.query.type, parseInt(req.query.limit) || 50)));
app.get('/api/orders/:userId', async (req, res) => res.json(await db.getUserOrders(parseInt(req.params.userId))));
app.post('/api/order/create', async (req, res) => {
    try {
        const { user_id, type, price, amount } = req.body;
        res.json(await db.createOrder(parseInt(user_id), type, parseFloat(price), parseFloat(amount)));
    } catch(e) { res.status(500).json({error: e.message}) }
});
app.post('/api/order/cancel', async (req, res) => {
    try { res.json(await db.cancelOrder(req.body.order_id, parseInt(req.body.user_id))); } catch(e) { res.status(500).json({error: e.message}) }
});

app.get('/api/user/:userId', async (req, res) => res.json(await db.getUserStats(parseInt(req.params.userId))));
app.post('/api/register', async (req, res) => {
    try {
        await db.registerUser(parseInt(req.body.user_id), req.body.username, req.body.first_name, '', '', '', req.body.country || 'SD', '', null, 'ar', req.ip, req.headers['user-agent']);
        res.json({ success: true });
    } catch(e) { res.status(500).json({error: e.message}) }
});
app.get('/api/user/trades/:userId', async (req, res) => res.json(await db.getUserTradeHistory(parseInt(req.params.userId), 50)));

app.get('/api/wallet/:userId', async (req, res) => {
    try {
        const w = await db.getUserWallet(parseInt(req.params.userId));
        res.json({ usdtBalance: w.usdtBalance, crystalBalance: w.crystalBalance, addresses: { bnb: w.bnbAddress, polygon: w.polygonAddress, solana: w.solanaAddress, aptos: w.aptosAddress } });
    } catch(e) { res.status(500).json({error: e.message}) }
});
app.post('/api/deposit', async (req, res) => res.json(await db.requestDeposit(parseInt(req.body.user_id), parseFloat(req.body.amount), 'USDT', req.body.network)));
app.post('/api/withdraw', async (req, res) => res.json(await db.requestWithdraw(parseInt(req.body.user_id), parseFloat(req.body.amount), 'USDT', req.body.network, req.body.address, req.body.twofa_code)));

app.get('/api/kyc/status/:userId', async (req, res) => res.json(await db.getKycStatus(parseInt(req.params.userId))));
app.post('/api/kyc/submit', upload.fields([{ name: 'passportPhoto' }, { name: 'personalPhoto' }]), async (req, res) => {
    try {
        const { user_id, fullName, passportNumber, nationalId, phoneNumber, email, country, city, bankName, bankAccountNumber, bankAccountName } = req.body;
        let passportFileId = null, personalFileId = null;
        if (req.files['passportPhoto'] && bot) {
            const msg = await bot.telegram.sendPhoto(ADMIN_IDS[0], { source: req.files['passportPhoto'][0].buffer });
            passportFileId = msg.photo[msg.photo.length - 1].file_id;
        }
        if (req.files['personalPhoto'] && bot) {
            const msg = await bot.telegram.sendPhoto(ADMIN_IDS[0], { source: req.files['personalPhoto'][0].buffer });
            personalFileId = msg.photo[msg.photo.length - 1].file_id;
        }
        res.json(await db.createKycRequest(parseInt(user_id), fullName, passportNumber, nationalId, phoneNumber, email, country, city, passportFileId, personalFileId, bankName, bankAccountNumber, bankAccountName));
    } catch(e) { res.status(500).json({error: e.message}) }
});

app.get('/api/user/referral/:userId', async (req, res) => res.json(await db.getReferralData(parseInt(req.params.userId))));
app.post('/api/referral/transfer', async (req, res) => res.json(await db.transferReferralEarningsToWallet(parseInt(req.body.user_id))));

app.get('/api/chat/global', async (req, res) => res.json(await db.getGlobalMessages(50)));
app.post('/api/chat/send', async (req, res) => res.json(await db.sendMessage(parseInt(req.body.senderId), null, req.body.message)));
app.post('/api/chat/send-image', upload.single('image'), async (req, res) => {
    try {
        let imageFileId = null;
        if (bot && req.file) {
            const msg = await bot.telegram.sendPhoto(ADMIN_IDS[0], { source: req.file.buffer });
            imageFileId = msg.photo[msg.photo.length - 1].file_id;
        }
        res.json(await db.sendMessage(parseInt(req.body.senderId), null, req.body.message || '📸 صورة', imageFileId));
    } catch(e) { res.status(500).json({error: e.message}) }
});

app.post('/api/2fa/generate', async (req, res) => res.json(await db.generate2FASecret(parseInt(req.body.user_id))));
app.post('/api/2fa/enable', async (req, res) => res.json(await db.enable2FA(parseInt(req.body.user_id), req.body.code)));
app.post('/api/2fa/disable', async (req, res) => res.json(await db.disable2FA(parseInt(req.body.user_id), req.body.code)));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'public', 'terms.html')));
app.get('/health', async (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ==========================================
// 4. أوامر بوت التلجرام
// ==========================================
bot.start(async (ctx) => {
    try {
        const user = ctx.from;
        const referrer = ctx.startPayload ? parseInt(ctx.startPayload) : null;
        
        await db.registerUser(user.id, user.username, user.first_name, '', '', '', 'SD', '', referrer, 'ar', ctx.message?.chat?.id, ctx.message?.from?.is_bot ? 'Bot' : 'User');
        
        let price = "غير متوفر";
        try { price = await db.getMarketPrice(); } catch(e) {}

        await ctx.reply(
            `💎 *CRYSTAL Exchange* 💎\n\n` +
            `✨ *مرحباً بك في منصة تداول عملة الكريستال!*\n\n` +
            `👤 *المستخدم:* ${user.first_name}\n\n` +
            `📊 *إجمالي العرض:* 5,000,000 CRYSTAL\n` +
            `💰 *السعر الحالي:* ${price} USDT\n\n` +
            `🚀 *اضغط على الزر أدناه لبدء التداول*`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.webApp('💎 فتح منصة التداول', WEBAPP_URL)],[Markup.button.url('📜 الشروط والأحكام', `${WEBAPP_URL}/terms`)]
                ])
            }
        );
    } catch (error) {
        console.error("❌ Error in /start:", error);
    }
});

bot.command('price', async (ctx) => {
    try {
        const price = await db.getMarketPrice();
        await ctx.reply(`💎 *سعر CRYSTAL الحالي:* ${price} USDT\n📊 *1 CRYSTAL = ${(price * 500).toFixed(2)} حبة*`, { parse_mode: 'Markdown' });
    } catch (e) {}
});

bot.command('balance', async (ctx) => {
    try {
        const stats = await db.getUserStats(ctx.from.id);
        await ctx.reply(`💰 *رصيدك*\n💎 CRYSTAL: ${stats.crystalBalance?.toFixed(2) || 0}\n💵 USDT: ${stats.usdtBalance?.toFixed(2) || 0}`, { parse_mode: 'Markdown' });
    } catch (e) {}
});

bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('⛔ للأدمن فقط');
    await ctx.reply('👑 *لوحة تحكم الأدمن*', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🆔 طلبات التوثيق', 'pending_kyc')],[Markup.button.callback('💰 طلبات السحب', 'pending_withdraws')],[Markup.button.callback('📤 طلبات الإيداع', 'pending_deposits')],[Markup.button.callback('📊 إحصائيات', 'global_stats')],
            [Markup.button.webApp('💎 فتح المنصة', WEBAPP_URL)]
        ])
    });
});

// ==========================================
// 5. التشغيل النهائي للسيرفر
// ==========================================
(async () => {
    try {
        // 1. الاتصال بقاعدة البيانات
        await db.connect();
        console.log('✅ DATABASE CONNECTED SUCCESSFULLY');

        // 2. إخبار تيليجرام برابط الويب هوك الخاص بنا
        await bot.telegram.setWebhook(WEBHOOK_URL);
        console.log(`🚀 WEBHOOK SET TO: ${WEBHOOK_URL}`);

        // 3. تشغيل خادم الويب
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
        });

        // إغلاق آمن
        process.once('SIGINT', () => { server.close(); });
        process.once('SIGTERM', () => { server.close(); });

    } catch (error) {
        console.error('❌ CRITICAL ERROR:', error.message);
    }
})();
