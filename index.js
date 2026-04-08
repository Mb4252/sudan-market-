require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const db = require('./database');
const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const FormData = require('form-data');
const fetch = require('node-fetch');

// ========== إعداد خادم الويب ==========
const app = express();
const PORT = process.env.PORT || 10000;

const upload = multer({ storage: multer.memoryStorage() });

// ========== بديل CORS مدمج (بدون مكتبة خارجية) ==========
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, user_id');
    res.header('Access-Control-Allow-Credentials', true);
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { success: false, message: '⚠️ الكثير من الطلبات، يرجى الانتظار قليلاً' },
    skip: (req) => {
        const userId = req.body?.user_id;
        return userId && ADMIN_IDS.includes(parseInt(userId));
    }
});

app.use(limiter);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'mining-app')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'mining-app', 'index.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'mining-app', 'terms.html')));
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ========== المتغيرات البيئية ==========
const WEBAPP_URL = process.env.WEBAPP_URL || `https://sdm-security-bot.onrender.com`;

// ========== قائمة الأدمن ==========
const ADMIN_IDS = [6701743450, 8181305474];
const ADMIN_ID = ADMIN_IDS[0];
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'hmood19931130';
const BOT_USERNAME = 'my_edu_199311_bot';

const PLATFORM_WITHDRAW_FEE = 0.05;
const PLATFORM_TRADE_FEE = 0.05;

function isAdmin(userId) {
    return ADMIN_IDS.includes(userId);
}

let cachedNetworkFees = {
    bnb: 0.10,
    polygon: 0.05,
    solana: 0.01,
    aptos: 0.02,
    trc20: 0.80,
    erc20: 8.00
};

async function updateCachedNetworkFees() {
    try {
        const bnbFee = db.getNetworkFee('bnb');
        const polygonFee = db.getNetworkFee('polygon');
        const solanaFee = db.getNetworkFee('solana');
        const aptosFee = db.getNetworkFee('aptos');
        
        cachedNetworkFees = {
            bnb: bnbFee,
            polygon: polygonFee,
            solana: solanaFee,
            aptos: aptosFee,
            trc20: 0.80,
            erc20: 8.00
        };
        console.log('✅ Cached network fees updated:', cachedNetworkFees);
    } catch(e) {
        console.log('Failed to update cached fees:', e.message);
    }
}

setInterval(updateCachedNetworkFees, 3600000);
updateCachedNetworkFees();

const SUPPORTED_CURRENCIES = process.env.SUPPORTED_CURRENCIES 
    ? process.env.SUPPORTED_CURRENCIES.split(',') 
    : [
        'USD', 'EUR', 'GBP', 'SAR', 'AED', 'EGP', 'SDG', 'IQD', 'JOD', 'KWD', 
        'QAR', 'BHR', 'OMR', 'TRY', 'INR', 'PKR', 'CNY', 'JPY', 'CAD', 'AUD',
        'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'RUB', 'ZAR', 'MXN', 'BRL', 'NGN',
        'KES', 'GHS', 'TND', 'DZD', 'MAD', 'LYD', 'LBP', 'SYP', 'YER', 'AFN',
        'BDT', 'BND', 'HKD', 'IDR', 'ILS', 'KHR', 'LAK', 'LKR', 'MMK', 'MNT',
        'NPR', 'PHP', 'SGD', 'THB', 'TWD', 'UAH', 'VND'
    ];

let bot;

// ========== API Routes ==========
app.get('/api/global_stats', async (req, res) => res.json(await db.getGlobalStats()));
app.get('/api/user/:userId', async (req, res) => {
    const u = await db.getUser(parseInt(req.params.userId));
    res.json(u || { usdBalance: 0, isVerified: false });
});

app.get('/api/user/light/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const user = await db.getUser(userId);
        const wallet = await db.getUserWallet(userId);
        res.json({
            usdBalance: wallet?.usdBalance || 0,
            rating: user?.rating || 5.0,
            completedTrades: user?.completedTrades || 0,
            successRate: user?.successRate || 100,
            isVerified: user?.isVerified || false,
            onlineStatus: user?.isOnline ? '🟢 متصل' : '⚫ غير متصل'
        });
    } catch(e) {
        res.json({ usdBalance: 0, rating: 5.0, completedTrades: 0, successRate: 100, isVerified: false });
    }
});

app.get('/api/user/stats/:userId', async (req, res) => res.json(await db.getUserStats(parseInt(req.params.userId))));
app.get('/api/user/status/:userId', async (req, res) => {
    const status = await db.getUserOnlineStatus(parseInt(req.params.userId));
    res.json(status);
});
app.get('/api/kyc/status/:userId', async (req, res) => res.json(await db.getKycStatus(parseInt(req.params.userId))));
app.get('/api/leaderboard', async (req, res) => {
    const l = await db.getLeaderboard(15);
    res.json(l.map(x => ({ name: x.firstName || x.username || `مستخدم ${x.userId}`, trades: x.totalTraded || 0, rating: x.rating || 5, verified: x.isVerified, merchant: x.isMerchant })));
});

app.get('/api/offers', async (req, res) => {
    try {
        const type = req.query.type;
        const currency = req.query.currency;
        const sortBy = req.query.sortBy || 'price';
        const order = req.query.order || 'asc';
        const limit = parseInt(req.query.limit) || 10;
        const offset = parseInt(req.query.offset) || 0;
        
        const result = await db.getOffers(type, currency, sortBy, order, limit, offset);
        res.json(result);
    } catch(e) {
        console.error('Offers API error:', e);
        res.json({ offers: [], total: 0 });
    }
});

app.post('/api/offer/create', async (req, res) => res.json(await db.createOffer(parseInt(req.body.user_id), req.body.type, req.body.currency, parseFloat(req.body.fiatAmount), parseFloat(req.body.price), req.body.paymentMethod, req.body.paymentDetails, req.body.bankName, req.body.bankAccountNumber, req.body.bankAccountName, parseFloat(req.body.minAmount), parseFloat(req.body.maxAmount))));
app.post('/api/offer/cancel', async (req, res) => res.json(await db.cancelOffer(req.body.offer_id, parseInt(req.body.user_id))));
app.post('/api/trade/start', async (req, res) => res.json(await db.startTrade(req.body.offer_id, parseInt(req.body.user_id), null)));
app.post('/api/trade/start-partial', async (req, res) => res.json(await db.startTrade(req.body.offer_id, parseInt(req.body.user_id), parseFloat(req.body.amount))));
app.post('/api/trade/confirm', async (req, res) => res.json(await db.confirmPayment(req.body.trade_id, parseInt(req.body.user_id), req.body.proof_image)));
app.post('/api/trade/release', async (req, res) => res.json(await db.releaseCrystals(req.body.trade_id, parseInt(req.body.user_id), req.body.twofa_code || null, req.ip, req.headers['user-agent'] || '')));
app.post('/api/trade/dispute', async (req, res) => res.json(await db.openDispute(req.body.trade_id, parseInt(req.body.user_id), req.body.reason)));
app.post('/api/trade/rate', async (req, res) => res.json(await db.addReview(req.body.trade_id, parseInt(req.body.user_id), parseInt(req.body.rating), req.body.comment)));
app.post('/api/deposit', async (req, res) => res.json(await db.requestDeposit(parseInt(req.body.user_id), parseFloat(req.body.amount), req.body.currency, req.body.network)));
app.post('/api/withdraw', async (req, res) => res.json(await db.requestWithdraw(parseInt(req.body.user_id), parseFloat(req.body.amount), req.body.currency, req.body.network, req.body.address, req.body.twofa_code || null)));
app.post('/api/register', async (req, res) => {
    await db.registerUser(parseInt(req.body.user_id), req.body.username, req.body.first_name, req.body.last_name, req.body.phone, req.body.email, req.body.country, req.body.city, null, req.body.language || 'ar', req.ip, req.headers['user-agent'] || '');
    res.json({ success: true });
});
app.post('/api/update_bank', async (req, res) => res.json(await db.updateBankDetails(parseInt(req.body.user_id), req.body.bankName, req.body.accountNumber, req.body.accountName)));
app.post('/api/set_language', async (req, res) => { await db.setLanguage(parseInt(req.body.user_id), req.body.language); res.json({ success: true }); });
app.get('/api/wallet/:userId', async (req, res) => {
    const w = await db.getUserWallet(parseInt(req.params.userId));
    const u = await db.getUser(parseInt(req.params.userId));
    res.json({ addresses: { bnb: w.bnbAddress, polygon: w.polygonAddress, solana: w.solanaAddress, aptos: w.aptosAddress }, usdBalance: w.usdBalance, bankName: u?.bankName, bankAccountNumber: u?.bankAccountNumber, bankAccountName: u?.bankAccountName, isVerified: u?.isVerified });
});

app.get('/api/user/history/:userId', async (req, res) => {
    const userId = parseInt(req.params.userId);
    const offers = await db.getUserOffersHistory(userId, 20);
    const trades = await db.getUserTradesHistory(userId, 20);
    res.json({ offers, trades });
});

app.get('/api/market/stats', async (req, res) => {
    const stats = await db.getMarketStats();
    res.json(stats);
});

app.post('/api/trade/cancel', async (req, res) => {
    res.json(await db.cancelPendingTrade(req.body.trade_id, parseInt(req.body.user_id)));
});

app.get('/api/top/merchants', async (req, res) => {
    const merchants = await db.getTopMerchants(10);
    res.json(merchants);
});

app.get('/api/user/offers/:userId', async (req, res) => {
    const userId = parseInt(req.params.userId);
    const offers = await db.getUserOffers(userId);
    res.json(offers);
});

app.get('/api/user/trades/:userId', async (req, res) => {
    const userId = parseInt(req.params.userId);
    const trades = await db.getUserTradesHistory(userId, 20);
    res.json(trades);
});

app.get('/api/user/referral/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const referralData = await db.getReferralData(userId);
        res.json(referralData);
    } catch (error) {
        console.error('Referral API error:', error);
        res.json({ 
            referralCount: 0, 
            referralEarnings: 0, 
            referralCommissionRate: 10,
            referrals: [],
            referralLink: `https://t.me/${BOT_USERNAME}?start=${userId}`
        });
    }
});

app.post('/api/referral/transfer', async (req, res) => {
    try {
        const { user_id } = req.body;
        const result = await db.transferReferralEarningsToWallet(parseInt(user_id));
        res.json(result);
    } catch (error) {
        console.error('Referral transfer error:', error);
        res.json({ success: false, message: 'حدث خطأ في الخادم' });
    }
});

app.get('/api/chat/:tradeId/:userId', async (req, res) => {
    try {
        const tradeId = req.params.tradeId;
        const userId = parseInt(req.params.userId);
        const limit = parseInt(req.query.limit) || 50;
        const before = req.query.before || null;
        
        const messages = await db.getChatMessages(tradeId, userId, limit, before);
        const partnerId = await db.getTradeChatPartner(tradeId, userId);
        const unreadCount = await db.getUnreadCount(userId);
        
        res.json({ success: true, messages, partnerId, unreadCount });
    } catch (error) {
        console.error('Chat API error:', error);
        res.json({ success: false, messages: [], error: error.message });
    }
});

app.post('/api/chat/send', async (req, res) => {
    try {
        const { tradeId, senderId, receiverId, message } = req.body;
        
        if (!message || message.trim() === '') {
            return res.json({ success: false, message: 'الرسالة فارغة' });
        }
        
        const chatMessage = await db.sendMessage(tradeId, parseInt(senderId), parseInt(receiverId), message);
        
        if (bot) {
            await bot.telegram.sendMessage(parseInt(receiverId),
                `💬 *رسالة جديدة في الصفقة #${tradeId}*\n\n📝 ${message}\n\n🔗 افتح التطبيق للرد: ${WEBAPP_URL}`,
                { parse_mode: 'Markdown' }
            );
        }
        
        res.json({ success: true, message: chatMessage });
    } catch (error) {
        console.error('Send message error:', error);
        res.json({ success: false, error: error.message });
    }
});

app.post('/api/chat/send-image', upload.single('image'), async (req, res) => {
    try {
        const { tradeId, senderId, receiverId, message } = req.body;
        
        if (!req.file) {
            return res.json({ success: false, message: 'لم يتم رفع صورة' });
        }
        
        let imageFileId = null;
        if (bot) {
            const photoMsg = await bot.telegram.sendPhoto(ADMIN_IDS[0], { source: req.file.buffer });
            imageFileId = photoMsg.photo[photoMsg.photo.length - 1].file_id;
        }
        
        const chatMessage = await db.sendMessage(
            tradeId, parseInt(senderId), parseInt(receiverId), 
            message || '📸 صورة إثبات', imageFileId
        );
        
        if (bot) {
            await bot.telegram.sendPhoto(parseInt(receiverId), imageFileId, {
                caption: `💬 *صورة جديدة في الصفقة #${tradeId}*\n\n📝 ${message || '📸 صورة إثبات'}\n\n🔗 افتح التطبيق: ${WEBAPP_URL}`,
                parse_mode: 'Markdown'
            });
        }
        
        res.json({ success: true, message: chatMessage, imageFileId });
    } catch (error) {
        console.error('Send image error:', error);
        res.json({ success: false, error: error.message });
    }
});

app.post('/api/chat/read', async (req, res) => {
    try {
        const { tradeId, userId } = req.body;
        await db.markMessagesAsRead(tradeId, parseInt(userId));
        res.json({ success: true });
    } catch (error) {
        console.error('Mark read error:', error);
        res.json({ success: false });
    }
});

app.get('/api/chat/unread/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const count = await db.getUnreadCount(userId);
        res.json({ success: true, count });
    } catch (error) {
        console.error('Unread count error:', error);
        res.json({ success: false, count: 0 });
    }
});

app.get('/api/network-fee/:network', async (req, res) => {
    try {
        const network = req.params.network;
        const fee = cachedNetworkFees[network] || 0.10;
        res.json({ success: true, network, fee, currency: 'USD' });
    } catch (error) {
        res.json({ success: false, fee: 0.10 });
    }
});

app.get('/api/user/security/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const user = await db.getUser(userId);
        if (!user) {
            return res.json({ twoFAEnabled: false, warningCount: 0, lastLoginIp: 'غير معروف', completedTrades: 0 });
        }
        res.json({
            twoFAEnabled: user.twoFAEnabled || false,
            warningCount: user.warningCount || 0,
            lastLoginIp: user.lastLoginIp || 'غير معروف',
            completedTrades: user.completedTrades || 0,
            require2FAForRelease: user.require2FAForRelease || true,
            release2FAThreshold: user.release2FAThreshold || 100,
            isFlagged: user.isFlagged || false,
            totalDelays: user.totalDelays || 0
        });
    } catch (error) {
        console.error('Security API error:', error);
        res.json({ twoFAEnabled: false, warningCount: 0, lastLoginIp: 'غير معروف', completedTrades: 0 });
    }
});

app.post('/api/2fa/generate', async (req, res) => {
    try {
        const { user_id } = req.body;
        const result = await db.generate2FASecret(parseInt(user_id));
        res.json(result);
    } catch (error) {
        console.error('2FA generate error:', error);
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/2fa/enable', async (req, res) => {
    try {
        const { user_id, code } = req.body;
        const result = await db.enable2FA(parseInt(user_id), code);
        res.json(result);
    } catch (error) {
        console.error('2FA enable error:', error);
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/2fa/disable', async (req, res) => {
    try {
        const { user_id, code } = req.body;
        const result = await db.disable2FA(parseInt(user_id), code);
        res.json(result);
    } catch (error) {
        console.error('2FA disable error:', error);
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/kyc/submit', upload.fields([
    { name: 'passportPhoto', maxCount: 1 },
    { name: 'personalPhoto', maxCount: 1 }
]), async (req, res) => {
    try {
        const { user_id, fullName, passportNumber, nationalId, phoneNumber, email, country, city, bankName, bankAccountNumber, bankAccountName } = req.body;
        
        console.log('📸 Received KYC submission for user:', user_id);
        
        let passportFileId = null;
        let personalFileId = null;
        
        if (req.files['passportPhoto'] && req.files['passportPhoto'][0] && bot) {
            const passportBuffer = req.files['passportPhoto'][0].buffer;
            const passportMsg = await bot.telegram.sendPhoto(ADMIN_IDS[0], { source: passportBuffer });
            passportFileId = passportMsg.photo[passportMsg.photo.length - 1].file_id;
            console.log('✅ Passport photo sent to admin');
        }
        
        if (req.files['personalPhoto'] && req.files['personalPhoto'][0] && bot) {
            const personalBuffer = req.files['personalPhoto'][0].buffer;
            const personalMsg = await bot.telegram.sendPhoto(ADMIN_IDS[0], { source: personalBuffer });
            personalFileId = personalMsg.photo[personalMsg.photo.length - 1].file_id;
            console.log('✅ Personal photo sent to admin');
        }
        
        const result = await db.createKycRequest(
            parseInt(user_id), fullName, passportNumber, nationalId, phoneNumber, email,
            country, city, passportFileId, personalFileId, bankName, bankAccountNumber, bankAccountName
        );
        
        console.log('📝 KYC Request result:', result.success ? 'Success' : 'Failed');
        
        if (result.success && result.request && bot) {
            const reqData = result.request;
            const shortId = reqData._id.toString().slice(-8);
            
            for (const adminId of ADMIN_IDS) {
                await bot.telegram.sendMessage(adminId,
                    `🆔 *طلب توثيق جديد!*\n\n👤 *المستخدم:* ${reqData.fullName}\n🆔 *المعرف:* \`${user_id}\`\n📋 *رقم الطلب:* \`${shortId}\`\n\n📝 *البيانات:*\n• الاسم: ${reqData.fullName}\n• الجواز: ${reqData.passportNumber || passportNumber}\n• الرقم الوطني: ${reqData.nationalId || nationalId}\n• الهاتف: ${reqData.phoneNumber}\n• البريد: ${reqData.email || 'لا يوجد'}\n• البنك: ${reqData.bankName}\n• رقم الحساب: ${reqData.bankAccountNumber}\n• اسم الحساب: ${reqData.bankAccountName}`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '✅ موافقة', callback_data: `approve_kyc_${shortId}` },
                                { text: '❌ رفض', callback_data: `reject_kyc_${shortId}` }
                            ]]
                        }
                    }
                );
            }
            console.log('✅ Admin notification sent to all admins');
        }
        
        res.json(result);
    } catch (error) {
        console.error('❌ KYC submit error:', error);
        res.json({ success: false, message: error.message });
    }
});

const server = app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Web server running on port ${PORT}`));

const { Telegraf: TelegrafBot } = require('telegraf');
bot = new TelegrafBot(process.env.BOT_TOKEN);

module.exports.bot = bot;

// ========== نظام منع الإغراق ==========
const userLastAction = new Map(), userLastMessage = new Map(), userActionCount = new Map(), userWarningCount = new Map(), bannedUsers = new Map();
const RATE_LIMIT_BOT = {
    ACTION_DELAY: 2000, MESSAGE_DELAY: 1500, MAX_ACTIONS_PER_MINUTE: 8, MAX_MESSAGES_PER_MINUTE: 5,
    MAX_WARNINGS: 2, TEMP_BAN_DURATION: 600000, PERMANENT_BAN_THRESHOLD: 3,
    ADMIN_IDS: ADMIN_IDS
};

function isBanned(userId) {
    if (isAdmin(userId)) return false;
    const ban = bannedUsers.get(userId);
    if (!ban) return false;
    if (ban.expires > Date.now()) return true;
    bannedUsers.delete(userId);
    userWarningCount.delete(userId);
    return false;
}

function trackAction(userId, type = 'action') {
    if (isAdmin(userId)) return { blocked: false };
    
    const now = Date.now();
    const limit = type === 'action' ? RATE_LIMIT_BOT.MAX_ACTIONS_PER_MINUTE : RATE_LIMIT_BOT.MAX_MESSAGES_PER_MINUTE;
    const actions = (userActionCount.get(userId) || []).filter(t => now - t < 60000);
    actions.push(now);
    userActionCount.set(userId, actions);
    
    if (actions.length > limit) {
        const warnings = (userWarningCount.get(userId) || 0) + 1;
        userWarningCount.set(userId, warnings);
        if (warnings >= RATE_LIMIT_BOT.MAX_WARNINGS) {
            const banCount = (bannedUsers.get(userId)?.count || 0) + 1;
            if (banCount >= RATE_LIMIT_BOT.PERMANENT_BAN_THRESHOLD) {
                bannedUsers.set(userId, { expires: Infinity, count: banCount, permanent: true });
                return { blocked: true, reason: '⛔ تم حظر حسابك نهائياً' };
            }
            bannedUsers.set(userId, { expires: now + RATE_LIMIT_BOT.TEMP_BAN_DURATION, count: banCount });
            return { blocked: true, reason: `⚠️ تم حظرك مؤقتاً 10 دقائق` };
        }
        return { blocked: true, reason: `⚠️ تحذير! ${actions.length}/${limit} إجراء` };
    }
    return { blocked: false };
}

async function rateLimitMiddleware(ctx, next) {
    if (isAdmin(ctx.from.id)) return next();
    if (isBanned(ctx.from.id)) { await ctx.answerCbQuery('⛔ محظور مؤقتاً'); return; }
    const now = Date.now();
    if (now - (userLastAction.get(ctx.from.id) || 0) < RATE_LIMIT_BOT.ACTION_DELAY) {
        await ctx.answerCbQuery(`⚠️ انتظر ${Math.ceil((RATE_LIMIT_BOT.ACTION_DELAY - (now - (userLastAction.get(ctx.from.id) || 0))) / 1000)} ثانية`);
        return;
    }
    const track = trackAction(ctx.from.id, 'action');
    if (track.blocked) { await ctx.answerCbQuery(track.reason); return; }
    userLastAction.set(ctx.from.id, now);
    await next();
}

async function messageRateLimitMiddleware(ctx, next) {
    if (isAdmin(ctx.from.id)) return next();
    if (isBanned(ctx.from.id)) { await ctx.reply('⛔ محظور مؤقتاً'); return; }
    const now = Date.now();
    if (now - (userLastMessage.get(ctx.from.id) || 0) < RATE_LIMIT_BOT.MESSAGE_DELAY) return;
    const track = trackAction(ctx.from.id, 'message');
    if (track.blocked) { await ctx.reply(track.reason); return; }
    userLastMessage.set(ctx.from.id, now);
    await next();
}

// ========== القوائم ==========
const startKeyboard = Markup.inlineKeyboard([
    [Markup.button.webApp('🚀 فتح منصة P2P', WEBAPP_URL)],
    [Markup.button.url('📜 الشروط والأحكام', `${WEBAPP_URL}/terms`)]
]);

const mainKeyboard = Markup.inlineKeyboard([
    [Markup.button.webApp('🚀 فتح منصة P2P', WEBAPP_URL)],
    [Markup.button.callback('💰 رصيدي', 'my_balance')],
    [Markup.button.callback('📊 عروض البيع', 'offers_sell')],
    [Markup.button.callback('📊 عروض الشراء', 'offers_buy')],
    [Markup.button.callback('➕ إنشاء عرض', 'create_offer')],
    [Markup.button.callback('📋 صفقاتي', 'my_trades')],
    [Markup.button.callback('📜 تاريخي', 'my_history')],
    [Markup.button.callback('💼 محفظتي', 'my_wallet')],
    [Markup.button.callback('🏦 بيانات البنك', 'bank_details')],
    [Markup.button.callback('🆔 توثيق الهوية', 'kyc_menu')],
    [Markup.button.callback('🏆 المتصدرين', 'leaderboard')],
    [Markup.button.callback('👑 كبار المتداولين', 'top_merchants')],
    [Markup.button.callback('📊 إحصائيات السوق', 'market_stats')],
    [Markup.button.callback('🎁 إحالاتي', 'my_referral')],
    [Markup.button.callback('📖 تعليمات', 'instructions_menu')],
    [Markup.button.callback('🌐 اللغة', 'change_language')],
    [Markup.button.callback('📞 الدعم', 'support')],
    [Markup.button.url('📜 الشروط والأحكام', `${WEBAPP_URL}/terms`)]
]);

const adminKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🆔 طلبات التوثيق', 'pending_kyc')],
    [Markup.button.callback('💰 طلبات السحب', 'pending_withdraws')],
    [Markup.button.callback('📤 طلبات الإيداع', 'pending_deposits')],
    [Markup.button.callback('⚠️ النزاعات', 'pending_disputes')],
    [Markup.button.callback('📊 إحصائيات عامة', 'global_stats')],
    [Markup.button.callback('📅 إحصائيات اليوم', 'today_stats')],
    [Markup.button.callback('🔍 بحث عن مستخدم', 'search_user')],
    [Markup.button.callback('🚫 مستخدمين محظورين', 'banned_users')],
    [Markup.button.callback('🔓 رفع الحظر عن الكل', 'unban_all')],
    [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
]);

const instructionsKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📥 تعليمات الإيداع', 'deposit_instructions')],
    [Markup.button.callback('📤 تعليمات السحب', 'withdraw_instructions')],
    [Markup.button.callback('💵 تحويل الدولار', 'convert_usd_instructions')],
    [Markup.button.callback('🔄 السحب لمنصات أخرى', 'withdraw_to_exchange')],
    [Markup.button.callback('🌐 الشبكات المدعومة', 'supported_networks')],
    [Markup.button.callback('💰 تفصيل الرسوم', 'fee_details')],
    [Markup.button.callback('🛒 البيع بالتجزئة', 'partial_fill_instructions')],
    [Markup.button.callback('❓ الأسئلة الشائعة', 'faq_instructions')],
    [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
]);

// ========== أوامر البوت الأساسية ==========
bot.start(async (ctx) => {
    const user = ctx.from;
    const referrer = ctx.startPayload ? parseInt(ctx.startPayload) : null;
    
    db.registerUser(user.id, user.username, user.first_name, '', '', '', 'SD', '', referrer, 'ar', ctx.message?.chat?.id, ctx.message?.from?.is_bot ? 'Bot' : 'User').catch(e => console.error(e));
    
    await ctx.reply(
        `✨ *مرحباً بك في منصة P2P للتداول!* ✨\n\n👤 *المستخدم:* ${user.first_name}\n\n🔄 *جاري تحميل بياناتك...*\n🚀 *اضغط على الزر أدناه لفتح المنصة*`,
        { parse_mode: 'Markdown', ...startKeyboard }
    );
    
    setTimeout(async () => {
        try {
            const stats = await db.getUserStats(user.id);
            const kycStatus = await db.getKycStatus(user.id);
            const onlineStatus = await db.getUserOnlineStatus(user.id);
            
            let verifiedMsg = '';
            if (stats.isVerified) verifiedMsg = '✅ *حسابك موثق*';
            else if (kycStatus.status === 'pending') verifiedMsg = '⏳ *طلب التوثيق قيد المراجعة*';
            else verifiedMsg = '⚠️ *يرجى توثيق حسابك للمتاجرة*';
            
            await ctx.editMessageText(
                `✨ *مرحباً بك في منصة P2P للتداول!* ✨\n\n👤 *المستخدم:* ${user.first_name}\n💵 *الرصيد:* ${stats.usdBalance.toFixed(2)} USD\n📊 *إجمالي التداول:* ${stats.totalTraded.toFixed(2)} USD\n⭐ *التقييم:* ${stats.rating.toFixed(1)}/5\n✅ *الصفقات المكتملة:* ${stats.completedTrades}\n📈 *نسبة النجاح:* ${stats.successRate || 100}%\n${onlineStatus.statusText}\n${verifiedMsg}\n\n💰 *رسوم المنصة:*\n• سحب: ${PLATFORM_WITHDRAW_FEE} $ (ثابت)\n• تداول P2P: ${PLATFORM_TRADE_FEE} $ (ثابت)\n• رسوم الشبكة: تختلف حسب الشبكة (تتغير كل ساعة)\n\n🌐 *رسوم الشبكة الحالية:*\n• 🟡 BNB: ~${cachedNetworkFees.bnb} $\n• 🟣 POLYGON: ~${cachedNetworkFees.polygon} $\n• 🟢 SOLANA: ~${cachedNetworkFees.solana} $\n• 🔷 APTOS: ~${cachedNetworkFees.aptos} $\n\n🛒 *نظام البيع بالتجزئة:* يمكنك شراء جزء من العرض حسب الحدود التي يحددها البائع\n\n🌐 *أكثر من 50 عملة مدعومة*\n\n🚀 *اضغط على الزر أدناه لفتح المنصة*\n\n💬 *يمكنك الآن الدردشة مع البائع/المشتري داخل التطبيق*`,
                { parse_mode: 'Markdown', ...startKeyboard }
            );
        } catch(e) { console.error(e); }
    }, 200);
});

// ========== الأوامر الأساسية ==========
bot.command('help', async (ctx) => {
    await ctx.reply(`📖 *قائمة المساعدة*\n\n/start - القائمة الرئيسية\n/my_id - معرفك\n/currencies - العملات المدعومة\n/fees - تفصيل الرسوم\n/deposit_help - تعليمات الإيداع\n/withdraw_help - تعليمات السحب\n/faq - الأسئلة الشائعة`, { parse_mode: 'Markdown' });
});

bot.command('my_id', async (ctx) => {
    await ctx.reply(`🆔 *معرفك:* \`${ctx.from.id}\``, { parse_mode: 'Markdown' });
});

bot.command('currencies', async (ctx) => {
    const list = SUPPORTED_CURRENCIES.slice(0, 30).join(', ');
    await ctx.reply(`🌍 *العملات المدعومة (${SUPPORTED_CURRENCIES.length} عملة)*\n\n${list}\n\n✨ *والمزيد...*`, { parse_mode: 'Markdown' });
});

bot.command('fees', async (ctx) => {
    await ctx.reply(`💰 *تفصيل الرسوم*\n\n🏢 *رسوم السحب:* ${PLATFORM_WITHDRAW_FEE} $ (ثابتة)\n🏢 *رسوم التداول:* ${PLATFORM_TRADE_FEE} $ (ثابتة)\n\n🌐 *رسوم الشبكة الحالية:*\n• 🟡 BNB: ~${cachedNetworkFees.bnb} $\n• 🟣 POLYGON: ~${cachedNetworkFees.polygon} $\n• 🟢 SOLANA: ~${cachedNetworkFees.solana} $\n• 🔷 APTOS: ~${cachedNetworkFees.aptos} $\n\n⚠️ رسوم الشبكة تتغير كل ساعة`, { parse_mode: 'Markdown' });
});

bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('⛔ للأدمن فقط');
    await ctx.reply('👑 *لوحة التحكم*', { parse_mode: 'Markdown', ...adminKeyboard });
});

// ========== تشغيل البوت ==========
bot.launch().then(() => {
    console.log('🚀 P2P Exchange Bot running');
    console.log('👑 Admins:', ADMIN_IDS.join(', '));
    console.log('💰 Platform Fees: Withdraw=' + PLATFORM_WITHDRAW_FEE + '$, Trade=' + PLATFORM_TRADE_FEE + '$');
    console.log('💬 Chat System: Active with 15min reminders');
    console.log('🎁 Referral System: Active with bot @my_edu_199311_bot');
    console.log('🛒 Partial Fill System: Active');
    console.log('🌍 Currencies Supported: ' + SUPPORTED_CURRENCIES.length + ' currencies');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// ========== أزرار البوت المختصرة ==========
bot.action('back_to_menu', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const stats = await db.getUserStats(ctx.from.id);
    const text = `✨ القائمة الرئيسية\n👤 ${ctx.from.first_name}\n💵 ${stats.usdBalance.toFixed(2)} USD\n⭐ ${stats.rating.toFixed(1)}/5\n✅ ${stats.completedTrades} صفقة\n💰 رسوم السحب: ${PLATFORM_WITHDRAW_FEE}$\n🛒 بيع بالتجزئة متاح\n🌍 أكثر من 50 عملة مدعومة`;
    const kb = isAdmin(ctx.from.id) ? adminKeyboard : mainKeyboard;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb });
});

bot.action('my_balance', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const stats = await db.getUserStats(ctx.from.id);
    await ctx.editMessageText(`💰 *رصيدك*\n💵 ${stats.usdBalance.toFixed(2)} USD\n⭐ ${stats.rating.toFixed(1)}/5\n✅ ${stats.completedTrades} صفقة`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('my_referral', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const referralData = await db.getReferralData(ctx.from.id);
    let text = `🎁 *الإحالات*\n👥 المدعوين: ${referralData.referralCount}\n💰 رصيد: ${referralData.referralEarnings.toFixed(2)} USD\n📊 عمولة: ${referralData.referralCommissionRate}%\n\n🔗 \`${referralData.referralLink}\``;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('💸 تحويل', 'transfer_referral')], [Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('transfer_referral', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery('🔄 جاري...');
    const result = await db.transferReferralEarningsToWallet(ctx.from.id);
    await ctx.answerCbQuery(result.message);
    await ctx.editMessageText(result.message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'my_referral')]]) });
});

bot.action('my_wallet', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const w = await db.getUserWallet(ctx.from.id);
    const stats = await db.getUserStats(ctx.from.id);
    await ctx.editMessageText(`💼 محفظتي\n💵 ${stats.usdBalance.toFixed(2)} USD\n🎁 إحالات: ${stats.referralEarnings?.toFixed(2) || 0} USD\n🟡 BNB: \`${w.bnbAddress.slice(0, 10)}...\``, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('instructions_menu', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(`📖 *قائمة التعليمات*`, { parse_mode: 'Markdown', ...instructionsKeyboard });
});

bot.action('fee_details', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(`💰 *تفصيل رسوم المنصة*\n\n🏢 *رسوم السحب:* ${PLATFORM_WITHDRAW_FEE} $ (ثابتة)\n🏢 *رسوم التداول P2P:* ${PLATFORM_TRADE_FEE} $ (ثابتة)\n\n🌐 *رسوم الشبكة الحالية:*\n• 🟡 BNB: ~${cachedNetworkFees.bnb} $\n• 🟣 POLYGON: ~${cachedNetworkFees.polygon} $\n• 🟢 SOLANA: ~${cachedNetworkFees.solana} $\n• 🔷 APTOS: ~${cachedNetworkFees.aptos} $\n\n⚠️ رسوم الشبكة تتغير كل ساعة`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'instructions_menu')]]) });
});

bot.action('supported_networks', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(`🌐 *الشبكات ورسومها الحالية*\n🟡 BNB ~${cachedNetworkFees.bnb} $\n🟣 POLYGON ~${cachedNetworkFees.polygon} $\n🟢 SOLANA ~${cachedNetworkFees.solana} $\n🔷 APTOS ~${cachedNetworkFees.aptos} $\n💠 TRC-20 ~0.80 $\n⬜ ERC-20 ~8.00 $\n\n🏢 رسوم المنصة: ${PLATFORM_WITHDRAW_FEE} $`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'instructions_menu')]]) });
});

bot.action('partial_fill_instructions', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(`🛒 *نظام البيع بالتجزئة (Partial Fill)*\n\n📌 *كيف يعمل؟*\n• البائع يضع عرض بيع بكمية كبيرة\n• يحدد الحد الأدنى والحد الأقصى لكل مشتري\n• المشتري يمكنه شراء جزء من العرض\n• النظام يحجز المبلغ المطلوب فقط من رصيد البائع\n• العرض يبقى موجوداً بالمبلغ المتبقي`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'instructions_menu')]]) });
});

bot.action('faq_instructions', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(`❓ *الأسئلة الشائعة*\n💵 إيداع: مجاني\n💰 سحب: ${PLATFORM_WITHDRAW_FEE}$ + رسوم الشبكة\n📊 تداول: ${PLATFORM_TRADE_FEE}$\n⏱️ وقت: 5-30د\n🔐 2FA: إلزامي فوق 100$\n💰 حد الإيداع: 1$\n💰 حد السحب: 5$\n🛒 بيع بالتجزئة: نعم\n🌍 عملات مدعومة: أكثر من 50 عملة`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'instructions_menu')]]) });
});

bot.action('kyc_menu', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(`🆔 *توثيق الهوية*\n\n⚠️ حساب غير موثق\n📝 أرسل /kyc [الاسم] [رقم الجواز] [الرقم الوطني] [رقم الهاتف]`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('my_trades', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const stats = await db.getUserStats(ctx.from.id);
    await ctx.editMessageText(`📋 صفقاتي\n✅ ${stats.completedTrades} مكتملة`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('leaderboard', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const leaders = await db.getLeaderboard(5);
    let text = '🏆 المتصدرين\n';
    for (let i = 0; i < leaders.length; i++) {
        text += `${i+1}. ${leaders[i].firstName}\n💰 ${leaders[i].totalTraded?.toFixed(2) || 0} USD\n`;
    }
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('change_language', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText('🌐 اللغة', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🇸🇦 العربية', 'lang_ar'), Markup.button.callback('🇬🇧 English', 'lang_en')], [Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
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

bot.action('support', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(`📞 الدعم\n👤 @${ADMIN_USERNAME}`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.url('📨 تواصل', `https://t.me/${ADMIN_USERNAME}`)], [Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});
