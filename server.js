require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const db = require('./database');
const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs');

// ========== التحقق من البيئة وإنشاء الملفات المفقودة ==========
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
    console.log('📁 Created public directory');
}

// إنشاء index.html إذا لم يكن موجوداً
const indexPath = path.join(publicDir, 'index.html');
if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, `<!DOCTYPE html>
<html lang="ar">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>💎 CRYSTAL Exchange</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: white;
        }
        .container { text-align: center; padding: 20px; }
        h1 { color: #4caf50; margin-bottom: 20px; font-size: 48px; }
        .price { font-size: 36px; margin: 20px 0; }
        .status { background: rgba(76,175,80,0.2); padding: 15px; border-radius: 10px; margin-top: 20px; }
        .info { margin-top: 20px; color: #aaa; }
        button {
            background: #4caf50;
            color: white;
            border: none;
            padding: 12px 30px;
            border-radius: 25px;
            font-size: 16px;
            margin-top: 20px;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>💎 CRYSTAL Exchange</h1>
        <p>منصة تداول عملة الكريستال الرقمية</p>
        <div class="price" id="price">جاري التحميل...</div>
        <div class="status">✅ البوت يعمل بشكل طبيعي</div>
        <div class="info">🚀 افتح التطبيق من خلال بوت التلجرام</div>
        <button onclick="window.location.href='https://t.me/my_edu_199311_bot'">🤖 افتح البوت</button>
    </div>
    <script>
        fetch('/api/market/price')
            .then(res => res.json())
            .then(data => {
                document.getElementById('price').innerHTML = \`💰 1 CRYSTAL = \${data.price} USDT\`;
            })
            .catch(() => {
                document.getElementById('price').innerHTML = '💰 جاري التحديث...';
            });
    </script>
</body>
</html>`);
    console.log('✅ Created index.html');
}

// إنشاء terms.html إذا لم يكن موجوداً
const termsPath = path.join(publicDir, 'terms.html');
if (!fs.existsSync(termsPath)) {
    fs.writeFileSync(termsPath, `<!DOCTYPE html>
<html lang="ar">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>📜 الشروط والأحكام - CRYSTAL Exchange</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            padding: 20px;
            color: white;
            line-height: 1.6;
        }
        .container { max-width: 800px; margin: 0 auto; }
        h1 { color: #4caf50; text-align: center; }
        .section { background: rgba(255,255,255,0.1); padding: 20px; border-radius: 15px; margin: 20px 0; }
        h2 { color: #ff9800; margin-bottom: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📜 الشروط والأحكام</h1>
        <div class="section">
            <h2>1. سياسة التداول</h2>
            <p>منصة CRYSTAL Exchange هي منصة لتداول العملة الرقمية CRYSTAL. جميع الصفقات نهائية ولا يمكن استردادها.</p>
        </div>
        <div class="section">
            <h2>2. الرسوم</h2>
            <p>رسوم التداول: 0.1% من قيمة الصفقة<br>رسوم السحب: 0.05 USDT + رسوم الشبكة</p>
        </div>
        <div class="section">
            <h2>3. الأمان</h2>
            <p>نوصي بتفعيل المصادقة الثنائية (2FA) لحماية حسابك. أنت وحدك المسؤول عن أمان حسابك.</p>
        </div>
        <div class="section">
            <h2>4. المسؤولية</h2>
            <p>منصة CRYSTAL Exchange غير مسؤولة عن أي خسائر ناتجة عن التداول أو الأخطاء التقنية.</p>
        </div>
    </div>
</body>
</html>`);
    console.log('✅ Created terms.html');
}

// ========== إعداد خادم الويب ==========
const app = express();
const PORT = process.env.PORT || 10000;

const upload = multer({ storage: multer.memoryStorage() });

// CORS
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(publicDir));

const WEBAPP_URL = process.env.WEBAPP_URL || `https://${process.env.RENDER_EXTERNAL_URL || 'localhost'}`;
const ADMIN_IDS = (process.env.ADMIN_IDS || '6701743450,8181305474').split(',').map(Number);
const BOT_USERNAME = process.env.BOT_USERNAME || 'my_edu_199311_bot';

function isAdmin(userId) {
    return ADMIN_IDS.includes(parseInt(userId));
}

// ========== API Routes ==========

// عامة
app.get('/api/market/price', async (req, res) => res.json({ price: await db.getMarketPrice() }));
app.get('/api/market/stats', async (req, res) => res.json(await db.getMarketStats()));
app.get('/api/market/candles/:timeframe', async (req, res) => res.json(await db.getCandlesticks(req.params.timeframe, parseInt(req.query.limit) || 100)));

// الأوامر
app.get('/api/orders', async (req, res) => res.json(await db.getActiveOrders(req.query.type, parseInt(req.query.limit) || 50)));
app.get('/api/orders/:userId', async (req, res) => res.json(await db.getUserOrders(parseInt(req.params.userId))));
app.post('/api/order/create', async (req, res) => {
    const { user_id, type, price, amount } = req.body;
    res.json(await db.createOrder(parseInt(user_id), type, parseFloat(price), parseFloat(amount)));
});
app.post('/api/order/cancel', async (req, res) => {
    res.json(await db.cancelOrder(req.body.order_id, parseInt(req.body.user_id)));
});

// المستخدم
app.get('/api/user/:userId', async (req, res) => res.json(await db.getUserStats(parseInt(req.params.userId))));
app.post('/api/register', async (req, res) => {
    await db.registerUser(parseInt(req.body.user_id), req.body.username, req.body.first_name, '', '', '', req.body.country || 'SD', '', null, 'ar', req.ip, req.headers['user-agent']);
    res.json({ success: true });
});
app.get('/api/user/trades/:userId', async (req, res) => res.json(await db.getUserTradeHistory(parseInt(req.params.userId), 50)));

// المحفظة
app.get('/api/wallet/:userId', async (req, res) => {
    const w = await db.getUserWallet(parseInt(req.params.userId));
    res.json({ usdtBalance: w.usdtBalance, crystalBalance: w.crystalBalance, addresses: { bnb: w.bnbAddress, polygon: w.polygonAddress, solana: w.solanaAddress, aptos: w.aptosAddress } });
});
app.post('/api/deposit', async (req, res) => res.json(await db.requestDeposit(parseInt(req.body.user_id), parseFloat(req.body.amount), 'USDT', req.body.network)));
app.post('/api/withdraw', async (req, res) => res.json(await db.requestWithdraw(parseInt(req.body.user_id), parseFloat(req.body.amount), 'USDT', req.body.network, req.body.address, req.body.twofa_code)));

// KYC
app.get('/api/kyc/status/:userId', async (req, res) => res.json(await db.getKycStatus(parseInt(req.params.userId))));
app.post('/api/kyc/submit', upload.fields([{ name: 'passportPhoto' }, { name: 'personalPhoto' }]), async (req, res) => {
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
});

// الإحالات
app.get('/api/user/referral/:userId', async (req, res) => res.json(await db.getReferralData(parseInt(req.params.userId))));
app.post('/api/referral/transfer', async (req, res) => res.json(await db.transferReferralEarningsToWallet(parseInt(req.body.user_id))));

// الدردشة
app.get('/api/chat/global', async (req, res) => res.json(await db.getGlobalMessages(50)));
app.post('/api/chat/send', async (req, res) => res.json(await db.sendMessage(parseInt(req.body.senderId), null, req.body.message)));
app.post('/api/chat/send-image', upload.single('image'), async (req, res) => {
    let imageFileId = null;
    if (bot && req.file) {
        const msg = await bot.telegram.sendPhoto(ADMIN_IDS[0], { source: req.file.buffer });
        imageFileId = msg.photo[msg.photo.length - 1].file_id;
    }
    res.json(await db.sendMessage(parseInt(req.body.senderId), null, req.body.message || '📸 صورة', imageFileId));
});

// 2FA
app.post('/api/2fa/generate', async (req, res) => res.json(await db.generate2FASecret(parseInt(req.body.user_id))));
app.post('/api/2fa/enable', async (req, res) => res.json(await db.enable2FA(parseInt(req.body.user_id), req.body.code)));
app.post('/api/2fa/disable', async (req, res) => res.json(await db.disable2FA(parseInt(req.body.user_id), req.body.code)));

// سيرفر الملفات الثابتة
app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(publicDir, 'terms.html')));
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date(), supply: 5000000, price: 0.002 }));

// ========== إعداد بوت التلجرام ==========
const bot = new Telegraf(process.env.BOT_TOKEN);
module.exports.bot = bot;

// إضافة معالج أخطاء للبوت
bot.catch((err, ctx) => {
    console.error('Bot error:', err);
});

// ========== أوامر البوت ==========
bot.start(async (ctx) => {
    const user = ctx.from;
    const referrer = ctx.startPayload ? parseInt(ctx.startPayload) : null;
    
    try {
        await db.registerUser(user.id, user.username, user.first_name, '', '', '', 'SD', '', referrer, 'ar', ctx.message?.chat?.id, ctx.message?.from?.is_bot ? 'Bot' : 'User');
    } catch(e) { console.error('Register error:', e); }
    
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
});

bot.command('price', async (ctx) => {
    const price = await db.getMarketPrice();
    await ctx.reply(`💎 *سعر CRYSTAL الحالي:* ${price} USDT\n📊 *1 CRYSTAL = ${(price * 500).toFixed(2)} حبة*`, { parse_mode: 'Markdown' });
});

bot.command('balance', async (ctx) => {
    const stats = await db.getUserStats(ctx.from.id);
    await ctx.reply(`💰 *رصيدك*\n💎 CRYSTAL: ${stats?.crystalBalance?.toFixed(2) || 0}\n💵 USDT: ${stats?.usdtBalance?.toFixed(2) || 0}`, { parse_mode: 'Markdown' });
});

bot.command('stats', async (ctx) => {
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
});

bot.command('help', async (ctx) => {
    await ctx.reply(
        `📖 *قائمة الأوامر*\n\n` +
        `/start - بدء البوت\n` +
        `/price - سعر CRYSTAL الحالي\n` +
        `/balance - رصيدك\n` +
        `/stats - إحصائيات السوق\n` +
        `/buy [السعر] [الكمية] - شراء CRYSTAL\n` +
        `/sell [السعر] [الكمية] - بيع CRYSTAL\n` +
        `/cancel [رقم الطلب] - إلغاء طلب\n` +
        `/orders - عرض الطلبات النشطة\n` +
        `/help - هذه القائمة`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('buy', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply('❌ /buy [السعر] [الكمية]\nمثال: /buy 0.002 1000');
    const price = parseFloat(args[1]);
    const amount = parseFloat(args[2]);
    const result = await db.createOrder(ctx.from.id, 'buy', price, amount);
    await ctx.reply(result.message);
});

bot.command('sell', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply('❌ /sell [السعر] [الكمية]\nمثال: /sell 0.003 500');
    const price = parseFloat(args[1]);
    const amount = parseFloat(args[2]);
    const result = await db.createOrder(ctx.from.id, 'sell', price, amount);
    await ctx.reply(result.message);
});

bot.command('cancel', async (ctx) => {
    const orderId = ctx.message.text.split(' ')[1];
    if (!orderId) return ctx.reply('❌ /cancel [رقم الطلب]');
    const result = await db.cancelOrder(orderId, ctx.from.id);
    await ctx.reply(result.message);
});

bot.command('orders', async (ctx) => {
    const buys = await db.getActiveOrders('buy', 10);
    const sells = await db.getActiveOrders('sell', 10);
    let text = '📊 *طلبات الشراء*\n';
    for (const o of (buys.orders || buys).slice(0, 5)) {
        text += `💰 ${o.price} USDT | 📦 ${o.amount.toFixed(2)} CRYSTAL\n`;
    }
    text += '\n📊 *طلبات البيع*\n';
    for (const o of (sells.orders || sells).slice(0, 5)) {
        text += `💰 ${o.price} USDT | 📦 ${o.amount.toFixed(2)} CRYSTAL\n`;
    }
    await ctx.reply(text, { parse_mode: 'Markdown' });
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
    const pending = await db.getPendingKycRequests();
    if (!pending.length) return ctx.editMessageText('📭 لا توجد طلبات');
    let text = '🆔 *طلبات التوثيق*\n\n';
    for (const req of pending) {
        text += `📋 ${req._id.toString().slice(-8)} | 👤 ${req.fullName}\n`;
    }
    await ctx.editMessageText(text, { parse_mode: 'Markdown' });
});

bot.action('pending_withdraws', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const pending = await db.getPendingWithdraws();
    if (!pending.length) return ctx.editMessageText('📭 لا توجد طلبات سحب');
    let text = '💰 *طلبات السحب*\n\n';
    for (const req of pending) {
        text += `🆔 ${req._id.toString().slice(-8)} | 👤 ${req.userId} | 💰 ${req.amount} USDT\n`;
    }
    await ctx.editMessageText(text, { parse_mode: 'Markdown' });
});

bot.action('pending_deposits', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const pending = await db.getPendingDeposits();
    if (!pending.length) return ctx.editMessageText('📭 لا توجد طلبات إيداع');
    let text = '📤 *طلبات الإيداع*\n\n';
    for (const req of pending) {
        text += `🆔 ${req._id.toString().slice(-8)} | 👤 ${req.userId} | 💰 ${req.amount} USDT\n`;
    }
    await ctx.editMessageText(text, { parse_mode: 'Markdown' });
});

bot.action('global_stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ للأدمن فقط');
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
});

// ========== تشغيل الخادم ==========
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Web server on port ${PORT}`);
    console.log(`🌐 WebApp URL: ${WEBAPP_URL}`);
    console.log(`💎 CRYSTAL Exchange Started`);
    console.log(`📊 Total Supply: 5,000,000 CRYSTAL`);
});

// ========== تشغيل البوت مع معالجة الخطأ 409 ==========
const launchBot = async () => {
    try {
        await db.connect();
        console.log('✅ Database connected');
        
        // حذف webhook
        try {
            await bot.telegram.deleteWebhook();
            console.log('✅ Webhook deleted');
        } catch (error) {
            console.log('⚠️ Webhook delete error:', error.message);
        }
        
        // التحقق من البوت
        const botInfo = await bot.telegram.getMe();
        console.log(`✅ Bot @${botInfo.username} is ready`);
        console.log(`✅ Bot ID: ${botInfo.id}`);
        
        // تشغيل البوت
        await bot.launch({
            polling: {
                timeout: 30,
                limit: 100,
                retryTimeout: 5000
            }
        });
        console.log('🚀 Bot launched successfully');
        console.log('💎 CRYSTAL Exchange is fully operational');
        
    } catch (error) {
        if (error.response?.error_code === 409) {
            console.log('⚠️ Conflict detected (409), retrying in 10 seconds...');
            console.log('⚠️ Make sure only one instance of the bot is running');
            setTimeout(launchBot, 10000);
        } else {
            console.error('❌ Bot launch error:', error.message);
        }
    }
};

// بدء البوت
launchBot();

// إيقاف نظيف
process.once('SIGINT', () => {
    bot.stop('SIGINT');
    server.close();
    console.log('👋 Server stopped');
});
process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
    server.close();
    console.log('👋 Server stopped');
});
