require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const db = require('./database');
const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { KycRequest } = require('./models');

// ========== إعداد خادم الويب ==========
const app = express();
const PORT = process.env.PORT || 10000;

const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { success: false, message: '⚠️ الكثير من الطلبات، يرجى الانتظار قليلاً' },
    skip: (req) => req.body?.user_id === parseInt(process.env.ADMIN_ID)
});


app.use(limiter);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'mining-app')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'mining-app', 'index.html')));
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ========== API Routes ==========
app.get('/api/global_stats', async (req, res) => res.json(await db.getGlobalStats()));
app.get('/api/user/:userId', async (req, res) => {
    const u = await db.getUser(parseInt(req.params.userId));
    res.json(u || { usdBalance: 0, isVerified: false });
});
app.get('/api/user/stats/:userId', async (req, res) => res.json(await db.getUserStats(parseInt(req.params.userId))));
app.get('/api/kyc/status/:userId', async (req, res) => res.json(await db.getKycStatus(parseInt(req.params.userId))));
app.post('/api/kyc/submit', upload.fields([{ name: 'passportPhoto' }, { name: 'personalPhoto' }]), async (req, res) => {
    // سيتم التعامل مع رفع الصور عبر البوت مباشرة
    res.json({ success: false, message: 'الرجاء استخدام البوت لتقديم طلب التوثيق' });
});
app.get('/api/leaderboard', async (req, res) => {
    const l = await db.getLeaderboard(15);
    res.json(l.map(x => ({ name: x.firstName || x.username || `مستخدم ${x.userId}`, trades: x.totalTraded || 0, rating: x.rating || 5, verified: x.isVerified, merchant: x.isMerchant })));
});
app.get('/api/offers', async (req, res) => res.json(await db.getOffers(req.query.type, req.query.currency, req.query.sortBy, req.query.order)));
app.post('/api/offer/create', async (req, res) => res.json(await db.createOffer(parseInt(req.body.user_id), req.body.type, req.body.currency, parseFloat(req.body.fiatAmount), parseFloat(req.body.price), req.body.paymentMethod, req.body.paymentDetails, req.body.bankName, req.body.bankAccountNumber, req.body.bankAccountName, parseFloat(req.body.minAmount), parseFloat(req.body.maxAmount))));
app.post('/api/offer/cancel', async (req, res) => res.json(await db.cancelOffer(req.body.offer_id, parseInt(req.body.user_id))));
app.post('/api/trade/start', async (req, res) => res.json(await db.startTrade(req.body.offer_id, parseInt(req.body.user_id))));
app.post('/api/trade/confirm', async (req, res) => res.json(await db.confirmPayment(req.body.trade_id, parseInt(req.body.user_id), req.body.proof_image)));
app.post('/api/trade/release', async (req, res) => res.json(await db.releaseCrystals(req.body.trade_id, parseInt(req.body.user_id))));
app.post('/api/trade/dispute', async (req, res) => res.json(await db.openDispute(req.body.trade_id, parseInt(req.body.user_id), req.body.reason)));
app.post('/api/trade/rate', async (req, res) => res.json(await db.addReview(req.body.trade_id, parseInt(req.body.user_id), parseInt(req.body.rating), req.body.comment)));
app.post('/api/deposit', async (req, res) => res.json(await db.requestDeposit(parseInt(req.body.user_id), parseFloat(req.body.amount), req.body.currency, req.body.network)));
app.post('/api/withdraw', async (req, res) => res.json(await db.requestWithdraw(parseInt(req.body.user_id), parseFloat(req.body.amount), req.body.currency, req.body.network, req.body.address)));
app.post('/api/register', async (req, res) => {
    await db.registerUser(parseInt(req.body.user_id), req.body.username, req.body.first_name, req.body.last_name, req.body.phone, req.body.email, req.body.country, req.body.city, null, req.body.language || 'ar');
    res.json({ success: true });
});
app.post('/api/update_bank', async (req, res) => res.json(await db.updateBankDetails(parseInt(req.body.user_id), req.body.bankName, req.body.accountNumber, req.body.accountName)));
app.post('/api/set_language', async (req, res) => { await db.setLanguage(parseInt(req.body.user_id), req.body.language); res.json({ success: true }); });
app.get('/api/wallet/:userId', async (req, res) => {
    const w = await db.getUserWallet(parseInt(req.params.userId));
    const u = await db.getUser(parseInt(req.params.userId));
    res.json({ addresses: { bnb: w.bnbAddress, polygon: w.polygonAddress, solana: w.solanaAddress, aptos: w.aptosAddress }, usdBalance: w.usdBalance, bankName: u?.bankName, bankAccountNumber: u?.bankAccountNumber, bankAccountName: u?.bankAccountName, isVerified: u?.isVerified });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Web server on port ${PORT}`));

// ========== إعداد بوت التلجرام ==========
(async () => { try { await db.connect(); console.log('✅ Database connected'); } catch (e) { console.error('❌ DB error:', e); } })();

const bot = new Telegraf(process.env.BOT_TOKEN);

// ========== نظام منع الإغراق ==========
const userLastAction = new Map(), userLastMessage = new Map(), userActionCount = new Map(), userWarningCount = new Map(), bannedUsers = new Map();
const RATE_LIMIT = {
    ACTION_DELAY: 2000, MESSAGE_DELAY: 1500, MAX_ACTIONS_PER_MINUTE: 8, MAX_MESSAGES_PER_MINUTE: 5,
    MAX_WARNINGS: 2, TEMP_BAN_DURATION: 600000, PERMANENT_BAN_THRESHOLD: 3, ADMIN_ID: parseInt(process.env.ADMIN_ID)
};

function isBanned(userId) {
    const ban = bannedUsers.get(userId);
    if (!ban) return false;
    if (ban.expires > Date.now()) return true;
    bannedUsers.delete(userId);
    userWarningCount.delete(userId);
    return false;
}

function trackAction(userId, type = 'action') {
    const now = Date.now();
    const limit = type === 'action' ? RATE_LIMIT.MAX_ACTIONS_PER_MINUTE : RATE_LIMIT.MAX_MESSAGES_PER_MINUTE;
    const actions = (userActionCount.get(userId) || []).filter(t => now - t < 60000);
    actions.push(now);
    userActionCount.set(userId, actions);
    
    if (actions.length > limit) {
        const warnings = (userWarningCount.get(userId) || 0) + 1;
        userWarningCount.set(userId, warnings);
        if (warnings >= RATE_LIMIT.MAX_WARNINGS) {
            const banCount = (bannedUsers.get(userId)?.count || 0) + 1;
            if (banCount >= RATE_LIMIT.PERMANENT_BAN_THRESHOLD) {
                bannedUsers.set(userId, { expires: Infinity, count: banCount, permanent: true });
                return { blocked: true, reason: '⛔ تم حظر حسابك نهائياً' };
            }
            bannedUsers.set(userId, { expires: now + RATE_LIMIT.TEMP_BAN_DURATION, count: banCount });
            return { blocked: true, reason: `⚠️ تم حظرك مؤقتاً 10 دقائق` };
        }
        return { blocked: true, reason: `⚠️ تحذير! ${actions.length}/${limit} إجراء` };
    }
    return { blocked: false };
}

async function rateLimitMiddleware(ctx, next) {
    if (ctx.from.id === RATE_LIMIT.ADMIN_ID) return next();
    if (isBanned(ctx.from.id)) { await ctx.answerCbQuery('⛔ محظور مؤقتاً'); return; }
    const now = Date.now();
    if (now - (userLastAction.get(ctx.from.id) || 0) < RATE_LIMIT.ACTION_DELAY) {
        await ctx.answerCbQuery(`⚠️ انتظر ${Math.ceil((RATE_LIMIT.ACTION_DELAY - (now - (userLastAction.get(ctx.from.id) || 0))) / 1000)} ثانية`);
        return;
    }
    const track = trackAction(ctx.from.id, 'action');
    if (track.blocked) { await ctx.answerCbQuery(track.reason); return; }
    userLastAction.set(ctx.from.id, now);
    await next();
}

async function messageRateLimitMiddleware(ctx, next) {
    if (ctx.from.id === RATE_LIMIT.ADMIN_ID) return next();
    if (isBanned(ctx.from.id)) { await ctx.reply('⛔ محظور مؤقتاً'); return; }
    const now = Date.now();
    if (now - (userLastMessage.get(ctx.from.id) || 0) < RATE_LIMIT.MESSAGE_DELAY) return;
    const track = trackAction(ctx.from.id, 'message');
    if (track.blocked) { await ctx.reply(track.reason); return; }
    userLastMessage.set(ctx.from.id, now);
    await next();
}

// ========== القوائم ==========
const WEBAPP_URL = process.env.WEBAPP_URL || `https://sdm-security-bot.onrender.com`;
const ADMIN_ID = parseInt(process.env.ADMIN_ID) || 6701743450;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'hmood19931130';
const PLATFORM_FEE = parseFloat(process.env.PLATFORM_FEE_PERCENT) || 0.5;

const SUPPORTED_CURRENCIES = process.env.SUPPORTED_CURRENCIES 
    ? process.env.SUPPORTED_CURRENCIES.split(',') 
    : ['USD', 'EUR', 'GBP', 'SAR', 'AED', 'EGP', 'SDG', 'IQD', 'JOD', 'KWD', 'QAR', 'BHD', 'OMR', 'TRY', 'INR', 'PKR'];

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

const startKeyboard = Markup.inlineKeyboard([[Markup.button.webApp('🚀 فتح منصة P2P', WEBAPP_URL)]]);

const mainKeyboard = Markup.inlineKeyboard([
    [Markup.button.webApp('🚀 فتح منصة P2P', WEBAPP_URL)],
    [Markup.button.callback('💰 رصيدي', 'my_balance')],
    [Markup.button.callback('📊 عروض البيع', 'offers_sell')],
    [Markup.button.callback('📊 عروض الشراء', 'offers_buy')],
    [Markup.button.callback('➕ إنشاء عرض', 'create_offer')],
    [Markup.button.callback('📋 صفقاتي', 'my_trades')],
    [Markup.button.callback('💼 محفظتي', 'my_wallet')],
    [Markup.button.callback('🏦 بيانات البنك', 'bank_details')],
    [Markup.button.callback('🆔 توثيق الهوية', 'kyc_menu')],
    [Markup.button.callback('🏆 المتصدرين', 'leaderboard')],
    [Markup.button.callback('🌐 اللغة', 'change_language')],
    [Markup.button.callback('📞 الدعم', 'support')]
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

// ========== أوامر البوت الأساسية ==========
bot.start(async (ctx) => {
    const user = ctx.from;
    const referrer = ctx.startPayload ? parseInt(ctx.startPayload) : null;
    await db.registerUser(user.id, user.username, user.first_name, '', '', '', 'SD', '', referrer, 'ar');
    const stats = await db.getUserStats(user.id);
    const kycStatus = await db.getKycStatus(user.id);
    
    let verifiedMsg = '';
    if (stats.isVerified) {
        verifiedMsg = '✅ *حسابك موثق*';
    } else if (kycStatus.status === 'pending') {
        verifiedMsg = '⏳ *طلب التوثيق قيد المراجعة*';
    } else if (kycStatus.status === 'rejected') {
        verifiedMsg = '❌ *تم رفض طلب التوثيق*';
    } else {
        verifiedMsg = '⚠️ *يرجى توثيق حسابك للمتاجرة*';
    }
    
    await ctx.reply(
        `✨ *مرحباً بك في منصة P2P للتداول بالدولار!* ✨\n\n` +
        `👤 *المستخدم:* ${user.first_name}\n` +
        `💵 *الرصيد:* ${stats.usdBalance.toFixed(2)} USD\n` +
        `📊 *إجمالي التداول:* ${stats.totalTraded.toFixed(2)} USD\n` +
        `⭐ *التقييم:* ${stats.rating.toFixed(1)}/5\n` +
        `✅ *الصفقات المكتملة:* ${stats.completedTrades}\n` +
        `${verifiedMsg}\n\n` +
        `🚀 *اضغط على الزر أدناه لفتح منصة التداول*`,
        { parse_mode: 'Markdown', ...startKeyboard }
    );
});

// ========== أوامر الأدمن ==========
bot.command('my_id', async (ctx) => {
    await ctx.reply(`🆔 *معرفك:* \`${ctx.from.id}\`\n👤 *اسمك:* ${ctx.from.first_name}\n📛 *يوزر:* @${ctx.from.username || 'لا يوجد'}`, { parse_mode: 'Markdown' });
});

bot.command('admin', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply('⛔ هذا الأمر للأدمن فقط!');
    }
    await ctx.reply('👑 *لوحة تحكم الأدمن*', { parse_mode: 'Markdown', ...adminKeyboard });
});

// ========== أوامر تشخيصية ==========
bot.command('check_kyc', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const pending = await db.getPendingKycRequests();
    const all = await db.getAllKycRequests();
    await ctx.reply(`📊 *حالة طلبات التوثيق*\n\n📋 *الطلبات المعلقة:* ${pending.length}\n📋 *إجمالي الطلبات:* ${all.length}`);
});

bot.command('test_kyc', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const { KycRequest } = require('./models');
    try {
        const testRequest = await KycRequest.create({
            userId: ADMIN_ID,
            fullName: "اختبار تجريبي",
            passportNumber: "TEST123",
            nationalId: "1234567890",
            phoneNumber: "0912345678",
            passportPhoto: "test_file_id",
            personalPhoto: "test_file_id",
            bankName: "بنك اختبار",
            bankAccountNumber: "123456",
            bankAccountName: "اختبار",
            status: "pending"
        });
        await ctx.reply(`✅ تم إنشاء طلب تجريبي\n🆔 رقم الطلب: \`${testRequest._id}\``);
    } catch (error) {
        await ctx.reply(`❌ خطأ: ${error.message}`);
    }
});

bot.command('all_kyc', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const all = await db.getAllKycRequests();
    if (!all.length) return ctx.reply('📭 لا توجد أي طلبات توثيق');
    let text = `📋 *جميع طلبات التوثيق:* ${all.length}\n\n`;
    for (const req of all) {
        text += `🆔 ${req._id.toString().slice(-6)} | ${req.fullName} | ${req.status}\n`;
    }
    await ctx.reply(text, { parse_mode: 'Markdown' });
});

// ========== طلبات التوثيق ==========
bot.command('pending_kyc', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    
    const pending = await db.getPendingKycRequests();
    if (!pending.length) {
        await ctx.reply('📭 لا توجد طلبات توثيق معلقة حالياً');
        return;
    }
    
    for (const req of pending) {
        // إرسال صورة الجواز
        if (req.passportPhoto) {
            await bot.telegram.sendPhoto(ctx.chat.id, req.passportPhoto, {
                caption: `🆔 *طلب توثيق #${req._id.toString().slice(-6)}*\n\n` +
                    `👤 *المستخدم:* ${req.fullName}\n` +
                    `🆔 *رقم الجواز:* ${req.passportNumber}\n` +
                    `🔢 *الرقم الوطني:* ${req.nationalId}\n` +
                    `📞 *الهاتف:* ${req.phoneNumber}\n` +
                    `📧 *البريد:* ${req.email || 'لا يوجد'}\n` +
                    `🏦 *البنك:* ${req.bankName}\n` +
                    `📅 *التاريخ:* ${new Date(req.createdAt).toLocaleString()}\n\n` +
                    `✅ /approve_kyc ${req._id}\n` +
                    `❌ /reject_kyc ${req._id} [السبب]`,
                parse_mode: 'Markdown'
            });
        }
        
        // إرسال الصورة الشخصية
        if (req.personalPhoto) {
            await bot.telegram.sendPhoto(ctx.chat.id, req.personalPhoto, {
                caption: `📸 *الصورة الشخصية للطلب #${req._id.toString().slice(-6)}*`
            });
        }
    }
});

// الموافقة على طلب توثيق
bot.command('approve_kyc', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) return ctx.reply('❌ /approve_kyc [رقم الطلب]');
    
    const requestId = args[1];
    const result = await db.approveKyc(requestId, ctx.from.id);
    
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
    
    if (result.userId) {
        await bot.telegram.sendMessage(result.userId, result.message, { parse_mode: 'Markdown' });
    }
});

// رفض طلب توثيق
bot.command('reject_kyc', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply('❌ /reject_kyc [رقم الطلب] [السبب]');
    
    const requestId = args[1];
    const reason = args.slice(2).join(' ');
    const result = await db.rejectKyc(requestId, ctx.from.id, reason);
    
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
    
    if (result.userId) {
        await bot.telegram.sendMessage(result.userId, result.message, { parse_mode: 'Markdown' });
    }
});

// ========== أزرار الأدمن ==========
bot.action('pending_kyc', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ للأدمن فقط');
    
    const pending = await db.getPendingKycRequests();
    if (!pending.length) {
        await ctx.editMessageText('📭 لا توجد طلبات توثيق معلقة', {
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
        });
        return;
    }
    
    let text = '🆔 *طلبات التوثيق المعلقة*\n\n';
    for (const req of pending) {
        text += `🆔 *الطلب:* \`${req._id}\`\n`;
        text += `👤 *المستخدم:* ${req.fullName}\n`;
        text += `📞 *الهاتف:* ${req.phoneNumber}\n`;
        text += `━━━━━━━━━━━━━━━━━━\n`;
    }
    text += `\n📝 *للموافقة:* /approve_kyc [رقم الطلب]\n❌ *للرفض:* /reject_kyc [رقم الطلب] [السبب]`;
    
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

// ========== باقي الأزرار ==========
bot.action('my_balance', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const stats = await db.getUserStats(ctx.from.id);
    await ctx.editMessageText(
        `💰 *رصيدك*\n\n💵 *USD:* ${stats.usdBalance.toFixed(2)}\n📊 *إجمالي التداول:* ${stats.totalTraded.toFixed(2)} USD\n⭐ *التقييم:* ${stats.rating.toFixed(1)}/5\n✅ *الصفقات المكتملة:* ${stats.completedTrades}`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) }
    );
});

bot.action('offers_sell', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const offers = await db.getOffers('sell', null, 'price', 'asc', 20);
    if (!offers.length) {
        await ctx.editMessageText('📭 لا توجد عروض بيع حالياً', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
        return;
    }
    let text = '🟢 *عروض البيع* 🟢\n\n';
    for (const o of offers) {
        text += `👤 ${o.firstName || o.username} | ⭐ ${o.rating.toFixed(1)}\n`;
        text += `💰 ${o.fiatAmount.toFixed(2)} ${o.currency} | 📊 ${o.price.toFixed(2)} ${o.currency}/USD\n`;
        text += `💵 القيمة: ${(o.fiatAmount / o.price).toFixed(2)} USD\n`;
        text += `🏦 ${o.paymentMethod}\n`;
        text += `🆔 \`${o._id}\`\n━━━━━━━━━━━━━━━━━━\n`;
    }
    text += `\n📝 /buy_offer [رقم العرض] - لشراء عرض`;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔄 تحديث', 'offers_sell'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('offers_buy', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const offers = await db.getOffers('buy', null, 'price', 'desc', 20);
    if (!offers.length) {
        await ctx.editMessageText('📭 لا توجد عروض شراء حالياً', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
        return;
    }
    let text = '🔴 *عروض الشراء* 🔴\n\n';
    for (const o of offers) {
        text += `👤 ${o.firstName || o.username} | ⭐ ${o.rating.toFixed(1)}\n`;
        text += `💰 ${o.fiatAmount.toFixed(2)} ${o.currency} | 📊 ${o.price.toFixed(2)} ${o.currency}/USD\n`;
        text += `💵 القيمة: ${(o.fiatAmount / o.price).toFixed(2)} USD\n`;
        text += `🏦 ${o.paymentMethod}\n`;
        text += `🆔 \`${o._id}\`\n━━━━━━━━━━━━━━━━━━\n`;
    }
    text += `\n📝 /sell_offer [رقم العرض] - لبيع عرض`;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔄 تحديث', 'offers_buy'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('create_offer', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const user = await db.getUser(ctx.from.id);
    if (!user.isVerified) {
        await ctx.editMessageText(
            `⚠️ *عذراً، حسابك غير موثق!*\n\n📝 *للمتاجرة، يرجى توثيق حسابك أولاً.*`,
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🆔 توثيق الهوية', 'kyc_menu'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) }
        );
        return;
    }
    
    const currencyList = SUPPORTED_CURRENCIES.map(c => `• ${c}`).join('\n');
    const paymentList = PAYMENT_METHODS.map(p => `• ${p}`).join('\n');
    await ctx.editMessageText(
        `➕ *إنشاء عرض جديد*\n\n📝 *الأوامر:*\n\n*لإنشاء عرض بيع:*\n/sell [العملة] [المبلغ] [السعر] [طريقة الدفع] [تفاصيل الدفع]\n\n*لإنشاء عرض شراء:*\n/buy [العملة] [المبلغ] [السعر] [طريقة الدفع] [تفاصيل الدفع]\n\n📊 *مثال:*\n/sell SDG 100000 560 بنكي "بنك الخرطوم - 123456 - أحمد"\n\n🌍 *العملات المدعومة:*\n${currencyList}\n\n🏦 *طرق الدفع:*\n${paymentList}`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) }
    );
});

// ========== أوامر إنشاء العروض ==========
bot.command('sell', async (ctx) => {
    const user = await db.getUser(ctx.from.id);
    if (!user.isVerified) {
        return ctx.reply('⚠️ *عذراً، حسابك غير موثق!*\n\n📝 *للمتاجرة، يرجى توثيق حسابك أولاً.*', { parse_mode: 'Markdown' });
    }
    const args = ctx.message.text.split(' ');
    if (args.length < 6) return ctx.reply('❌ /sell [العملة] [المبلغ] [السعر] [طريقة الدفع] [تفاصيل الدفع]');
    const currency = args[1].toUpperCase();
    const fiatAmount = parseFloat(args[2]);
    const price = parseFloat(args[3]);
    const paymentMethod = args[4];
    const paymentDetails = args.slice(5).join(' ');
    if (!SUPPORTED_CURRENCIES.includes(currency)) return ctx.reply(`❌ عملة غير مدعومة`);
    if (isNaN(fiatAmount) || fiatAmount <= 0) return ctx.reply('❌ المبلغ غير صحيح');
    if (isNaN(price) || price <= 0) return ctx.reply('❌ السعر غير صحيح');
    const result = await db.createOffer(ctx.from.id, 'sell', currency, fiatAmount, price, paymentMethod, paymentDetails, '', '', '', 10, 100000);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

bot.command('buy', async (ctx) => {
    const user = await db.getUser(ctx.from.id);
    if (!user.isVerified) {
        return ctx.reply('⚠️ *عذراً، حسابك غير موثق!*\n\n📝 *للمتاجرة، يرجى توثيق حسابك أولاً.*', { parse_mode: 'Markdown' });
    }
    const args = ctx.message.text.split(' ');
    if (args.length < 6) return ctx.reply('❌ /buy [العملة] [المبلغ] [السعر] [طريقة الدفع] [تفاصيل الدفع]');
    const currency = args[1].toUpperCase();
    const fiatAmount = parseFloat(args[2]);
    const price = parseFloat(args[3]);
    const paymentMethod = args[4];
    const paymentDetails = args.slice(5).join(' ');
    if (!SUPPORTED_CURRENCIES.includes(currency)) return ctx.reply(`❌ عملة غير مدعومة`);
    if (isNaN(fiatAmount) || fiatAmount <= 0) return ctx.reply('❌ المبلغ غير صحيح');
    if (isNaN(price) || price <= 0) return ctx.reply('❌ السعر غير صحيح');
    const result = await db.createOffer(ctx.from.id, 'buy', currency, fiatAmount, price, paymentMethod, paymentDetails, '', '', '', 10, 100000);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

// ========== شراء/بيع عرض ==========
bot.command('buy_offer', async (ctx) => {
    const user = await db.getUser(ctx.from.id);
    if (!user.isVerified) {
        return ctx.reply('⚠️ *عذراً، حسابك غير موثق!*', { parse_mode: 'Markdown' });
    }
    const id = ctx.message.text.split(' ')[1];
    if (!id) return ctx.reply('❌ /buy_offer [رقم العرض]');
    const result = await db.startTrade(id, ctx.from.id);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

bot.command('sell_offer', async (ctx) => {
    const user = await db.getUser(ctx.from.id);
    if (!user.isVerified) {
        return ctx.reply('⚠️ *عذراً، حسابك غير موثق!*', { parse_mode: 'Markdown' });
    }
    const id = ctx.message.text.split(' ')[1];
    if (!id) return ctx.reply('❌ /sell_offer [رقم العرض]');
    const result = await db.startTrade(id, ctx.from.id);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

// ========== تأكيد الدفع ==========
bot.command('send_proof', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length !== 3) return ctx.reply('❌ /send_proof [رقم الصفقة] [رابط الصورة]');
    const result = await db.confirmPayment(args[1], ctx.from.id, args[2]);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
    if (result.sellerId) {
        await bot.telegram.sendMessage(result.sellerId, result.message, { parse_mode: 'Markdown' });
    }
});

// ========== تحرير العملة ==========
bot.command('release_crystals', async (ctx) => {
    const id = ctx.message.text.split(' ')[1];
    if (!id) return ctx.reply('❌ /release_crystals [رقم الصفقة]');
    const result = await db.releaseCrystals(id, ctx.from.id);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
    if (result.buyerId) {
        await bot.telegram.sendMessage(result.buyerId, result.message, { parse_mode: 'Markdown' });
    }
});

// ========== نزاع ==========
bot.command('dispute', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply('❌ /dispute [رقم الصفقة] [السبب]');
    const result = await db.openDispute(args[1], ctx.from.id, args.slice(2).join(' '));
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
    await bot.telegram.sendMessage(ADMIN_ID, `⚠️ *نزاع جديد*\n👤 المستخدم: ${ctx.from.first_name}\n📋 الصفقة: ${args[1]}\n📝 السبب: ${args.slice(2).join(' ')}`);
});

// ========== تقييم ==========
bot.command('rate', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply('❌ /rate [رقم الصفقة] [التقييم 1-5] [تعليق اختياري]');
    const rating = parseInt(args[2]);
    if (rating < 1 || rating > 5) return ctx.reply('❌ التقييم من 1 إلى 5');
    const comment = args.slice(3).join(' ');
    const result = await db.addReview(args[1], ctx.from.id, rating, comment);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

// ========== محفظتي ==========
bot.action('my_wallet', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const w = await db.getUserWallet(ctx.from.id);
    const stats = await db.getUserStats(ctx.from.id);
    await ctx.editMessageText(
        `💼 *محفظتي*\n\n💵 *USD:* ${stats.usdBalance.toFixed(2)}\n🔑 *بصمة المحفظة:* \`${w.walletSignature ? w.walletSignature.slice(0, 16) : 'جاري الإنشاء'}...\`\n\n📤 *عناوين استقبال العملات:*\n\n🟡 *BNB:*\n\`${w.bnbAddress}\`\n\n🟣 *POLYGON:*\n\`${w.polygonAddress}\`\n\n🟢 *SOLANA:*\n\`${w.solanaAddress}\`\n\n🔷 *APTOS:*\n\`${w.aptosAddress}\``,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('📋 نسخ العناوين', 'copy_addresses'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) }
    );
});

bot.action('copy_addresses', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const w = await db.getUserWallet(ctx.from.id);
    await ctx.editMessageText(
        `📋 *عناوين محفظتك*\n\n🟡 BNB:\n\`${w.bnbAddress}\`\n\n🟣 POLYGON:\n\`${w.polygonAddress}\`\n\n🟢 SOLANA:\n\`${w.solanaAddress}\`\n\n🔷 APTOS:\n\`${w.aptosAddress}\``,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'my_wallet')]]) }
    );
});

// ========== بيانات البنك ==========
bot.action('bank_details', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const user = await db.getUser(ctx.from.id);
    await ctx.editMessageText(
        `🏦 *بيانات البنك*\n\n🏛️ *البنك:* ${user.bankName || 'غير محدد'}\n🔢 *رقم الحساب:* ${user.bankAccountNumber || 'غير محدد'}\n👤 *اسم الحساب:* ${user.bankAccountName || 'غير محدد'}\n\n📝 /set_bank [البنك] [رقم الحساب] [اسم الحساب]`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) }
    );
});

bot.command('set_bank', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 4) return ctx.reply('❌ /set_bank [البنك] [رقم الحساب] [اسم الحساب]');
    const bankName = args[1];
    const accountNumber = args[2];
    const accountName = args.slice(3).join(' ');
    await db.updateBankDetails(ctx.from.id, bankName, accountNumber, accountName);
    await ctx.reply(`✅ *تم تحديث بيانات البنك*\n\n🏛️ *البنك:* ${bankName}\n🔢 *رقم الحساب:* ${accountNumber}\n👤 *اسم الحساب:* ${accountName}`, { parse_mode: 'Markdown' });
});

// ========== إيداع وسحب ==========
bot.command('deposit', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 4) return ctx.reply('❌ /deposit [العملة] [المبلغ] [الشبكة]');
    const amount = parseFloat(args[2]);
    const network = args[3].toLowerCase();
    if (isNaN(amount) || amount <= 0) return ctx.reply('❌ المبلغ غير صحيح');
    const result = await db.requestDeposit(ctx.from.id, amount, 'USDT', network);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

bot.command('withdraw', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 5) return ctx.reply('❌ /withdraw [العملة] [المبلغ] [الشبكة] [العنوان]');
    const amount = parseFloat(args[2]);
    const network = args[3].toLowerCase();
    const address = args[4];
    if (isNaN(amount) || amount <= 0) return ctx.reply('❌ المبلغ غير صحيح');
    const result = await db.requestWithdraw(ctx.from.id, amount, 'USDT', network, address);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

// ========== المتصدرين ==========
bot.action('leaderboard', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const leaders = await db.getLeaderboard(15);
    if (!leaders.length) return ctx.editMessageText('🏆 لا يوجد متصدرين', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    let text = `🏆 *قائمة المتصدرين* 🏆\n\n`;
    for (let i = 0; i < leaders.length; i++) {
        const l = leaders[i];
        const name = l.firstName || l.username || `مستخدم ${l.userId}`;
        const medal = i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
        text += `${medal} *${name}*\n   💰 ${l.totalTraded.toFixed(2)} USD\n   ⭐ ${l.rating.toFixed(1)}/5\n━━━━━━━━━━━━━━━━━━\n`;
    }
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔄 تحديث', 'leaderboard'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

// ========== اللغة ==========
bot.action('change_language', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText('🌐 *اختر اللغة*', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([
        [Markup.button.callback('🇸🇦 العربية', 'lang_ar'), Markup.button.callback('🇬🇧 English', 'lang_en')],
        [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
    ]) });
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

// ========== الدعم ==========
bot.action('support', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
        `📞 *الدعم الفني*\n\n👤 *الأدمن:* @${ADMIN_USERNAME}\n🆔 *المعرف:* ${ADMIN_ID}`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.url('📨 تواصل', `https://t.me/${ADMIN_USERNAME}`)], [Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) }
    );
});

// ========== العودة للقائمة ==========
bot.action('back_to_menu', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const stats = await db.getUserStats(ctx.from.id);
    const text = `✨ *القائمة الرئيسية*\n👤 ${ctx.from.first_name}\n💵 ${stats.usdBalance.toFixed(2)} USD\n⭐ ${stats.rating.toFixed(1)}/5\n✅ ${stats.completedTrades} صفقة\n${stats.isVerified ? '✅ موثق' : '⚠️ غير موثق'}`;
    const kb = ctx.from.id === ADMIN_ID ? adminKeyboard : mainKeyboard;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb });
});

// ========== نظام التوثيق (KYC) ==========

// قائمة التوثيق
bot.action('kyc_menu', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const kycStatus = await db.getKycStatus(ctx.from.id);
    const user = await db.getUser(ctx.from.id);
    
    let statusText = '';
    let actionButton = [];
    
    if (user.isVerified) {
        statusText = '✅ *حسابك موثق* - يمكنك التداول بحرية';
        actionButton = [[Markup.button.callback('🔙 رجوع', 'back_to_menu')]];
    } else if (kycStatus.status === 'pending') {
        statusText = '⏳ *طلب التوثيق قيد المراجعة* - سيتم إعلامك عند اكتماله';
        actionButton = [[Markup.button.callback('🔙 رجوع', 'back_to_menu')]];
    } else if (kycStatus.status === 'rejected') {
        statusText = `❌ *تم رفض طلب التوثيق*\n📝 السبب: ${kycStatus.rejectionReason}`;
        actionButton = [[Markup.button.callback('🔄 إعادة المحاولة', 'retry_kyc'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]];
    } else {
        statusText = '⚠️ *حسابك غير موثق* - يرجى إكمال التوثيق للمتاجرة';
        actionButton = [[Markup.button.callback('📝 تقديم طلب توثيق', 'start_kyc'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]];
    }
    
    const text = `🆔 *توثيق الهوية (KYC)*\n\n${statusText}\n\n` +
        `📋 *المستندات المطلوبة:*\n` +
        `• صورة واضحة للجواز الساري\n` +
        `• صورة شخصية واضحة\n` +
        `• الرقم الوطني\n` +
        `• رقم الهاتف\n` +
        `• البيانات البنكية\n\n` +
        `👨‍⚖️ *يتم مراجعة الطلبات يدوياً من قبل الإدارة*\n\n` +
        `📝 *لبدء عملية التوثيق، اضغط على زر "تقديم طلب توثيق"*`;
    
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(actionButton) });
});

// بدء عملية التوثيق
bot.action('start_kyc', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('📝 *الرجاء إدخال بياناتك بالصيغة التالية:*\n\n' +
        `/kyc [الاسم الكامل] [رقم الجواز] [الرقم الوطني] [رقم الهاتف]\n\n` +
        `📎 *مثال:*\n` +
        `/kyc "محمد أحمد" A12345678 1234567890 0912345678\n\n` +
        `📧 *يمكنك إضافة البريد الإلكتروني اختيارياً:*\n` +
        `/kyc "محمد أحمد" A12345678 1234567890 0912345678 example@email.com`);
    ctx.session = { state: 'kyc_step1' };
});

// إعادة محاولة التوثيق
bot.action('retry_kyc', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const result = await db.retryKycVerification(ctx.from.id);
    await ctx.editMessageText(result.message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('📝 تقديم طلب جديد', 'start_kyc'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

// أمر التوثيق المباشر
bot.command('kyc', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 5) {
        return ctx.reply('❌ الصيغة: /kyc [الاسم الكامل] [رقم الجواز] [الرقم الوطني] [رقم الهاتف]');
    }
    
    const fullName = args[1];
    const passportNumber = args[2];
    const nationalId = args[3];
    const phoneNumber = args[4];
    const email = args[5] || '';
    
    ctx.session.kycData = { fullName, passportNumber, nationalId, phoneNumber, email };
    ctx.session.state = 'kyc_step2';
    
    await ctx.reply('📸 *الرجاء إرسال صورة واضحة للجواز الساري*');
});

// معالجة الصور (حفظ file_id فقط)
bot.on('photo', messageRateLimitMiddleware, async (ctx) => {
    if (ctx.session?.state === 'kyc_step2') {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        ctx.session.kycData.passportFileId = photo.file_id;
        ctx.session.state = 'kyc_step3';
        await ctx.reply('📸 *تم استلام صورة الجواز!*\n\n📸 *الرجاء إرسال الصورة الشخصية الآن*');
    } else if (ctx.session?.state === 'kyc_step3') {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        ctx.session.kycData.personalFileId = photo.file_id;
        ctx.session.state = 'kyc_step4';
        await ctx.reply('🏦 *تم استلام الصورة الشخصية!*\n\n📝 *الرجاء إدخال بياناتك البنكية:*\n\n' +
            `/bank [اسم البنك] [رقم الحساب] [اسم صاحب الحساب]\n\n📎 *مثال:*\n/bank "بنك الخرطوم" 1234567890 "محمد أحمد"`);
    }
});

// معالجة البيانات البنكية وإرسال الطلب
bot.on('text', messageRateLimitMiddleware, async (ctx) => {
    if (ctx.session?.state === 'kyc_step4') {
        const parts = ctx.message.text.split(' ');
        if (parts.length < 4) {
            await ctx.reply('❌ الصيغة: /bank [اسم البنك] [رقم الحساب] [اسم صاحب الحساب]');
            return;
        }
        
        const bankName = parts[1];
        const bankAccountNumber = parts[2];
        const bankAccountName = parts.slice(3).join(' ');
        
        await ctx.reply('🔄 *جاري إرسال طلب التوثيق...*');
        
        const result = await db.createKycRequest(
            ctx.from.id,
            ctx.session.kycData.fullName,
            ctx.session.kycData.passportNumber,
            ctx.session.kycData.nationalId,
            ctx.session.kycData.phoneNumber,
            ctx.session.kycData.email || '',
            'SD',
            '',
            ctx.session.kycData.passportFileId,
            ctx.session.kycData.personalFileId,
            bankName,
            bankAccountNumber,
            bankAccountName
        );
        
        await ctx.reply(result.message, { parse_mode: 'Markdown' });
        
        // إشعار الأدمن
        if (result.success) {
            await bot.telegram.sendMessage(ADMIN_ID, 
                `🆔 *طلب توثيق جديد!*\n\n` +
                `👤 المستخدم: ${ctx.from.first_name} (@${ctx.from.username || 'لا يوجد'})\n` +
                `🆔 المعرف: ${ctx.from.id}\n` +
                `📋 رقم الطلب: \`${result.requestId}\`\n\n` +
                `📝 *البيانات:*\n` +
                `• الاسم: ${ctx.session.kycData.fullName}\n` +
                `• الجواز: ${ctx.session.kycData.passportNumber}\n` +
                `• الرقم الوطني: ${ctx.session.kycData.nationalId}\n` +
                `• الهاتف: ${ctx.session.kycData.phoneNumber}\n\n` +
                `✅ /approve_kyc ${result.requestId}\n` +
                `❌ /reject_kyc ${result.requestId} [السبب]`,
                { parse_mode: 'Markdown' }
            );
            
            // إرسال الصور للأدمن
            await bot.telegram.sendPhoto(ADMIN_ID, ctx.session.kycData.passportFileId);
            await bot.telegram.sendPhoto(ADMIN_ID, ctx.session.kycData.personalFileId);
        }
        
        delete ctx.session.state;
        delete ctx.session.kycData;
    }
});

// ========== أوامر الأدمن الأخرى ==========
bot.action('pending_withdraws', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const p = await db.getPendingWithdraws();
    if (!p.length) return ctx.editMessageText('📭 لا طلبات سحب', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    let text = '💰 *طلبات السحب*\n\n';
    p.forEach(r => { text += `🆔 \`${r._id}\` | 👤 ${r.userId}\n💰 ${r.amount} ${r.currency}\n🌐 ${r.network}\n📤 ${r.address}\n━━━━━━━━━━━━━━━━━━\n`; });
    text += `\n📝 /confirm_withdraw [الرقم] [رابط]`;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.command('confirm_withdraw', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const [_, id, hash] = ctx.message.text.split(' ');
    if (!id || !hash) return ctx.reply('❌ /confirm_withdraw [id] [hash]');
    const r = await db.confirmWithdraw(id, hash, ctx.from.id);
    await ctx.reply(r.message);
});

bot.action('pending_deposits', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const p = await db.getPendingDeposits();
    if (!p.length) return ctx.editMessageText('📭 لا طلبات إيداع', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    let text = '📤 *طلبات الإيداع*\n\n';
    p.forEach(r => { text += `🆔 \`${r._id}\` | 👤 ${r.userId}\n💰 ${r.amount} ${r.currency}\n🌐 ${r.network}\n📤 ${r.address}\n━━━━━━━━━━━━━━━━━━\n`; });
    text += `\n📝 /confirm_deposit [الرقم] [رابط]`;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.command('confirm_deposit', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const [_, id, hash] = ctx.message.text.split(' ');
    if (!id || !hash) return ctx.reply('❌ /confirm_deposit [id] [hash]');
    const r = await db.confirmDeposit(id, hash, ctx.from.id);
    await ctx.reply(r.message);
});

bot.action('pending_disputes', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const p = await db.getDisputedTrades();
    if (!p.length) return ctx.editMessageText('📭 لا نزاعات', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    let text = '⚠️ *النزاعات*\n\n';
    p.forEach(r => { text += `🆔 \`${r._id}\`\n👤 المشتري: ${r.buyerId}\n👤 البائع: ${r.sellerId}\n💰 ${r.amount} ${r.currency}\n📝 السبب: ${r.disputeReason}\n━━━━━━━━━━━━━━━━━━\n`; });
    text += `\n📝 /resolve_dispute [الرقم] [buyer/seller]`;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('global_stats', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const s = await db.getGlobalStats();
    await ctx.editMessageText(
        `📊 *إحصائيات عامة*\n\n👥 *المستخدمين:* ${s.users}\n✅ *الموثقين:* ${s.verifiedUsers}\n💰 *إجمالي التداول:* ${s.totalTraded} USD\n⭐ *متوسط التقييم:* ${s.avgRating}/5\n📊 *العروض النشطة:* ${s.activeOffers}\n🆔 *طلبات توثيق:* ${s.pendingKyc || 0}`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) }
    );
});

bot.action('today_stats', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const s = await db.getTodayStats();
    await ctx.editMessageText(
        `📅 *إحصائيات اليوم*\n${new Date().toLocaleDateString('ar')}\n\n👥 *مستخدمين جدد:* ${s?.newUsers || 0}\n📈 *الصفقات:* ${s?.totalTrades || 0}\n💰 *حجم التداول:* ${s?.totalVolume?.toFixed(2) || 0} USD\n💸 *العمولات:* ${s?.totalCommission?.toFixed(2) || 0} USD\n🆔 *طلبات توثيق:* ${s?.pendingKyc || 0}`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) }
    );
});

bot.action('search_user', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ للأدمن فقط');
    await ctx.answerCbQuery();
    await ctx.reply('🔍 الرجاء إرسال اسم المستخدم أو المعرف للبحث:');
    ctx.session = { state: 'search_user' };
});

bot.action('banned_users', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const now = Date.now();
    const bans = [...bannedUsers.entries()].filter(([_, b]) => b.expires > now || b.permanent);
    if (!bans.length) return ctx.editMessageText('✅ لا يوجد محظورين', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    let text = '🚫 *المحظورين*\n\n';
    bans.forEach(([id, b]) => { text += `🆔 \`${id}\`\n⏰ ${b.permanent ? 'دائم' : Math.ceil((b.expires - now)/60000)+' دقيقة'}\n━━━━━━━━━━━━━━━━━━\n`; });
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔓 رفع الكل', 'unban_all'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

bot.action('unban_all', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ للأدمن فقط');
    bannedUsers.clear(); userWarningCount.clear(); userActionCount.clear();
    await ctx.answerCbQuery('✅ تم رفع الحظر');
    await ctx.editMessageText('✅ تم رفع الحظر', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

// ========== معالجة البحث ==========
bot.on('text', messageRateLimitMiddleware, async (ctx) => {
    if (ctx.session?.state === 'search_user' && ctx.from.id === ADMIN_ID) {
        const query = ctx.message.text;
        const users = await db.searchUsers(query);
        if (users.length === 0) return ctx.reply('❌ لم يتم العثور على مستخدمين');
        let text = '🔍 *نتائج البحث:*\n\n';
        for (const u of users) {
            text += `👤 ${u.firstName || u.username || u.userId}\n🆔 \`${u.userId}\`\n⭐ ${u.rating.toFixed(1)}/5\n✅ ${u.isVerified ? 'موثق ✅' : 'غير موثق ❌'}\n━━━━━━━━━━━━━━━━━━\n`;
        }
        await ctx.reply(text, { parse_mode: 'Markdown' });
        delete ctx.session.state;
    }
});

// تشغيل البوت
bot.launch().then(() => {
    console.log('🚀 P2P Exchange Bot running');
    console.log('👑 Admin:', ADMIN_ID);
    console.log('💵 Platform Fee:', PLATFORM_FEE, '%');
    console.log('🆔 Manual KYC System: Enabled');
    console.log('📸 Photos stored on Telegram servers');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
