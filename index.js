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
// ========== تم تعديل رابط الإحالة إلى الرابط الصحيح ==========
const BOT_USERNAME = 'my_edu_199311_bot';

// رسوم المنصة الثابتة
const PLATFORM_WITHDRAW_FEE = 0.05;  // 0.05 دولار للسحب
const PLATFORM_TRADE_FEE = 0.05;     // 0.05 دولار للتداول

function isAdmin(userId) {
    return ADMIN_IDS.includes(userId);
}

// رسوم الشبكة الافتراضية (سيتم تحديثها من قاعدة البيانات)
let cachedNetworkFees = {
    bnb: 0.10,
    polygon: 0.05,
    solana: 0.01,
    aptos: 0.02,
    trc20: 0.80,
    erc20: 8.00
};

// تحديث رسوم الشبكة المخبأة كل ساعة
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

// تحديث كل ساعة
setInterval(updateCachedNetworkFees, 3600000);
updateCachedNetworkFees();

// ========== دعم أكثر من 50 عملة (تم التوسيع) ==========
const SUPPORTED_CURRENCIES = process.env.SUPPORTED_CURRENCIES 
    ? process.env.SUPPORTED_CURRENCIES.split(',') 
    : [
        'USD', 'EUR', 'GBP', 'SAR', 'AED', 'EGP', 'SDG', 'IQD', 'JOD', 'KWD', 
        'QAR', 'BHR', 'OMR', 'TRY', 'INR', 'PKR', 'CNY', 'JPY', 'CAD', 'AUD',
        'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'RUB', 'ZAR', 'MXN', 'BRL', 'NGN',
        'KES', 'GHS', 'TND', 'DZD', 'MAD', 'LYD', 'LBP', 'SYP', 'YER', 'AFN',
        'BDT', 'BND', 'HKD', 'IDR', 'ILS', 'KHR', 'LAK', 'LKR', 'MMK', 'MNT',
        'NPR', 'PHP', 'SGD', 'THB', 'TWD', 'UAH', 'VND', 'XOF', 'XAF', 'GMD'
    ];

const PAYMENT_METHODS = process.env.PAYMENT_METHODS 
    ? process.env.PAYMENT_METHODS.split(',') 
    : ['bank_transfer', 'paypal', 'visa', 'mastercard', 'fawry', 'instapay', 'vodafone_cash', 'orange_cash'];

const SUDAN_BANKS = process.env.SUDAN_BANKS 
    ? process.env.SUDAN_BANKS.split(',') 
    : [
        'Bank of Khartoum', 'Blue Nile Mashreq Bank', 'Al Salam Bank', 'Agricultural Bank',
        'Al Baraka Bank', 'Al Nilein Bank', 'Al Shamal Islamic Bank', 'Animal Resources Bank',
        'Bank of Sudan', 'Byblos Bank', 'Egyptian Sudanese Bank', 'Industrial Development Bank',
        'National Bank of Abu Dhabi', 'National Bank of Egypt', 'National Bank of Sudan',
        'Omdurman National Bank', 'Qatar National Bank', 'Saudi Sudanese Bank',
        'Sudanese French Bank', 'United Capital Bank'
    ];

let bot;

// ========== API Routes الأساسية ==========
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

// ========== نقاط API لنظام الإحالات ==========
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

// ========== نقاط API لنظام الدردشة ==========
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
                `💬 *رسالة جديدة في الصفقة #${tradeId}*\n\n` +
                `📝 ${message}\n\n` +
                `🔗 افتح التطبيق للرد: ${WEBAPP_URL}`,
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

// ========== نقطة API لرسوم الشبكة ==========
app.get('/api/network-fee/:network', async (req, res) => {
    try {
        const network = req.params.network;
        const fee = cachedNetworkFees[network] || 0.10;
        res.json({ success: true, network, fee, currency: 'USD' });
    } catch (error) {
        res.json({ success: false, fee: 0.10 });
    }
});

// ========== نقاط API لنظام الأمان و 2FA ==========
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

// ========== نقطة استقبال طلبات التوثيق (KYC) ==========
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
                    `🆔 *طلب توثيق جديد!*\n\n` +
                    `👤 *المستخدم:* ${reqData.fullName}\n` +
                    `🆔 *المعرف:* \`${user_id}\`\n` +
                    `📋 *رقم الطلب:* \`${shortId}\`\n\n` +
                    `📝 *البيانات:*\n` +
                    `• الاسم: ${reqData.fullName}\n` +
                    `• الجواز: ${reqData.passportNumber || passportNumber}\n` +
                    `• الرقم الوطني: ${reqData.nationalId || nationalId}\n` +
                    `• الهاتف: ${reqData.phoneNumber}\n` +
                    `• البريد: ${reqData.email || 'لا يوجد'}\n` +
                    `• البنك: ${reqData.bankName}\n` +
                    `• رقم الحساب: ${reqData.bankAccountNumber}\n` +
                    `• اسم الحساب: ${reqData.bankAccountName}`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '✅ موافقة', callback_data: `approve_kyc_${shortId}` },
                                    { text: '❌ رفض', callback_data: `reject_kyc_${shortId}` }
                                ]
                            ]
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

// ========== تشغيل الخادم ==========
const server = app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Web server on port ${PORT}`));

// ========== إعداد بوت التلجرام ==========
const { Telegraf: TelegrafBot } = require('telegraf');
bot = new TelegrafBot(process.env.BOT_TOKEN);

// تصدير البوت للاستخدام في database.js
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
        `✨ *مرحباً بك في منصة P2P للتداول!* ✨\n\n` +
        `👤 *المستخدم:* ${user.first_name}\n\n` +
        `🔄 *جاري تحميل بياناتك...*\n` +
        `🚀 *اضغط على الزر أدناه لفتح المنصة*`,
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
                `✨ *مرحباً بك في منصة P2P للتداول!* ✨\n\n` +
                `👤 *المستخدم:* ${user.first_name}\n` +
                `💵 *الرصيد:* ${stats.usdBalance.toFixed(2)} USD\n` +
                `📊 *إجمالي التداول:* ${stats.totalTraded.toFixed(2)} USD\n` +
                `⭐ *التقييم:* ${stats.rating.toFixed(1)}/5\n` +
                `✅ *الصفقات المكتملة:* ${stats.completedTrades}\n` +
                `📈 *نسبة النجاح:* ${stats.successRate || 100}%\n` +
                `${onlineStatus.statusText}\n` +
                `${verifiedMsg}\n\n` +
                `💰 *رسوم المنصة:*\n` +
                `• سحب: ${PLATFORM_WITHDRAW_FEE} $ (ثابت)\n` +
                `• تداول P2P: ${PLATFORM_TRADE_FEE} $ (ثابت)\n` +
                `• رسوم الشبكة: تختلف حسب الشبكة (تتغير كل ساعة)\n\n` +
                `🌐 *رسوم الشبكة الحالية:*\n` +
                `• 🟡 BNB: ~${cachedNetworkFees.bnb} $\n` +
                `• 🟣 POLYGON: ~${cachedNetworkFees.polygon} $\n` +
                `• 🟢 SOLANA: ~${cachedNetworkFees.solana} $\n` +
                `• 🔷 APTOS: ~${cachedNetworkFees.aptos} $\n\n` +
                `🛒 *نظام البيع بالتجزئة:* يمكنك شراء جزء من العرض حسب الحدود التي يحددها البائع\n\n` +
                `🌐 *أكثر من 50 عملة مدعومة* تشمل: USD, EUR, GBP, SAR, AED, EGP, SDG, IQD, TRY, INR, PKR, CNY, JPY وغيرها\n\n` +
                `🚀 *اضغط على الزر أدناه لفتح المنصة*\n\n` +
                `💬 *يمكنك الآن الدردشة مع البائع/المشتري داخل التطبيق*`,
                { parse_mode: 'Markdown', ...startKeyboard }
            );
        } catch(e) { console.error(e); }
    }, 200);
});

// ========== أزرار التعليمات الجديدة ==========
bot.action('fee_details', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
        `💰 *تفصيل رسوم المنصة*\n\n` +
        `🏢 *رسوم السحب:* ${PLATFORM_WITHDRAW_FEE} $ (ثابتة)\n` +
        `🏢 *رسوم التداول P2P:* ${PLATFORM_TRADE_FEE} $ (ثابتة)\n\n` +
        `🌐 *رسوم الشبكة الحالية:*\n` +
        `• 🟡 BNB (BEP-20): ~${cachedNetworkFees.bnb} $\n` +
        `• 🟣 POLYGON: ~${cachedNetworkFees.polygon} $\n` +
        `• 🟢 SOLANA: ~${cachedNetworkFees.solana} $\n` +
        `• 🔷 APTOS: ~${cachedNetworkFees.aptos} $\n` +
        `• 💠 TRC-20: ~0.80 $\n` +
        `• ⬜ ERC-20: ~8.00 $\n\n` +
        `📊 *إجمالي رسوم السحب:* رسوم المنصة (${PLATFORM_WITHDRAW_FEE}$) + رسوم الشبكة\n` +
        `⚠️ *ملاحظة:* رسوم الشبكة تتغير كل ساعة حسب ازدحام الشبكة`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'instructions_menu')]]) }
    );
});

bot.action('partial_fill_instructions', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
        `🛒 *نظام البيع بالتجزئة (Partial Fill)*\n\n` +
        `📌 *كيف يعمل؟*\n` +
        `• البائع يضع عرض بيع بكمية كبيرة (مثلاً 10,000 دولار)\n` +
        `• يحدد الحد الأدنى والحد الأقصى لكل مشتري\n` +
        `• المشتري يمكنه شراء جزء من العرض (مثلاً 500 دولار)\n` +
        `• النظام يحجز المبلغ المطلوب فقط من رصيد البائع\n` +
        `• العرض يبقى موجوداً بالمبلغ المتبقي حتى ينتهي\n\n` +
        `💰 *مثال:*\n` +
        `• عرض: 10,000 SDG بسعر 560 (≈ 17.86 USD)\n` +
        `• الحدود: 100 - 1,000 SDG\n` +
        `• يمكنك شراء 500 SDG فقط بدلاً من 10,000\n\n` +
        `✅ *مميزات النظام:*\n` +
        `• مرونة أكبر للمشترين\n` +
        `• فرصة لشراء كميات تناسب ميزانيتك\n` +
        `• البائع يبيع كمية أكبر بعدة صفقات صغيرة`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'instructions_menu')]]) }
    );
});

bot.command('help', async (ctx) => {
    await ctx.reply(
        `📖 *قائمة المساعدة*\n\n` +
        `📥 /deposit_help - تعليمات الإيداع\n` +
        `📤 /withdraw_help - تعليمات السحب\n` +
        `💵 /convert_help - تحويل الدولار\n` +
        `🌐 /networks_help - الشبكات المدعومة\n` +
        `💰 /fees - تفصيل الرسوم\n` +
        `🛒 /partial_help - البيع بالتجزئة\n` +
        `❓ /faq - الأسئلة الشائعة\n` +
        `🌍 /currencies - قائمة العملات المدعومة\n\n` +
        `💬 *الدردشة متاحة داخل التطبيق مع البائع/المشتري*`,
        { parse_mode: 'Markdown' }
    );
});

// ========== أمر عرض العملات المدعومة ==========
bot.command('currencies', async (ctx) => {
    const currenciesList = SUPPORTED_CURRENCIES.slice(0, 30).join(', ');
    const totalCount = SUPPORTED_CURRENCIES.length;
    await ctx.reply(
        `🌍 *العملات المدعومة (${totalCount} عملة)*\n\n` +
        `${currenciesList}\n\n` +
        `✨ *والمزيد...*\n\n` +
        `📌 يمكنك التداول بجميع هذه العملات داخل المنصة`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('fees', async (ctx) => {
    await ctx.reply(
        `💰 *تفصيل الرسوم*\n\n` +
        `🏢 *رسوم السحب:* ${PLATFORM_WITHDRAW_FEE} $ (ثابتة)\n` +
        `🏢 *رسوم التداول:* ${PLATFORM_TRADE_FEE} $ (ثابتة)\n\n` +
        `🌐 *رسوم الشبكة الحالية:*\n` +
        `• 🟡 BNB: ~${cachedNetworkFees.bnb} $\n` +
        `• 🟣 POLYGON: ~${cachedNetworkFees.polygon} $\n` +
        `• 🟢 SOLANA: ~${cachedNetworkFees.solana} $\n` +
        `• 🔷 APTOS: ~${cachedNetworkFees.aptos} $\n` +
        `• 💠 TRC-20: ~0.80 $\n` +
        `• ⬜ ERC-20: ~8.00 $\n\n` +
        `⚠️ رسوم الشبكة تتغير كل ساعة`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('partial_help', async (ctx) => {
    await ctx.reply(
        `🛒 *نظام البيع بالتجزئة*\n\n` +
        `• يمكنك شراء جزء من عرض البيع\n` +
        `• أدخل المبلغ الذي تريد شراءه في حقل "المبلغ المطلوب"\n` +
        `• يجب أن يكون المبلغ بين الحد الأدنى والأقصى للعرض\n` +
        `• سيتم خصم المبلغ المطلوب فقط من رصيد البائع\n` +
        `• العرض يبقى موجوداً بالكمية المتبقية\n\n` +
        `💰 مثال: عرض 10,000 SDG → يمكنك شراء 500 SDG فقط`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('deposit_help', async (ctx) => {
    const wallet = await db.getUserWallet(ctx.from.id);
    await ctx.reply(
        `📥 *كيفية الإيداع*\n\n` +
        `🟡 BNB: \`${wallet.bnbAddress}\`\n` +
        `🟣 POLYGON: \`${wallet.polygonAddress}\`\n` +
        `🟢 SOLANA: \`${wallet.solanaAddress}\`\n` +
        `🔷 APTOS: \`${wallet.aptosAddress}\`\n\n` +
        `💰 *الحد الأدنى للإيداع:* 1 $\n` +
        `⚠️ تأكد من الشبكة - الإرسال الخاطئ يؤدي لفقدان الأموال`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('withdraw_help', async (ctx) => {
    await ctx.reply(
        `📤 *كيفية السحب*\n\n` +
        `1. افتح التطبيق\n` +
        `2. اذهب إلى "محفظتي"\n` +
        `3. أدخل المبلغ والعنوان\n` +
        `4. اختر الشبكة\n` +
        `5. أدخل رمز 2FA\n\n` +
        `💰 *الحد الأدنى للسحب:* 5 $\n` +
        `🏢 *رسوم المنصة:* ${PLATFORM_WITHDRAW_FEE} $\n` +
        `🌐 *رسوم الشبكة الحالية:*\n` +
        `• 🟡 BNB: ~${cachedNetworkFees.bnb} $\n` +
        `• 🟣 POLYGON: ~${cachedNetworkFees.polygon} $\n` +
        `• 🟢 SOLANA: ~${cachedNetworkFees.solana} $\n` +
        `• 🔷 APTOS: ~${cachedNetworkFees.aptos} $\n\n` +
        `⚠️ إجمالي الرسوم = ${PLATFORM_WITHDRAW_FEE}$ + رسوم الشبكة`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('convert_help', async (ctx) => {
    await ctx.reply(
        `💵 *تحويل الدولار*\n\n` +
        `1. اشتر USDT/BUSD من Binance\n` +
        `2. اختر شبكة BEP-20\n` +
        `3. انسخ عنوان محفظتك\n` +
        `4. أرسل العملة\n` +
        `5. ستتحول تلقائياً لدولار\n\n` +
        `💰 *الحد الأدنى للإيداع:* 1 $`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('networks_help', async (ctx) => {
    await ctx.reply(
        `🌐 *الشبكات المدعومة ورسومها الحالية*\n\n` +
        `🟡 BNB - رسوم الشبكة: ~${cachedNetworkFees.bnb} $\n` +
        `🟣 POLYGON - رسوم الشبكة: ~${cachedNetworkFees.polygon} $\n` +
        `🟢 SOLANA - رسوم الشبكة: ~${cachedNetworkFees.solana} $\n` +
        `🔷 APTOS - رسوم الشبكة: ~${cachedNetworkFees.aptos} $\n` +
        `💠 TRC-20 - رسوم الشبكة: ~0.80 $\n` +
        `⬜ ERC-20 - رسوم الشبكة: ~8.00 $\n\n` +
        `🏢 *رسوم المنصة الثابتة:* ${PLATFORM_WITHDRAW_FEE} $\n` +
        `⚠️ الرسوم تتغير كل ساعة حسب ازدحام الشبكة`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('faq', async (ctx) => {
    await ctx.reply(
        `❓ *الأسئلة الشائعة*\n\n` +
        `💵 *عمولة الإيداع؟* مجاني (رسوم الشبكة فقط)\n` +
        `💰 *عمولة السحب؟* ${PLATFORM_WITHDRAW_FEE} $ (ثابتة) + رسوم الشبكة\n` +
        `📊 *عمولة التداول P2P؟* ${PLATFORM_TRADE_FEE} $ (ثابتة)\n` +
        `⏱️ *وقت وصول الأموال؟* إيداع 5-30د، سحب حتى 24 ساعة\n` +
        `🔐 *هل أحتاج 2FA؟* إلزامي للمبالغ فوق 100 دولار\n` +
        `🌐 *ما هي الشبكات المدعومة؟* BEP-20, Polygon, Solana, Aptos\n` +
        `💬 *هل توجد دردشة؟* نعم، داخل التطبيق\n` +
        `💰 *الحد الأدنى للإيداع؟* 1 $\n` +
        `💰 *الحد الأدنى للسحب؟* 5 $\n` +
        `🛒 *البيع بالتجزئة؟* نعم، يمكن شراء جزء من العرض\n` +
        `🌍 *كم عملة مدعومة؟* أكثر من 50 عملة`,
        { parse_mode: 'Markdown' }
    );
});

// ========== باقي أوامر البوت ==========
bot.command('my_id', async (ctx) => {
    await ctx.reply(`🆔 *معرفك:* \`${ctx.from.id}\``, { parse_mode: 'Markdown' });
});

bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('⛔ للأدمن فقط');
    await ctx.reply('👑 *لوحة التحكم*', { parse_mode: 'Markdown', ...adminKeyboard });
});

// ========== زر الإحالات (تم تعديل الرابط) ==========
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

// ========== الرصيد ==========
bot.action('my_balance', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const stats = await db.getUserStats(ctx.from.id);
    await ctx.editMessageText(
        `💰 *رصيدك*\n💵 ${stats.usdBalance.toFixed(2)} USD\n⭐ ${stats.rating.toFixed(1)}/5\n✅ ${stats.completedTrades} صفقة\n🎁 إحالات: ${stats.referralEarnings?.toFixed(2) || 0} USD`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) }
    );
});

// ========== عروض البيع ==========
bot.action('offers_sell', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const offers = await db.getOffers('sell', null, 'price', 'asc', 15);
    if (!offers.offers?.length) return ctx.editMessageText('📭 لا توجد عروض', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    let text = '🟢 *عروض البيع*\n🛒 *يدعم البيع بالتجزئة - يمكن شراء جزء من العرض*\n\n';
    for (const o of offers.offers.slice(0, 10)) {
        const remaining = o.remainingAmount || o.fiatAmount;
        text += `👤 ${o.firstName || o.username}\n💰 ${remaining} / ${o.fiatAmount} ${o.currency} | 📊 ${o.price}\n📦 المتبقي: ${(remaining / o.price).toFixed(2)} USD\n🆔 \`${o._id}\`\n━━━━━━━━━━━━━━━━━━\n`;
    }
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔄 تحديث', 'offers_sell'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

// ========== عروض الشراء ==========
bot.action('offers_buy', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const offers = await db.getOffers('buy', null, 'price', 'desc', 15);
    if (!offers.offers?.length) return ctx.editMessageText('📭 لا توجد عروض', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    let text = '🔴 *عروض الشراء*\n\n';
    for (const o of offers.offers.slice(0, 10)) {
        text += `👤 ${o.firstName || o.username}\n💰 ${o.fiatAmount} ${o.currency} | 📊 ${o.price}\n🆔 \`${o._id}\`\n━━━━━━━━━━━━━━━━━━\n`;
    }
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔄 تحديث', 'offers_buy'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

// ========== إنشاء عرض ==========
bot.action('create_offer', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const user = await db.getUser(ctx.from.id);
    if (!user.isVerified) {
        await ctx.editMessageText(`⚠️ يرجى توثيق حسابك`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🆔 توثيق', 'kyc_menu'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
        return;
    }
    await ctx.editMessageText(
        `➕ *إنشاء عرض*\n/sell [العملة] [المبلغ] [السعر] [طريقة] [تفاصيل]\n/buy [العملة] [المبلغ] [السعر] [طريقة] [تفاصيل]\nمثال: /sell SDG 100000 560 بنكي "بنك الخرطوم"\n\n` +
        `📌 *ملاحظة:* عروض البيع تدعم نظام البيع بالتجزئة - يمكن للمشترين شراء جزء من العرض\n` +
        `💰 *رسوم التداول:* ${PLATFORM_TRADE_FEE} $ (ثابتة)\n\n` +
        `🌍 *العملات المدعومة:* ${SUPPORTED_CURRENCIES.slice(0, 15).join(', ')}... (أكثر من 50 عملة)`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) }
    );
});

// ========== أوامر التداول ==========
bot.command('sell', async (ctx) => {
    const user = await db.getUser(ctx.from.id);
    if (!user.isVerified) return ctx.reply('⚠️ يرجى توثيق حسابك');
    const args = ctx.message.text.split(' ');
    if (args.length < 6) return ctx.reply('❌ /sell [العملة] [المبلغ] [السعر] [طريقة] [تفاصيل]\n🌍 العملات المدعومة: ' + SUPPORTED_CURRENCIES.slice(0, 10).join(', '));
    const currency = args[1].toUpperCase();
    const fiatAmount = parseFloat(args[2]);
    const price = parseFloat(args[3]);
    const paymentMethod = args[4];
    const paymentDetails = args.slice(5).join(' ');
    if (!SUPPORTED_CURRENCIES.includes(currency)) return ctx.reply(`❌ عملة غير مدعومة\n🌍 العملات المدعومة: ${SUPPORTED_CURRENCIES.slice(0, 20).join(', ')}...`);
    if (isNaN(fiatAmount) || fiatAmount <= 0) return ctx.reply('❌ مبلغ غير صحيح');
    if (isNaN(price) || price <= 0) return ctx.reply('❌ سعر غير صحيح');
    const result = await db.createOffer(ctx.from.id, 'sell', currency, fiatAmount, price, paymentMethod, paymentDetails, '', '', '', 10, fiatAmount);
    await ctx.reply(result.message + `\n💰 *رسوم التداول:* ${PLATFORM_TRADE_FEE} $\n🛒 *العرض يدعم البيع بالتجزئة*`, { parse_mode: 'Markdown' });
});

bot.command('buy', async (ctx) => {
    const user = await db.getUser(ctx.from.id);
    if (!user.isVerified) return ctx.reply('⚠️ يرجى توثيق حسابك');
    const args = ctx.message.text.split(' ');
    if (args.length < 6) return ctx.reply('❌ /buy [العملة] [المبلغ] [السعر] [طريقة] [تفاصيل]\n🌍 العملات المدعومة: ' + SUPPORTED_CURRENCIES.slice(0, 10).join(', '));
    const currency = args[1].toUpperCase();
    const fiatAmount = parseFloat(args[2]);
    const price = parseFloat(args[3]);
    const paymentMethod = args[4];
    const paymentDetails = args.slice(5).join(' ');
    if (!SUPPORTED_CURRENCIES.includes(currency)) return ctx.reply(`❌ عملة غير مدعومة\n🌍 العملات المدعومة: ${SUPPORTED_CURRENCIES.slice(0, 20).join(', ')}...`);
    if (isNaN(fiatAmount) || fiatAmount <= 0) return ctx.reply('❌ مبلغ غير صحيح');
    if (isNaN(price) || price <= 0) return ctx.reply('❌ سعر غير صحيح');
    const result = await db.createOffer(ctx.from.id, 'buy', currency, fiatAmount, price, paymentMethod, paymentDetails, '', '', '', 10, fiatAmount);
    await ctx.reply(result.message + `\n💰 *رسوم التداول:* ${PLATFORM_TRADE_FEE} $`, { parse_mode: 'Markdown' });
});

bot.command('buy_offer', async (ctx) => {
    const user = await db.getUser(ctx.from.id);
    if (!user.isVerified) return ctx.reply('⚠️ يرجى توثيق حسابك');
    const args = ctx.message.text.split(' ');
    const id = args[1];
    const amount = args[2] ? parseFloat(args[2]) : null;
    if (!id) return ctx.reply('❌ /buy_offer [رقم العرض] [المبلغ المطلوب - اختياري للبيع بالتجزئة]');
    const result = await db.startTrade(id, ctx.from.id, amount);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

bot.command('sell_offer', async (ctx) => {
    const user = await db.getUser(ctx.from.id);
    if (!user.isVerified) return ctx.reply('⚠️ يرجى توثيق حسابك');
    const id = ctx.message.text.split(' ')[1];
    if (!id) return ctx.reply('❌ /sell_offer [رقم العرض]');
    const result = await db.startTrade(id, ctx.from.id, null);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

bot.command('send_proof', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length !== 3) return ctx.reply('❌ /send_proof [رقم الصفقة] [رابط]');
    const result = await db.confirmPayment(args[1], ctx.from.id, args[2]);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
    if (result.sellerId) await bot.telegram.sendMessage(result.sellerId, result.message, { parse_mode: 'Markdown' });
});

bot.command('cancel_trade', async (ctx) => {
    const tradeId = ctx.message.text.split(' ')[1];
    if (!tradeId) return ctx.reply('❌ /cancel_trade [رقم الصفقة]');
    const result = await db.cancelPendingTrade(tradeId, ctx.from.id);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

bot.command('remind_seller', async (ctx) => {
    const tradeId = ctx.message.text.split(' ')[1];
    if (!tradeId) return ctx.reply('❌ /remind_seller [رقم الصفقة]');
    const result = await db.remindSeller(tradeId, ctx.from.id);
    if (result.success && result.trade) {
        await bot.telegram.sendMessage(result.trade.sellerId, `🔔 تذكير: الصفقة #${tradeId}\n🔓 /release_crystals ${tradeId}`);
    }
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

bot.command('release_crystals', async (ctx) => {
    const args = ctx.message.text.split(' ');
    const tradeId = args[1];
    const twoFACode = args[2] || null;
    if (!tradeId) return ctx.reply('❌ /release_crystals [رقم الصفقة]');
    const result = await db.releaseCrystals(tradeId, ctx.from.id, twoFACode);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
    if (result.success && result.buyerId) await bot.telegram.sendMessage(result.buyerId, result.message, { parse_mode: 'Markdown' });
});

bot.command('release_2fa', async (ctx) => {
    const args = ctx.message.text.split(' ');
    const tradeId = args[1];
    const twoFACode = args[2];
    if (!tradeId || !twoFACode) return ctx.reply('❌ /release_2fa [رقم الصفقة] [رمز]');
    const result = await db.releaseCrystals(tradeId, ctx.from.id, twoFACode);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
    if (result.success && result.buyerId) await bot.telegram.sendMessage(result.buyerId, result.message, { parse_mode: 'Markdown' });
});

bot.command('dispute', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply('❌ /dispute [رقم الصفقة] [السبب]');
    const result = await db.openDispute(args[1], ctx.from.id, args.slice(2).join(' '));
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
    for (const adminId of ADMIN_IDS) {
        await bot.telegram.sendMessage(adminId, `⚠️ نزاع جديد\n👤 ${ctx.from.first_name}\n📋 ${args[1]}`);
    }
});

bot.command('rate', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply('❌ /rate [رقم الصفقة] [1-5]');
    const rating = parseInt(args[2]);
    if (rating < 1 || rating > 5) return ctx.reply('❌ التقييم 1-5');
    const comment = args.slice(3).join(' ');
    const result = await db.addReview(args[1], ctx.from.id, rating, comment);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

// ========== أزرار التعليمات ==========
bot.action('instructions_menu', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(`📖 *قائمة التعليمات*`, { parse_mode: 'Markdown', ...instructionsKeyboard });
});

bot.action('deposit_instructions', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const wallet = await db.getUserWallet(ctx.from.id);
    await ctx.editMessageText(
        `📥 *الإيداع*\n🟡 BNB: \`${wallet.bnbAddress}\`\n🟣 POLYGON: \`${wallet.polygonAddress}\`\n🟢 SOLANA: \`${wallet.solanaAddress}\`\n🔷 APTOS: \`${wallet.aptosAddress}\`\n\n💰 الحد الأدنى: 1 $`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'instructions_menu')]]) }
    );
});

bot.action('withdraw_instructions', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
        `📤 *السحب*\n1. افتح التطبيق\n2. اذهب إلى محفظتي\n3. أدخل المبلغ والعنوان\n4. اختر الشبكة\n5. أدخل 2FA\n\n💰 الحد الأدنى: 5 $\n🏢 رسوم المنصة: ${PLATFORM_WITHDRAW_FEE} $\n🌐 رسوم الشبكة الحالية:\n• 🟡 BNB: ~${cachedNetworkFees.bnb} $\n• 🟣 POLYGON: ~${cachedNetworkFees.polygon} $\n• 🟢 SOLANA: ~${cachedNetworkFees.solana} $\n• 🔷 APTOS: ~${cachedNetworkFees.aptos} $`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'instructions_menu')]]) }
    );
});

bot.action('convert_usd_instructions', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
        `💵 *تحويل الدولار*\n1. اشتر USDT/BUSD\n2. اختر BEP-20\n3. انسخ عنوانك\n4. أرسل\n\n💰 الحد الأدنى: 1 $`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'instructions_menu')]]) }
    );
});

bot.action('withdraw_to_exchange', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
        `🔄 *السحب لمنصات أخرى*\n1. اسحب لمحفظتك\n2. استخدم نفس الشبكة\n3. أرسل للمنصة الهدف`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'instructions_menu')]]) }
    );
});

bot.action('supported_networks', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
        `🌐 *الشبكات ورسومها الحالية*\n🟡 BNB ~${cachedNetworkFees.bnb} $\n🟣 POLYGON ~${cachedNetworkFees.polygon} $\n🟢 SOLANA ~${cachedNetworkFees.solana} $\n🔷 APTOS ~${cachedNetworkFees.aptos} $\n💠 TRC-20 ~0.80 $\n⬜ ERC-20 ~8.00 $\n\n🏢 رسوم المنصة: ${PLATFORM_WITHDRAW_FEE} $`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'instructions_menu')]]) }
    );
});

bot.action('faq_instructions', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
        `❓ *الأسئلة الشائعة*\n💵 إيداع: مجاني\n💰 سحب: ${PLATFORM_WITHDRAW_FEE}$ + رسوم الشبكة\n📊 تداول: ${PLATFORM_TRADE_FEE}$\n⏱️ وقت: 5-30د\n🔐 2FA: إلزامي فوق 100$\n💰 حد الإيداع: 1$\n💰 حد السحب: 5$\n🛒 بيع بالتجزئة: نعم\n🌍 عملات مدعومة: أكثر من 50 عملة`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'instructions_menu')]]) }
    );
});

// ========== باقي الأزرار ==========
bot.action('my_trades', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const stats = await db.getUserStats(ctx.from.id);
    await ctx.editMessageText(`📋 صفقاتي\n✅ ${stats.completedTrades} مكتملة\n💰 ${stats.totalTraded.toFixed(2)} USD`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('my_history', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const offers = await db.getUserOffersHistory(ctx.from.id, 5);
    let text = '📜 تاريخي\n';
    for (const o of offers) text += `${o.type === 'sell' ? '🟢' : '🔴'} ${o.fiatAmount} ${o.currency}\n`;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('market_stats', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const stats = await db.getMarketStats();
    await ctx.editMessageText(`📊 السوق\n📋 ${stats.totalOffers} عرض\n💰 متوسط ${stats.avgPrice} USD`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔄 تحديث', 'market_stats'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('top_merchants', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const merchants = await db.getTopMerchants(10);
    let text = '👑 كبار المتداولين\n';
    for (let i = 0; i < merchants.slice(0, 5).length; i++) {
        const m = merchants[i];
        text += `${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`} ${m.firstName}\n📊 ${m.completedTrades} صفقة\n`;
    }
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔄 تحديث', 'top_merchants'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('my_wallet', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const w = await db.getUserWallet(ctx.from.id);
    const stats = await db.getUserStats(ctx.from.id);
    await ctx.editMessageText(
        `💼 محفظتي\n💵 ${stats.usdBalance.toFixed(2)} USD\n🎁 إحالات: ${stats.referralEarnings?.toFixed(2) || 0} USD\n🏢 رسوم السحب: ${PLATFORM_WITHDRAW_FEE} $\n🌐 رسوم الشبكة الحالية:\n🟡 BNB: ~${cachedNetworkFees.bnb} $\n🟣 POLYGON: ~${cachedNetworkFees.polygon} $\n🟢 SOLANA: ~${cachedNetworkFees.solana} $\n🔷 APTOS: ~${cachedNetworkFees.aptos} $\n🟡 BNB: \`${w.bnbAddress.slice(0, 10)}...\``,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) }
    );
});

bot.action('bank_details', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const user = await db.getUser(ctx.from.id);
    await ctx.editMessageText(`🏦 بيانات البنك\n🏛️ ${user.bankName || 'غير محدد'}\n🔢 ${user.bankAccountNumber || 'غير محدد'}`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.command('set_bank', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 4) return ctx.reply('❌ /set_bank [البنك] [رقم] [اسم]');
    await db.updateBankDetails(ctx.from.id, args[1], args[2], args.slice(3).join(' '));
    await ctx.reply('✅ تم تحديث بيانات البنك');
});

bot.command('deposit', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 4) return ctx.reply('❌ /deposit [العملة] [المبلغ] [الشبكة]\n💰 الحد الأدنى 1$');
    const amount = parseFloat(args[2]);
    if (isNaN(amount) || amount <= 0) return ctx.reply('❌ مبلغ غير صحيح');
    if (amount < 1) return ctx.reply('⚠️ الحد الأدنى للإيداع هو 1 دولار');
    const result = await db.requestDeposit(ctx.from.id, amount, 'USDT', args[3].toLowerCase());
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

bot.command('withdraw', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 5) return ctx.reply('❌ /withdraw [العملة] [المبلغ] [الشبكة] [العنوان]\n💰 الحد الأدنى 5$');
    const amount = parseFloat(args[2]);
    if (isNaN(amount) || amount <= 0) return ctx.reply('❌ مبلغ غير صحيح');
    if (amount < 5) return ctx.reply('⚠️ الحد الأدنى للسحب هو 5 دولار');
    const result = await db.requestWithdraw(ctx.from.id, amount, 'USDT', args[3].toLowerCase(), args[4], args[5] || null);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

bot.action('leaderboard', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const leaders = await db.getLeaderboard(10);
    let text = '🏆 المتصدرين\n';
    for (let i = 0; i < leaders.length; i++) {
        text += `${i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`} ${leaders[i].firstName}\n💰 ${leaders[i].totalTraded?.toFixed(2) || 0} USD\n`;
    }
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔄 تحديث', 'leaderboard'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
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
    await ctx.editMessageText(`📞 الدعم\n👤 @${ADMIN_USERNAME}\n💰 رسوم السحب: ${PLATFORM_WITHDRAW_FEE}$\n🌐 رسوم الشبكة الحالية:\n🟡 BNB: ~${cachedNetworkFees.bnb}$\n🟣 POLYGON: ~${cachedNetworkFees.polygon}$\n🟢 SOLANA: ~${cachedNetworkFees.solana}$\n🔷 APTOS: ~${cachedNetworkFees.aptos}$`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.url('📨 تواصل', `https://t.me/${ADMIN_USERNAME}`)], [Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('back_to_menu', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const stats = await db.getUserStats(ctx.from.id);
    const text = `✨ القائمة الرئيسية\n👤 ${ctx.from.first_name}\n💵 ${stats.usdBalance.toFixed(2)} USD\n⭐ ${stats.rating.toFixed(1)}/5\n✅ ${stats.completedTrades} صفقة\n💰 رسوم السحب: ${PLATFORM_WITHDRAW_FEE}$\n🛒 بيع بالتجزئة متاح\n💬 دردشة متاحة\n🌍 أكثر من 50 عملة مدعومة`;
    const kb = isAdmin(ctx.from.id) ? adminKeyboard : mainKeyboard;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb });
});

// ========== KYC ==========
bot.action('kyc_menu', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const kycStatus = await db.getKycStatus(ctx.from.id);
    const user = await db.getUser(ctx.from.id);
    let statusText = '', actionButton = [];
    if (user.isVerified) {
        statusText = '✅ حساب موثق';
        actionButton = [[Markup.button.callback('🔙 رجوع', 'back_to_menu')]];
    } else if (kycStatus.status === 'pending') {
        statusText = '⏳ قيد المراجعة';
        actionButton = [[Markup.button.callback('🔙 رجوع', 'back_to_menu')]];
    } else if (kycStatus.status === 'rejected') {
        statusText = `❌ مرفوض\n${kycStatus.rejectionReason || ''}`;
        actionButton = [[Markup.button.callback('📝 تقديم طلب', 'start_kyc'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]];
    } else {
        statusText = '⚠️ حساب غير موثق';
        actionButton = [[Markup.button.callback('📝 تقديم طلب', 'start_kyc'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]];
    }
    await ctx.editMessageText(`🆔 توثيق الهوية\n\n${statusText}`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(actionButton) });
});

bot.action('start_kyc', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('📝 أرسل /kyc [الاسم] [رقم الجواز] [الرقم الوطني] [رقم الهاتف]');
    ctx.session = { state: 'kyc_step1' };
});

bot.command('kyc', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 5) return ctx.reply('❌ /kyc [الاسم] [رقم الجواز] [الرقم الوطني] [رقم الهاتف]');
    ctx.session.kycData = { fullName: args[1], passportNumber: args[2], nationalId: args[3], phoneNumber: args[4], email: args[5] || '' };
    ctx.session.state = 'kyc_step2';
    await ctx.reply('📸 أرسل صورة الجواز');
});

bot.on('photo', messageRateLimitMiddleware, async (ctx) => {
    if (ctx.session?.state === 'kyc_step2') {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        ctx.session.kycData.passportPhotoFileId = photo.file_id;
        ctx.session.state = 'kyc_step3';
        await ctx.reply('📸 أرسل صورتك الشخصية');
    } else if (ctx.session?.state === 'kyc_step3') {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        ctx.session.kycData.personalPhotoFileId = photo.file_id;
        ctx.session.state = 'kyc_step4';
        await ctx.reply('🏦 أرسل /bank [البنك] [رقم الحساب] [اسم الحساب]');
    }
});

bot.on('text', messageRateLimitMiddleware, async (ctx) => {
    if (ctx.session?.state === 'kyc_step4') {
        const parts = ctx.message.text.split(' ');
        if (parts.length < 4) return;
        await ctx.reply('🔄 جاري الإرسال...');
        const formData = new FormData();
        formData.append('user_id', ctx.from.id);
        formData.append('fullName', ctx.session.kycData.fullName);
        formData.append('passportNumber', ctx.session.kycData.passportNumber);
        formData.append('nationalId', ctx.session.kycData.nationalId);
        formData.append('phoneNumber', ctx.session.kycData.phoneNumber);
        formData.append('email', ctx.session.kycData.email);
        formData.append('country', 'SD');
        formData.append('city', '');
        formData.append('bankName', parts[1]);
        formData.append('bankAccountNumber', parts[2]);
        formData.append('bankAccountName', parts.slice(3).join(' '));
        
        const passportFile = await ctx.telegram.getFileLink(ctx.session.kycData.passportPhotoFileId);
        const passportRes = await fetch(passportFile.href);
        formData.append('passportPhoto', await passportRes.buffer(), 'passport.jpg');
        
        const personalFile = await ctx.telegram.getFileLink(ctx.session.kycData.personalPhotoFileId);
        const personalRes = await fetch(personalFile.href);
        formData.append('personalPhoto', await personalRes.buffer(), 'personal.jpg');
        
        const response = await fetch(`${WEBAPP_URL}/api/kyc/submit`, { method: 'POST', body: formData });
        const result = await response.json();
        await ctx.reply(result.message);
        delete ctx.session.state;
        delete ctx.session.kycData;
    }
});

// ========== أزرار الأدمن ==========
bot.action(/approve_kyc_(.+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const requestId = ctx.match[1];
    await ctx.answerCbQuery('✅ جاري...');
    const pendingRequests = await db.getPendingKycRequests();
    const targetRequest = pendingRequests.find(req => req._id.toString().slice(-8) === requestId);
    if (!targetRequest) return ctx.reply('❌ لم يتم العثور');
    const result = await db.approveKyc(targetRequest._id, ctx.from.id);
    await ctx.editMessageText(`✅ تمت الموافقة على الطلب #${requestId}`);
    await ctx.reply(result.message);
    if (result.userId) await bot.telegram.sendMessage(result.userId, result.message);
});

bot.action(/reject_kyc_(.+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const requestId = ctx.match[1];
    await ctx.answerCbQuery('❌ أرسل سبب الرفض');
    await ctx.reply(`📝 سبب رفض الطلب #${requestId}:`);
    ctx.session = { state: 'reject_kyc_reason', requestId };
});

bot.on('text', async (ctx) => {
    if (ctx.session?.state === 'reject_kyc_reason' && isAdmin(ctx.from.id)) {
        const reason = ctx.message.text;
        const requestId = ctx.session.requestId;
        const pendingRequests = await db.getPendingKycRequests();
        const targetRequest = pendingRequests.find(req => req._id.toString().slice(-8) === requestId);
        if (!targetRequest) return ctx.reply('❌ لم يتم العثور');
        const result = await db.rejectKyc(targetRequest._id, ctx.from.id, reason);
        await ctx.reply(`❌ تم رفض الطلب #${requestId}\nالسبب: ${reason}`);
        if (result.userId) await bot.telegram.sendMessage(result.userId, result.message);
        delete ctx.session.state;
    }
});

bot.action('pending_kyc', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const pending = await db.getPendingKycRequests();
    if (!pending.length) return ctx.editMessageText('📭 لا توجد طلبات', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    let text = '🆔 طلبات التوثيق\n\n';
    for (const req of pending) text += `📋 ${req._id.toString().slice(-8)} | 👤 ${req.fullName}\n`;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('pending_withdraws', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const p = await db.getPendingWithdraws();
    if (!p.length) return ctx.editMessageText('📭 لا طلبات سحب', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    let text = '💰 طلبات السحب\n\n';
    p.forEach(r => text += `🆔 ${r._id.toString().slice(-8)} | 👤 ${r.userId} | 💰 ${r.amount}\n`);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.command('confirm_withdraw', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const [_, id, hash] = ctx.message.text.split(' ');
    if (!id || !hash) return ctx.reply('❌ /confirm_withdraw [id] [hash]');
    const r = await db.confirmWithdraw(id, hash, ctx.from.id);
    await ctx.reply(r.message);
});

bot.action('pending_deposits', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const p = await db.getPendingDeposits();
    if (!p.length) return ctx.editMessageText('📭 لا طلبات إيداع', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    let text = '📤 طلبات الإيداع\n\n';
    p.forEach(r => text += `🆔 ${r._id.toString().slice(-8)} | 👤 ${r.userId} | 💰 ${r.amount}\n`);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.command('confirm_deposit', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const [_, id, hash] = ctx.message.text.split(' ');
    if (!id || !hash) return ctx.reply('❌ /confirm_deposit [id] [hash]');
    const r = await db.confirmDeposit(id, hash, ctx.from.id);
    await ctx.reply(r.message);
});

bot.action('pending_disputes', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const p = await db.getDisputedTrades();
    if (!p.length) return ctx.editMessageText('📭 لا نزاعات', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    let text = '⚠️ النزاعات\n\n';
    p.forEach(r => text += `🆔 ${r._id.toString().slice(-8)} | 💰 ${r.amount} ${r.currency}\n📝 ${r.disputeReason}\n`);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('global_stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const s = await db.getGlobalStats();
    await ctx.editMessageText(`📊 إحصائيات\n👥 مستخدمين: ${s.users}\n✅ موثقين: ${s.verifiedUsers}\n💰 تداول: ${s.totalTraded} USD`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('today_stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const s = await db.getTodayStats();
    await ctx.editMessageText(`📅 إحصائيات اليوم\n👥 جدد: ${s?.newUsers || 0}\n📈 صفقات: ${s?.totalTrades || 0}`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('search_user', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ للأدمن فقط');
    await ctx.answerCbQuery();
    await ctx.reply('🔍 أرسل اسم المستخدم أو المعرف:');
    ctx.session = { state: 'search_user' };
});

bot.action('banned_users', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const now = Date.now();
    const bans = [...bannedUsers.entries()].filter(([_, b]) => b.expires > now || b.permanent);
    if (!bans.length) return ctx.editMessageText('✅ لا يوجد محظورين', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    let text = '🚫 المحظورين\n';
    bans.forEach(([id, b]) => text += `🆔 ${id}\n⏰ ${b.permanent ? 'دائم' : Math.ceil((b.expires - now)/60000)+' دقيقة'}\n`);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔓 رفع الكل', 'unban_all'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('unban_all', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ للأدمن فقط');
    bannedUsers.clear(); userWarningCount.clear(); userActionCount.clear();
    await ctx.answerCbQuery('✅ تم رفع الحظر');
    await ctx.editMessageText('✅ تم رفع الحظر', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.on('text', messageRateLimitMiddleware, async (ctx) => {
    if (ctx.session?.state === 'search_user' && isAdmin(ctx.from.id)) {
        const query = ctx.message.text;
        const users = await db.searchUsers(query);
        if (users.length === 0) return ctx.reply('❌ لم يتم العثور');
        let text = '🔍 نتائج البحث\n';
        for (const u of users) text += `👤 ${u.firstName || u.userId}\n🆔 ${u.userId}\n━━━━━━━━━━━━━━━━━━\n`;
        await ctx.reply(text);
        delete ctx.session.state;
    }
});

// تشغيل البوت
bot.launch().then(() => {
    console.log('🚀 P2P Exchange Bot running');
    console.log('👑 Admins:', ADMIN_IDS.join(', '));
    console.log('💰 Platform Fees: Withdraw=' + PLATFORM_WITHDRAW_FEE + '$, Trade=' + PLATFORM_TRADE_FEE + '$');
    console.log('💬 Chat System: Active with 15min reminders');
    console.log('🎁 Referral System: Active with bot @my_edu_199311_bot');
    console.log('🛒 Partial Fill System: Active - Supports buying part of an offer');
    console.log('📖 Instructions System: Active');
    console.log('🌍 Currencies Supported: ' + SUPPORTED_CURRENCIES.length + ' currencies');
    console.log('🌐 Current Network Fees:', cachedNetworkFees);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
