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

// ========== الصفحات الثابتة ==========
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'mining-app', 'index.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'mining-app', 'terms.html')));

// ========== Health Check ==========
app.get('/health', async (req, res) => {
    try {
        const price = await db.getMarketPrice();
        res.json({ status: 'ok', timestamp: new Date(), supply: 5000000, price });
    } catch (e) {
        res.json({ status: 'ok', timestamp: new Date() });
    }
});

// ========== API Routes ==========

// السوق
app.get('/api/market/price', async (req, res) => {
    try {
        const price = await db.getMarketPrice();
        res.json({ success: true, price });
    } catch(e) {
        res.json({ success: true, price: 0.002 });
    }
});

app.get('/api/market/stats', async (req, res) => {
    try {
        const stats = await db.getMarketStats();
        res.json({ success: true, ...stats });
    } catch(e) {
        res.json({ success: true, price: 0.002, buyOrders: 0, sellOrders: 0, volume24h: 0 });
    }
});

app.get('/api/market/candles/:timeframe', async (req, res) => {
    try {
        const candles = await db.getCandlesticks(req.params.timeframe, parseInt(req.query.limit) || 100);
        res.json(candles || []);
    } catch(e) {
        res.json([]);
    }
});

// الأوامر
app.get('/api/orders', async (req, res) => {
    try {
        const orders = await db.getActiveOrders(req.query.type, parseInt(req.query.limit) || 50);
        res.json({ success: true, orders });
    } catch(e) {
        res.json({ success: true, orders: [] });
    }
});

app.get('/api/orders/:userId', async (req, res) => {
    try {
        const orders = await db.getUserOrders(parseInt(req.params.userId));
        res.json(orders || []);
    } catch(e) {
        res.json([]);
    }
});

app.post('/api/order/create', async (req, res) => {
    try {
        const { user_id, type, price, amount } = req.body;
        console.log('📥 POST /api/order/create - Body:', { user_id, type, price, amount });
        
        if (!user_id || !type || !price || !amount) {
            console.log('❌ Missing fields');
            return res.json({ success: false, message: '⚠️ جميع الحقول مطلوبة' });
        }
        
        console.log('🔄 Calling db.createOrder...');
        const result = await db.createOrder(parseInt(user_id), type, parseFloat(price), parseFloat(amount));
        console.log('📤 createOrder result:', JSON.stringify(result));
        
        res.json(result);
    } catch(e) {
        console.error('❌ createOrder API error:', e.message);
        console.error(e.stack);
        res.json({ success: false, message: '❌ حدث خطأ في إنشاء الطلب: ' + e.message });
    }
});

app.post('/api/order/cancel', async (req, res) => {
    try {
        const { order_id, user_id } = req.body;
        if (!order_id || !user_id) {
            return res.json({ success: false, message: '⚠️ معرف الطلب والمستخدم مطلوب' });
        }
        const result = await db.cancelOrder(order_id, parseInt(user_id));
        res.json(result);
    } catch(e) {
        res.json({ success: false, message: '❌ حدث خطأ في إلغاء الطلب' });
    }
});

// المستخدم
app.get('/api/user/:userId', async (req, res) => {
    try {
        const stats = await db.getUserStats(parseInt(req.params.userId));
        if (!stats) {
            return res.json({ usdtBalance: 0, crystalBalance: 0, isVerified: false });
        }
        res.json(stats);
    } catch(e) {
        res.json({ usdtBalance: 0, crystalBalance: 0, isVerified: false });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { user_id, username, first_name, last_name, phone, email, country, city, referrer_id } = req.body;
        if (!user_id) return res.json({ success: false, message: '⚠️ معرف المستخدم مطلوب' });
        
        const result = await db.registerUser(
            parseInt(user_id), username || '', first_name || '', last_name || '',
            phone || '', email || '', country || 'SD', city || '',
            referrer_id ? parseInt(referrer_id) : null, 'ar', req.ip, req.headers['user-agent']
        );
        res.json(result);
    } catch(e) {
        res.json({ success: false, message: '❌ حدث خطأ في التسجيل' });
    }
});

app.get('/api/user/trades/:userId', async (req, res) => {
    try {
        const trades = await db.getUserTradeHistory(parseInt(req.params.userId), 50);
        res.json(trades || []);
    } catch(e) {
        res.json([]);
    }
});

// المحفظة
app.get('/api/wallet/:userId', async (req, res) => {
    try {
        const wallet = await db.getUserWallet(parseInt(req.params.userId));
        res.json({
            usdtBalance: wallet.usdtBalance || 0,
            crystalBalance: wallet.crystalBalance || 0,
            addresses: { bnb: wallet.bnbAddress, polygon: wallet.polygonAddress, solana: wallet.solanaAddress, aptos: wallet.aptosAddress }
        });
    } catch(e) {
        res.json({ usdtBalance: 0, crystalBalance: 0, addresses: {} });
    }
});

app.post('/api/deposit', async (req, res) => {
    try {
        const { user_id, amount, network } = req.body;
        console.log('📥 طلب إيداع:', { user_id, amount, network });
        
        if (!user_id || !amount || !network) {
            return res.json({ success: false, message: '⚠️ جميع الحقول مطلوبة' });
        }
        
        const result = await db.requestDeposit(parseInt(user_id), parseFloat(amount), 'USDT', network);
        console.log('📤 رد الإيداع:', JSON.stringify(result));
        res.json(result);
    } catch(e) {
        console.error('❌ deposit API error:', e);
        res.json({ success: false, message: '❌ حدث خطأ في طلب الإيداع' });
    }
});

app.post('/api/withdraw', async (req, res) => {
    try {
        const { user_id, amount, network, address, twofa_code } = req.body;
        console.log('📥 طلب سحب:', { user_id, amount, network, address: address?.slice(0, 10) + '...' });
        
        if (!user_id || !amount || !network || !address) {
            return res.json({ success: false, message: '⚠️ جميع الحقول مطلوبة' });
        }
        
        const result = await db.requestWithdraw(parseInt(user_id), parseFloat(amount), 'USDT', network, address, twofa_code);
        console.log('📤 رد السحب:', JSON.stringify(result));
        res.json(result);
    } catch(e) {
        console.error('❌ withdraw API error:', e);
        res.json({ success: false, message: '❌ حدث خطأ في طلب السحب' });
    }
});

// KYC
app.get('/api/kyc/status/:userId', async (req, res) => {
    try {
        const status = await db.getKycStatus(parseInt(req.params.userId));
        res.json(status);
    } catch(e) {
        res.json({ status: 'not_submitted' });
    }
});

app.post('/api/kyc/submit', upload.fields([
    { name: 'passportPhoto', maxCount: 1 },
    { name: 'personalPhoto', maxCount: 1 }
]), async (req, res) => {
    try {
        const { user_id, fullName, passportNumber, nationalId, phoneNumber, email, country, city, bankName, bankAccountNumber, bankAccountName } = req.body;
        
        if (!user_id || !fullName) {
            return res.json({ success: false, message: '⚠️ الاسم الكامل ومعرف المستخدم مطلوبان' });
        }
        
        let passportFileId = null;
        let personalFileId = null;
        
        if (global.botInstance) {
            try {
                if (req.files?.passportPhoto?.[0]) {
                    const msg = await global.botInstance.telegram.sendPhoto(
                        ADMIN_IDS[0],
                        { source: req.files.passportPhoto[0].buffer },
                        { caption: `📄 جواز سفر - ${fullName} (${user_id})` }
                    );
                    passportFileId = msg.photo[msg.photo.length - 1].file_id;
                }
                if (req.files?.personalPhoto?.[0]) {
                    const msg = await global.botInstance.telegram.sendPhoto(
                        ADMIN_IDS[0],
                        { source: req.files.personalPhoto[0].buffer },
                        { caption: `📸 صورة شخصية - ${fullName} (${user_id})` }
                    );
                    personalFileId = msg.photo[msg.photo.length - 1].file_id;
                }
            } catch (uploadError) {
                console.error('Photo upload error:', uploadError.message);
            }
        }
        
        const result = await db.createKycRequest(
            parseInt(user_id), fullName, passportNumber || '', nationalId || '',
            phoneNumber || '', email || '', country || 'SD', city || '',
            passportFileId, personalFileId, bankName || '', bankAccountNumber || '', bankAccountName || ''
        );
        res.json(result);
    } catch(e) {
        res.json({ success: false, message: '❌ حدث خطأ في إرسال طلب التوثيق' });
    }
});

// الإحالات
app.get('/api/user/referral/:userId', async (req, res) => {
    try {
        const data = await db.getReferralData(parseInt(req.params.userId));
        res.json(data);
    } catch(e) {
        res.json({ referralCount: 0, referralEarnings: 0, referrals: [] });
    }
});

app.post('/api/referral/transfer', async (req, res) => {
    try {
        const { user_id } = req.body;
        if (!user_id) return res.json({ success: false, message: '⚠️ معرف المستخدم مطلوب' });
        const result = await db.transferReferralEarningsToWallet(parseInt(user_id));
        res.json(result);
    } catch(e) {
        res.json({ success: false, message: '❌ حدث خطأ' });
    }
});

// الدردشة
app.get('/api/chat/global', async (req, res) => {
    try {
        const messages = await db.getGlobalMessages(50);
        res.json(messages || []);
    } catch(e) {
        res.json([]);
    }
});

app.post('/api/chat/send', async (req, res) => {
    try {
        const { senderId, message } = req.body;
        if (!senderId || !message) return res.json({ success: false, message: '⚠️ المرسل والرسالة مطلوبان' });
        const result = await db.sendMessage(parseInt(senderId), null, message);
        res.json({ success: true, message: result });
    } catch(e) {
        res.json({ success: false, message: '❌ حدث خطأ' });
    }
});

// 2FA
app.post('/api/2fa/generate', async (req, res) => {
    try {
        const { user_id } = req.body;
        if (!user_id) return res.json({ success: false, message: '⚠️ معرف المستخدم مطلوب' });
        const result = await db.generate2FASecret(parseInt(user_id));
        res.json(result);
    } catch(e) {
        res.json({ success: false, message: '❌ حدث خطأ' });
    }
});

app.post('/api/2fa/enable', async (req, res) => {
    try {
        const { user_id, code } = req.body;
        if (!user_id || !code) return res.json({ success: false, message: '⚠️ معرف المستخدم والرمز مطلوبان' });
        const result = await db.enable2FA(parseInt(user_id), code);
        res.json(result);
    } catch(e) {
        res.json({ success: false, message: '❌ حدث خطأ' });
    }
});

app.post('/api/2fa/disable', async (req, res) => {
    try {
        const { user_id, code } = req.body;
        if (!user_id || !code) return res.json({ success: false, message: '⚠️ معرف المستخدم والرمز مطلوبان' });
        const result = await db.disable2FA(parseInt(user_id), code);
        res.json(result);
    } catch(e) {
        res.json({ success: false, message: '❌ حدث خطأ' });
    }
});

// معلومات العرض
app.get('/api/supply', async (req, res) => {
    try {
        const supplyCheck = await db.validateTotalSupply();
        res.json({ success: true, ...supplyCheck });
    } catch(e) {
        res.json({ success: true, totalSupply: 5000000, circulating: 0, adminBalance: 5000000 });
    }
});

// ========== معالج الأخطاء ==========
app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err.message);
    res.status(500).json({ success: false, message: '❌ خطأ في الخادم' });
});

// ========== بوت التلجرام ==========
const bot = new Telegraf(process.env.BOT_TOKEN);

// جعل البوت متاحاً عالمياً
global.botInstance = bot;
module.exports.bot = bot;

// ========== أوامر البوت ==========

bot.start(async (ctx) => {
    try {
        const user = ctx.from;
        const referrer = ctx.startPayload ? parseInt(ctx.startPayload) : null;
        
        const result = await db.registerUser(
            user.id, user.username || '', user.first_name || '', user.last_name || '',
            '', '', 'SD', '', referrer, 'ar',
            ctx.message?.chat?.id?.toString() || '',
            ctx.message?.from?.is_bot ? 'Bot' : 'User'
        );
        
        const price = await db.getMarketPrice();
        const supplyCheck = await db.validateTotalSupply();
        
        let welcomeMessage;
        
        if (result.isAdmin) {
            welcomeMessage = 
                `👑 *أهلاً بالأدمن!*\n\n` +
                `💎 *CRYSTAL Exchange*\n` +
                `━━━━━━━━━━━━━━━\n\n` +
                `📦 *رصيدك:* ${supplyCheck.adminBalance.toLocaleString()} CRYSTAL\n` +
                `💰 *السعر الحالي:* ${price} USDT\n` +
                `📊 *1 CRYSTAL = ${(price * 500).toFixed(2)} حبة*\n\n` +
                `🔄 *المتداول في السوق:* ${supplyCheck.circulating.toLocaleString()} CRYSTAL\n` +
                `📦 *إجمالي العرض:* ${supplyCheck.totalSupply.toLocaleString()} CRYSTAL\n\n` +
                `⚡ *أنت المتحكم الوحيد في السوق!*\n` +
                `يمكنك بيع CRYSTAL بالسعر الذي تريده`;
        } else if (result.isNew) {
            welcomeMessage = 
                `🎉 *أهلاً بك في CRYSTAL Exchange!*\n\n` +
                `✨ تم إنشاء حسابك بنجاح\n\n` +
                `👤 *المستخدم:* ${user.first_name}\n` +
                `💰 *السعر الحالي:* ${price} USDT\n` +
                `📊 *1 CRYSTAL = ${(price * 500).toFixed(2)} حبة*\n` +
                `📦 *العرض الكلي:* ${supplyCheck.totalSupply.toLocaleString()} CRYSTAL\n\n` +
                `💡 *للبدء:*\n` +
                `1️⃣ قم بتوثيق حسابك\n` +
                `2️⃣ أودع USDT\n` +
                `3️⃣ اشترِ CRYSTAL من السوق`;
        } else {
            welcomeMessage = 
                `👋 *أهلاً بعودتك ${user.first_name}!*\n\n` +
                `💰 *السعر الحالي:* ${price} USDT\n` +
                `📊 *1 CRYSTAL = ${(price * 500).toFixed(2)} حبة*\n\n` +
                `🚀 *اضغط على الزر لبدء التداول*`;
        }
        
        await ctx.reply(welcomeMessage, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.webApp('💎 فتح منصة التداول', WEBAPP_URL)],
                [Markup.button.url('📜 الشروط والأحكام', `${WEBAPP_URL}/terms`)]
            ])
        });
    } catch (e) {
        console.error('Start error:', e.message);
        await ctx.reply('❌ حدث خطأ. الرجاء المحاولة مرة أخرى.');
    }
});

bot.command('help', async (ctx) => {
    const isUserAdmin = isAdmin(ctx.from.id);
    let text = `📚 *الأوامر المتاحة:*\n\n` +
        `/start - بدء استخدام البوت\n` +
        `/price - عرض سعر CRYSTAL\n` +
        `/balance - عرض رصيدك\n` +
        `/stats - إحصائيات السوق\n` +
        `/supply - معلومات العرض\n` +
        `/orders - عرض الطلبات النشطة\n` +
        `/buy [سعر] [كمية] - أمر شراء\n` +
        `/sell [سعر] [كمية] - أمر بيع\n` +
        `/cancel [رقم] - إلغاء أمر\n` +
        `/referral - الإحالات`;
    
    if (isUserAdmin) {
        text += `\n\n👑 *أوامر الأدمن:*\n` +
            `/admin - لوحة التحكم\n` +
            `/admin_balance - رصيد الأدمن\n` +
            `/kyc_list - طلبات التوثيق\n` +
            `/pending - المعلقات\n` +
            `/fix - فحص وتصحيح النظام\n` +
            `/maintenance - إيقاف التداول للصيانة\n` +
            `/ban [id] - حظر مستخدم\n` +
            `/unban [id] - فك حظر`;
    }
    
    await ctx.reply(text, { parse_mode: 'Markdown' });
});

bot.command('price', async (ctx) => {
    try {
        const price = await db.getMarketPrice();
        const stats = await db.getMarketStats();
        
        await ctx.reply(
            `💎 *سعر CRYSTAL*\n\n` +
            `💰 *السعر:* ${price} USDT\n` +
            `📊 *1 CRYSTAL = ${(price * 500).toFixed(2)} حبة*\n` +
            `📈 *التغير 24h:* ${stats.change24h?.toFixed(2) || 0}%\n` +
            `📊 *الحجم 24h:* ${stats.volume24h?.toFixed(2) || 0} CRYSTAL\n` +
            `🔄 *العرض المتداول:* ${stats.circulatingSupply?.toFixed(2) || 0} CRYSTAL`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {
        await ctx.reply('❌ حدث خطأ');
    }
});

bot.command('supply', async (ctx) => {
    try {
        const supplyCheck = await db.validateTotalSupply();
        
        await ctx.reply(
            `📊 *معلومات العرض*\n\n` +
            `💰 *إجمالي العرض:* ${supplyCheck.totalSupply.toLocaleString()} CRYSTAL\n` +
            `🔄 *في التداول:* ${supplyCheck.circulating.toFixed(2)} CRYSTAL\n` +
            `🔒 *مجمد في أوامر:* ${supplyCheck.frozen.toFixed(2)} CRYSTAL\n` +
            `👑 *مع الأدمن:* ${supplyCheck.adminBalance.toFixed(2)} CRYSTAL\n` +
            `✅ *العرض صحيح:* ${supplyCheck.isValid ? '✅ نعم' : '⚠️ خطأ!'}`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {
        await ctx.reply('❌ حدث خطأ');
    }
});

bot.command('balance', async (ctx) => {
    try {
        const stats = await db.getUserStats(ctx.from.id);
        if (!stats) return ctx.reply('⚠️ استخدم /start للتسجيل أولاً');
        
        let text = `💰 *رصيدك*\n\n` +
            `💎 *CRYSTAL:* ${stats.crystalBalance?.toFixed(2) || 0}\n` +
            `💵 *USDT:* ${stats.usdtBalance?.toFixed(2) || 0}\n\n` +
            `📊 *الصفقات:* ${stats.totalTrades || 0}\n` +
            `📦 *الطلبات المفتوحة:* ${stats.openOrders || 0}`;
        
        if (stats.isAdmin) {
            const supplyCheck = await db.validateTotalSupply();
            text += `\n\n👑 *معلومات الأدمن:*\n` +
                `📦 *العرض الكلي:* ${supplyCheck.totalSupply.toLocaleString()} CRYSTAL\n` +
                `🔄 *المتداول:* ${supplyCheck.circulating.toFixed(2)} CRYSTAL`;
        }
        
        await ctx.reply(text, { parse_mode: 'Markdown' });
    } catch (e) {
        await ctx.reply('❌ حدث خطأ');
    }
});

bot.command('stats', async (ctx) => {
    try {
        const stats = await db.getMarketStats();
        
        await ctx.reply(
            `📊 *إحصائيات السوق*\n\n` +
            `💎 *سعر CRYSTAL:* ${stats.price} USDT\n` +
            `📈 *التغير 24h:* ${stats.change24h?.toFixed(2) || 0}%\n` +
            `📊 *الحجم 24h:* ${stats.volume24h?.toFixed(2) || 0} CRYSTAL\n` +
            `🟢 *شراء:* ${stats.buyOrders}\n` +
            `🔴 *بيع:* ${stats.sellOrders}\n` +
            `🔄 *إجمالي الصفقات:* ${stats.totalTrades}\n` +
            `💰 *إجمالي الحجم:* ${stats.totalVolume?.toFixed(2) || 0} USDT\n\n` +
            `📦 *العرض الكلي:* ${stats.totalSupply?.toLocaleString() || '5,000,000'} CRYSTAL\n` +
            `🔄 *المتداول:* ${stats.circulatingSupply?.toFixed(2) || 0} CRYSTAL`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {
        await ctx.reply('❌ حدث خطأ');
    }
});

bot.command('referral', async (ctx) => {
    try {
        const data = await db.getReferralData(ctx.from.id);
        
        await ctx.reply(
            `👥 *الإحالات*\n\n` +
            `🔗 *رابطك:* \`${data.referralLink}\`\n\n` +
            `👥 *المدعوين:* ${data.referralCount}\n` +
            `💰 *الأرباح:* ${data.referralEarnings?.toFixed(2) || 0} USDT\n` +
            `📊 *العمولة:* ${data.referralCommissionRate}%`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {
        await ctx.reply('❌ حدث خطأ');
    }
});

bot.command('buy', async (ctx) => {
    try {
        const args = ctx.message.text.split(' ');
        if (args.length < 3) return ctx.reply('❌ /buy [السعر] [الكمية]\nمثال: /buy 0.002 1000');
        
        const price = parseFloat(args[1]);
        const amount = parseFloat(args[2]);
        
        if (isNaN(price) || isNaN(amount)) return ctx.reply('❌ أرقام فقط');
        
        const result = await db.createOrder(ctx.from.id, 'buy', price, amount);
        await ctx.reply(result.message || 'تم');
    } catch (e) {
        await ctx.reply('❌ حدث خطأ');
    }
});

bot.command('sell', async (ctx) => {
    try {
        const args = ctx.message.text.split(' ');
        if (args.length < 3) return ctx.reply('❌ /sell [السعر] [الكمية]\nمثال: /sell 0.003 500');
        
        const price = parseFloat(args[1]);
        const amount = parseFloat(args[2]);
        
        if (isNaN(price) || isNaN(amount)) return ctx.reply('❌ أرقام فقط');
        
        const result = await db.createOrder(ctx.from.id, 'sell', price, amount);
        await ctx.reply(result.message || 'تم');
    } catch (e) {
        await ctx.reply('❌ حدث خطأ');
    }
});

bot.command('cancel', async (ctx) => {
    try {
        const orderId = ctx.message.text.split(' ')[1];
        if (!orderId) return ctx.reply('❌ /cancel [رقم الطلب]');
        
        const result = await db.cancelOrder(orderId, ctx.from.id);
        await ctx.reply(result.message || 'تم الإلغاء');
    } catch (e) {
        await ctx.reply('❌ حدث خطأ');
    }
});

bot.command('orders', async (ctx) => {
    try {
        const buys = await db.getActiveOrders('buy', 5);
        const sells = await db.getActiveOrders('sell', 5);
        
        let text = '📊 *أوامر الشراء:*\n';
        const buyList = Array.isArray(buys) ? buys : [];
        for (const o of buyList.slice(0, 5)) {
            text += `💰 ${o.price} USDT | 📦 ${o.amount?.toFixed(2) || 0} CRYSTAL\n`;
        }
        if (!buyList.length) text += 'لا توجد طلبات\n';
        
        text += '\n📊 *أوامر البيع:*\n';
        const sellList = Array.isArray(sells) ? sells : [];
        for (const o of sellList.slice(0, 5)) {
            text += `💰 ${o.price} USDT | 📦 ${o.amount?.toFixed(2) || 0} CRYSTAL\n`;
        }
        if (!sellList.length) text += 'لا توجد طلبات';
        
        await ctx.reply(text, { parse_mode: 'Markdown' });
    } catch (e) {
        await ctx.reply('❌ حدث خطأ');
    }
});

// ========== أوامر الأدمن ==========

bot.command('admin', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) return ctx.reply('⛔ للأدمن فقط');
        
        const pendingKyc = await db.getPendingKycRequests();
        const pendingWithdraws = await db.getPendingWithdraws();
        const pendingDeposits = await db.getPendingDeposits();
        const supplyCheck = await db.validateTotalSupply();
        
        await ctx.reply(
            `👑 *لوحة تحكم الأدمن*\n\n` +
            `📦 *رصيدك:* ${supplyCheck.adminBalance.toLocaleString()} CRYSTAL\n` +
            `🔄 *المتداول:* ${supplyCheck.circulating.toFixed(2)} CRYSTAL\n\n` +
            `🆔 التوثيق: *${pendingKyc.length}*\n` +
            `💰 السحب: *${pendingWithdraws.length}*\n` +
            `📤 الإيداع: *${pendingDeposits.length}*`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback(`🆔 التوثيق (${pendingKyc.length})`, 'admin_kyc')],
                    [Markup.button.callback(`💰 السحب (${pendingWithdraws.length})`, 'admin_withdraws')],
                    [Markup.button.callback(`📤 الإيداع (${pendingDeposits.length})`, 'admin_deposits')],
                    [Markup.button.webApp('💎 فتح المنصة', WEBAPP_URL)]
                ])
            }
        );
    } catch (e) {
        await ctx.reply('❌ حدث خطأ');
    }
});

bot.command('admin_balance', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) return ctx.reply('⛔ للأدمن فقط');
        
        const balance = await db.getAdminBalance(ctx.from.id);
        const supplyCheck = await db.validateTotalSupply();
        
        await ctx.reply(
            `👑 *رصيد الأدمن*\n\n` +
            `💎 *CRYSTAL:* ${balance.crystalBalance.toLocaleString()}\n` +
            `💵 *USDT:* ${balance.usdtBalance.toFixed(2)}\n\n` +
            `📊 *العرض الكلي:* ${supplyCheck.totalSupply.toLocaleString()} CRYSTAL\n` +
            `🔄 *المتداول:* ${supplyCheck.circulating.toFixed(2)} CRYSTAL\n` +
            `📦 *المتبقي:* ${balance.crystalBalance.toFixed(2)} CRYSTAL`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {
        await ctx.reply('❌ حدث خطأ');
    }
});

bot.command('kyc_list', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) return ctx.reply('⛔ للأدمن فقط');
        
        const pending = await db.getPendingKycRequests();
        if (!pending.length) return ctx.reply('📭 لا توجد طلبات');
        
        await ctx.reply(`🆔 *${pending.length} طلبات توثيق*`, { parse_mode: 'Markdown' });
        
        for (const req of pending) {
            const buttons = Markup.inlineKeyboard([
                [
                    Markup.button.callback('✅ قبول', `approve_kyc_${req._id}`),
                    Markup.button.callback('❌ رفض', `reject_kyc_${req._id}`)
                ]
            ]);
            
            await ctx.reply(
                `📋 *${req._id.toString().slice(-8)}*\n👤 ${req.fullName}\n📧 ${req.email || '-'}\n📱 ${req.phoneNumber || '-'}\n🌍 ${req.country || '-'}`,
                { parse_mode: 'Markdown', ...buttons }
            );
            
            if (req.passportPhotoFileId) {
                try { await ctx.replyWithPhoto(req.passportPhotoFileId, { caption: '📄 جواز السفر' }); } catch(e) {}
            }
            if (req.personalPhotoFileId) {
                try { await ctx.replyWithPhoto(req.personalPhotoFileId, { caption: '📸 صورة شخصية' }); } catch(e) {}
            }
        }
    } catch (e) {
        await ctx.reply('❌ حدث خطأ');
    }
});

bot.command('pending', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) return ctx.reply('⛔ للأدمن فقط');
        
        const withdraws = await db.getPendingWithdraws();
        const deposits = await db.getPendingDeposits();
        
        if (!withdraws.length && !deposits.length) {
            return ctx.reply('📭 لا توجد طلبات معلقة');
        }
        
        for (const req of withdraws) {
            await ctx.reply(
                `💰 *سحب*\n🆔 ${req.userId}\n💰 ${req.amount} USDT\n🌐 ${req.network}\n📤 ${req.address?.slice(0, 25)}...`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('✅ تأكيد السحب', `confirm_withdraw_${req._id}`)]
                    ])
                }
            );
        }
        
        for (const req of deposits) {
            await ctx.reply(
                `📤 *إيداع*\n🆔 ${req.userId}\n💰 ${req.amount} USDT\n🌐 ${req.network}`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('✅ تأكيد الإيداع', `confirm_deposit_${req._id}`)]
                    ])
                }
            );
        }
    } catch (e) {
        await ctx.reply('❌ حدث خطأ');
    }
});

bot.command('fix', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) return ctx.reply('⛔ للأدمن فقط');
        
        await ctx.reply('🔧 جاري فحص وتصحيح النظام...');
        
        const fixedOrders = await db.fixStuckOrders();
        const balanceCheck = await db.validateBalances();
        
        await ctx.reply(
            `🔧 *نتيجة الفحص*\n\n` +
            `📋 أوامر مصححة: ${fixedOrders}\n` +
            `✅ الأرصدة سليمة: ${balanceCheck.isValid ? '✅ نعم' : '❌ خطأ - تحتاج تدخل'}\n\n` +
            `📊 *تفاصيل:*\n` +
            `💰 العرض الكلي: ${balanceCheck.totalSupply?.toLocaleString()}\n` +
            `🔄 المتداول: ${balanceCheck.circulating?.toFixed(2)}\n` +
            `🔒 المجمد: ${balanceCheck.frozen?.toFixed(2)}\n` +
            `👑 الأدمن: ${balanceCheck.adminBalance?.toFixed(2)}\n` +
            `📊 المجموع: ${balanceCheck.total?.toFixed(2)}`,
            { parse_mode: 'Markdown' }
        );
        
    } catch (e) {
        await ctx.reply('❌ حدث خطأ');
    }
});

bot.command('maintenance', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) return ctx.reply('⛔ للأدمن فقط');
        
        await ctx.reply('🛑 جاري إيقاف التداول للصيانة...');
        
        const openOrders = await require('./models').Order.find({ status: { $in: ['open', 'partial'] } });
        
        for (const order of openOrders) {
            await db.cancelOrder(order._id, order.userId);
        }
        
        await ctx.reply(`✅ تم إلغاء ${openOrders.length} أمر وإرجاع الأموال\n🔧 يمكنك الآن إجراء الصيانة بأمان`);
        
    } catch (e) {
        await ctx.reply('❌ حدث خطأ');
    }
});

bot.command('ban', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) return ctx.reply('⛔ للأدمن فقط');
        
        const args = ctx.message.text.split(' ');
        const targetId = parseInt(args[1]);
        const reason = args.slice(2).join(' ') || 'مخالفة';
        
        if (!targetId) return ctx.reply('❌ /ban [id] [السبب]');
        
        const result = await db.banUser(targetId, reason);
        await ctx.reply(result.message);
    } catch (e) {
        await ctx.reply('❌ حدث خطأ');
    }
});

bot.command('unban', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) return ctx.reply('⛔ للأدمن فقط');
        
        const args = ctx.message.text.split(' ');
        const targetId = parseInt(args[1]);
        
        if (!targetId) return ctx.reply('❌ /unban [id]');
        
        const result = await db.unbanUser(targetId);
        await ctx.reply(result.message);
    } catch (e) {
        await ctx.reply('❌ حدث خطأ');
    }
});

// ========== Callbacks ==========

bot.action('admin_kyc', async (ctx) => {
    await ctx.answerCbQuery();
    try {
        const pending = await db.getPendingKycRequests();
        if (!pending.length) return ctx.reply('📭 لا توجد طلبات');
        
        for (const req of pending.slice(0, 5)) {
            await ctx.reply(
                `📋 ${req._id.toString().slice(-8)} | 👤 ${req.fullName}`,
                Markup.inlineKeyboard([
                    [Markup.button.callback('✅ قبول', `approve_kyc_${req._id}`), Markup.button.callback('❌ رفض', `reject_kyc_${req._id}`)]
                ])
            );
        }
    } catch (e) {
        await ctx.reply('❌ حدث خطأ');
    }
});

bot.action('admin_withdraws', async (ctx) => {
    await ctx.answerCbQuery();
    try {
        const pending = await db.getPendingWithdraws();
        if (!pending.length) return ctx.reply('📭 لا توجد طلبات');
        
        for (const req of pending.slice(0, 5)) {
            await ctx.reply(
                `💰 ${req.amount} USDT | 👤 ${req.userId} | 🌐 ${req.network}`,
                Markup.inlineKeyboard([[Markup.button.callback('✅ تأكيد', `confirm_withdraw_${req._id}`)]])
            );
        }
    } catch (e) {
        await ctx.reply('❌ حدث خطأ');
    }
});

bot.action('admin_deposits', async (ctx) => {
    await ctx.answerCbQuery();
    try {
        const pending = await db.getPendingDeposits();
        if (!pending.length) return ctx.reply('📭 لا توجد طلبات');
        
        for (const req of pending.slice(0, 5)) {
            await ctx.reply(
                `📤 ${req.amount} USDT | 👤 ${req.userId} | 🌐 ${req.network}`,
                Markup.inlineKeyboard([[Markup.button.callback('✅ تأكيد', `confirm_deposit_${req._id}`)]])
            );
        }
    } catch (e) {
        await ctx.reply('❌ حدث خطأ');
    }
});

bot.action(/approve_kyc_(.+)/, async (ctx) => {
    const requestId = ctx.match[1];
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ غير مصرح');
    await ctx.answerCbQuery('⏳ جاري الموافقة...');
    const result = await db.approveKyc(requestId, ctx.from.id);
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.reply(result.message);
});

bot.action(/reject_kyc_(.+)/, async (ctx) => {
    const requestId = ctx.match[1];
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ غير مصرح');
    await ctx.answerCbQuery('⏳ جاري الرفض...');
    const result = await db.rejectKyc(requestId, ctx.from.id, 'غير مستوفي');
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.reply(result.message);
});

bot.action(/confirm_withdraw_(.+)/, async (ctx) => {
    const requestId = ctx.match[1];
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ غير مصرح');
    await ctx.answerCbQuery('⏳ جاري التأكيد...');
    const result = await db.confirmWithdraw(requestId, 'manual_confirm', ctx.from.id);
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.reply(result.message);
});

bot.action(/confirm_deposit_(.+)/, async (ctx) => {
    const requestId = ctx.match[1];
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ غير مصرح');
    await ctx.answerCbQuery('⏳ جاري التأكيد...');
    const result = await db.confirmDeposit(requestId, 'manual_confirm', ctx.from.id);
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.reply(result.message);
});

bot.catch((err, ctx) => {
    console.error(`❌ Bot error for ${ctx.updateType}:`, err.message);
});

// ========== تشغيل الخادم ==========
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Server on port ${PORT}`);
    console.log(`🌐 URL: ${WEBAPP_URL}`);
    console.log(`👑 Admins: ${ADMIN_IDS.join(', ')}`);
});

(async () => {
    try {
        await db.connect();
        console.log('✅ Database connected');
        
        // بدء مراقبة البلوكشين
        blockchainMonitor.startMonitoring(db);
        console.log('🔍 Blockchain monitor started');
        
        await bot.telegram.deleteWebhook();
        const webhookUrl = `${WEBAPP_URL}/webhook`;
        await bot.telegram.setWebhook(webhookUrl);
        console.log(`✅ Webhook: ${webhookUrl}`);
        
        app.use(bot.webhookCallback('/webhook'));
        
        const botInfo = await bot.telegram.getMe();
        console.log(`✅ Bot @${botInfo.username} is ready`);
        console.log('🚀 CRYSTAL Exchange is running!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
    } catch (error) {
        console.error('❌ Startup error:', error.message);
        console.log('⚠️ Trying polling...');
        try {
            await bot.telegram.deleteWebhook();
            bot.launch();
            console.log('✅ Bot started in polling mode');
        } catch (e) {
            console.error('❌ Polling failed:', e.message);
        }
    }
})();

process.once('SIGINT', async () => {
    await bot.telegram.deleteWebhook();
    bot.stop('SIGINT');
    server.close();
    process.exit(0);
});

process.once('SIGTERM', async () => {
    await bot.telegram.deleteWebhook();
    bot.stop('SIGTERM');
    server.close();
    process.exit(0);
});
