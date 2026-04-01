require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const db = require('./database');
const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');

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
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'mining-app')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'mining-app', 'index.html')));
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ========== المتغيرات البيئية مع قيم افتراضية ==========
const WEBAPP_URL = process.env.WEBAPP_URL || `https://sdm-security-bot.onrender.com`;
const ADMIN_ID = parseInt(process.env.ADMIN_ID) || 6701743450;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'hmood19931130';
const PLATFORM_FEE = parseFloat(process.env.PLATFORM_FEE_PERCENT) || 0.5;

// العملات المدعومة (قيم افتراضية)
const SUPPORTED_CURRENCIES = process.env.SUPPORTED_CURRENCIES 
    ? process.env.SUPPORTED_CURRENCIES.split(',') 
    : ['USD', 'EUR', 'GBP', 'SAR', 'AED', 'EGP', 'SDG', 'IQD', 'JOD', 'KWD', 'QAR', 'BHD', 'OMR', 'TRY', 'INR', 'PKR'];

// طرق الدفع المدعومة
const PAYMENT_METHODS = process.env.PAYMENT_METHODS 
    ? process.env.PAYMENT_METHODS.split(',') 
    : ['bank_transfer', 'paypal', 'visa', 'mastercard', 'fawry', 'instapay', 'vodafone_cash', 'orange_cash'];

// البنوك السودانية
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

// ========== API Routes ==========
app.get('/api/global_stats', async (req, res) => res.json(await db.getGlobalStats()));
app.get('/api/user/:userId', async (req, res) => {
    const u = await db.getUser(parseInt(req.params.userId));
    res.json(u || { usdBalance: 0 });
});
app.get('/api/user/stats/:userId', async (req, res) => res.json(await db.getUserStats(parseInt(req.params.userId))));
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
    res.json({ addresses: { bnb: w.bnbAddress, polygon: w.polygonAddress, solana: w.solanaAddress, aptos: w.aptosAddress }, usdBalance: w.usdBalance, bankName: u?.bankName, bankAccountNumber: u?.bankAccountNumber, bankAccountName: u?.bankAccountName });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Web server on port ${PORT}`));

// ========== إعداد بوت التلجرام ==========
(async () => { try { await db.connect(); console.log('✅ Database connected'); } catch (e) { console.error('❌ DB error:', e); } })();

const bot = new Telegraf(process.env.BOT_TOKEN);

// ========== نظام منع الإغراق ==========
const userLastAction = new Map(), userLastMessage = new Map(), userActionCount = new Map(), userWarningCount = new Map(), bannedUsers = new Map();
const RATE_LIMIT = {
    ACTION_DELAY: 2000, MESSAGE_DELAY: 1500, MAX_ACTIONS_PER_MINUTE: 8, MAX_MESSAGES_PER_MINUTE: 5,
    MAX_WARNINGS: 2, TEMP_BAN_DURATION: 600000, PERMANENT_BAN_THRESHOLD: 3, ADMIN_ID: ADMIN_ID
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
    if (ctx.from.id === ADMIN_ID) return next();
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
    if (ctx.from.id === ADMIN_ID) return next();
    if (isBanned(ctx.from.id)) { await ctx.reply('⛔ محظور مؤقتاً'); return; }
    const now = Date.now();
    if (now - (userLastMessage.get(ctx.from.id) || 0) < RATE_LIMIT.MESSAGE_DELAY) return;
    const track = trackAction(ctx.from.id, 'message');
    if (track.blocked) { await ctx.reply(track.reason); return; }
    userLastMessage.set(ctx.from.id, now);
    await next();
}

// ========== القوائم ==========
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
    [Markup.button.callback('🏆 المتصدرين', 'leaderboard')],
    [Markup.button.callback('🌐 اللغة', 'change_language')],
    [Markup.button.callback('📞 الدعم', 'support')]
]);

const adminKeyboard = Markup.inlineKeyboard([
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

// ========== أوامر البوت ==========
bot.start(async (ctx) => {
    const user = ctx.from;
    const referrer = ctx.startPayload ? parseInt(ctx.startPayload) : null;
    await db.registerUser(user.id, user.username, user.first_name, '', '', '', 'SD', '', referrer, 'ar');
    const stats = await db.getUserStats(user.id);
    await ctx.reply(
        `✨ *مرحباً بك في منصة P2P للتداول بالدولار!* ✨\n\n` +
        `👤 *المستخدم:* ${user.first_name}\n` +
        `💵 *الرصيد:* ${stats.usdBalance.toFixed(2)} USD\n` +
        `📊 *إجمالي التداول:* ${stats.totalTraded.toFixed(2)} USD\n` +
        `⭐ *التقييم:* ${stats.rating.toFixed(1)}/5\n` +
        `✅ *الصفقات المكتملة:* ${stats.completedTrades}\n\n` +
        `🚀 *اضغط على الزر أدناه لفتح منصة التداول*`,
        { parse_mode: 'Markdown', ...startKeyboard }
    );
});

// ========== أمر عرض لوحة الأدمن ==========
bot.command('admin', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply('⛔ هذا الأمر للأدمن فقط!');
    }
    
    await ctx.reply('👑 *لوحة تحكم الأدمن*', { parse_mode: 'Markdown', ...adminKeyboard });
});

// ========== أمر عرض المعرف ==========
bot.command('my_id', async (ctx) => {
    await ctx.reply(`🆔 *معرفك:* \`${ctx.from.id}\`\n👤 *اسمك:* ${ctx.from.first_name}\n📛 *يوزر:* @${ctx.from.username || 'لا يوجد'}`, { parse_mode: 'Markdown' });
});

// ========== الرصيد ==========
bot.action('my_balance', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const stats = await db.getUserStats(ctx.from.id);
    await ctx.editMessageText(
        `💰 *رصيدك*\n\n` +
        `💵 *USD:* ${stats.usdBalance.toFixed(2)}\n` +
        `📊 *إجمالي التداول:* ${stats.totalTraded.toFixed(2)} USD\n` +
        `⭐ *التقييم:* ${stats.rating.toFixed(1)}/5\n` +
        `✅ *الصفقات المكتملة:* ${stats.completedTrades}\n` +
        `📋 *العروض النشطة:* ${stats.activeOffers}\n` +
        `⏳ *صفقات معلقة:* ${stats.pendingTrades}`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) }
    );
});

// ========== عروض البيع ==========
bot.action('offers_sell', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const offers = await db.getOffers('sell', null, 'price', 'asc', 20);
    if (!offers.length) {
        await ctx.editMessageText('📭 لا توجد عروض بيع حالياً', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
        return;
    }
    let text = '🟢 *عروض البيع* 🟢\n\n';
    for (const o of offers) {
        const verifiedIcon = o.isVerified ? '✅' : '❌';
        const merchantIcon = o.isMerchant ? '👑' : '';
        text += `👤 ${o.firstName || o.username} ${verifiedIcon}${merchantIcon} | ⭐ ${o.rating.toFixed(1)}\n`;
        text += `💰 ${o.fiatAmount.toFixed(2)} ${o.currency} | 📊 ${o.price.toFixed(2)} ${o.currency}/USD\n`;
        text += `💵 القيمة: ${(o.fiatAmount / o.price).toFixed(2)} USD\n`;
        text += `🏦 ${o.paymentMethod}\n`;
        text += `🆔 \`${o._id}\`\n`;
        text += `━━━━━━━━━━━━━━━━━━\n`;
    }
    text += `\n📝 /buy_offer [رقم العرض] - لشراء عرض`;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔄 تحديث', 'offers_sell'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

// ========== عروض الشراء ==========
bot.action('offers_buy', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const offers = await db.getOffers('buy', null, 'price', 'desc', 20);
    if (!offers.length) {
        await ctx.editMessageText('📭 لا توجد عروض شراء حالياً', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
        return;
    }
    let text = '🔴 *عروض الشراء* 🔴\n\n';
    for (const o of offers) {
        const verifiedIcon = o.isVerified ? '✅' : '❌';
        const merchantIcon = o.isMerchant ? '👑' : '';
        text += `👤 ${o.firstName || o.username} ${verifiedIcon}${merchantIcon} | ⭐ ${o.rating.toFixed(1)}\n`;
        text += `💰 ${o.fiatAmount.toFixed(2)} ${o.currency} | 📊 ${o.price.toFixed(2)} ${o.currency}/USD\n`;
        text += `💵 القيمة: ${(o.fiatAmount / o.price).toFixed(2)} USD\n`;
        text += `🏦 ${o.paymentMethod}\n`;
        text += `🆔 \`${o._id}\`\n`;
        text += `━━━━━━━━━━━━━━━━━━\n`;
    }
    text += `\n📝 /sell_offer [رقم العرض] - لبيع عرض`;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔄 تحديث', 'offers_buy'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

// ========== إنشاء عرض ==========
bot.action('create_offer', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const currencyList = SUPPORTED_CURRENCIES.map(c => `• ${c}`).join('\n');
    const paymentList = PAYMENT_METHODS.map(p => `• ${p}`).join('\n');
    const banksList = SUDAN_BANKS.map(b => `• ${b}`).join('\n');
    await ctx.editMessageText(
        `➕ *إنشاء عرض جديد*\n\n` +
        `📝 *الأوامر:*\n\n` +
        `*لإنشاء عرض بيع:*\n` +
        `/sell [العملة] [المبلغ] [السعر] [طريقة الدفع] [تفاصيل الدفع]\n\n` +
        `*لإنشاء عرض شراء:*\n` +
        `/buy [العملة] [المبلغ] [السعر] [طريقة الدفع] [تفاصيل الدفع]\n\n` +
        `📊 *مثال:*\n` +
        `/sell SDG 100000 560 بنكي "بنك الخرطوم - 123456 - أحمد"\n\n` +
        `🌍 *العملات المدعومة:*\n${currencyList}\n\n` +
        `🏦 *طرق الدفع:*\n${paymentList}\n\n` +
        `🏛️ *البنوك السودانية:*\n${banksList}`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) }
    );
});

// ========== أوامر إنشاء العروض ==========
bot.command('sell', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 6) return ctx.reply('❌ /sell [العملة] [المبلغ] [السعر] [طريقة الدفع] [تفاصيل الدفع]\nمثال: /sell SDG 100000 560 بنكي "بنك الخرطوم - 123456 - أحمد"');
    const currency = args[1].toUpperCase();
    const fiatAmount = parseFloat(args[2]);
    const price = parseFloat(args[3]);
    const paymentMethod = args[4];
    const paymentDetails = args.slice(5).join(' ');
    if (!SUPPORTED_CURRENCIES.includes(currency)) return ctx.reply(`❌ عملة غير مدعومة. المدعومة: ${SUPPORTED_CURRENCIES.join(', ')}`);
    if (isNaN(fiatAmount) || fiatAmount <= 0) return ctx.reply('❌ المبلغ غير صحيح');
    if (isNaN(price) || price <= 0) return ctx.reply('❌ السعر غير صحيح');
    const result = await db.createOffer(ctx.from.id, 'sell', currency, fiatAmount, price, paymentMethod, paymentDetails, '', '', '', 10, 100000);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

bot.command('buy', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 6) return ctx.reply('❌ /buy [العملة] [المبلغ] [السعر] [طريقة الدفع] [تفاصيل الدفع]\nمثال: /buy SDG 100000 560 بنكي "بنك الخرطوم - 123456 - أحمد"');
    const currency = args[1].toUpperCase();
    const fiatAmount = parseFloat(args[2]);
    const price = parseFloat(args[3]);
    const paymentMethod = args[4];
    const paymentDetails = args.slice(5).join(' ');
    if (!SUPPORTED_CURRENCIES.includes(currency)) return ctx.reply(`❌ عملة غير مدعومة. المدعومة: ${SUPPORTED_CURRENCIES.join(', ')}`);
    if (isNaN(fiatAmount) || fiatAmount <= 0) return ctx.reply('❌ المبلغ غير صحيح');
    if (isNaN(price) || price <= 0) return ctx.reply('❌ السعر غير صحيح');
    const result = await db.createOffer(ctx.from.id, 'buy', currency, fiatAmount, price, paymentMethod, paymentDetails, '', '', '', 10, 100000);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

// ========== شراء/بيع عرض ==========
bot.command('buy_offer', async (ctx) => {
    const id = ctx.message.text.split(' ')[1];
    if (!id) return ctx.reply('❌ /buy_offer [رقم العرض]');
    const result = await db.startTrade(id, ctx.from.id);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

bot.command('sell_offer', async (ctx) => {
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

// ========== صفقاتي ==========
bot.action('my_trades', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const stats = await db.getUserStats(ctx.from.id);
    await ctx.editMessageText(
        `📋 *صفقاتي*\n\n` +
        `✅ *المكتملة:* ${stats.completedTrades}\n` +
        `💰 *إجمالي التداول:* ${stats.totalTraded.toFixed(2)} USD\n` +
        `⭐ *التقييم:* ${stats.rating.toFixed(1)}/5\n\n` +
        `📝 *لعرض تفاصيل الصفقات، استخدم:*\n` +
        `/trades - عرض آخر 10 صفقات`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) }
    );
});

// ========== محفظتي ==========
bot.action('my_wallet', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const w = await db.getUserWallet(ctx.from.id);
    const stats = await db.getUserStats(ctx.from.id);
    await ctx.editMessageText(
        `💼 *محفظتي*\n\n` +
        `💵 *USD:* ${stats.usdBalance.toFixed(2)}\n` +
        `🔑 *بصمة المحفظة:* \`${w.walletSignature ? w.walletSignature.slice(0, 16) : 'جاري الإنشاء'}...\`\n\n` +
        `📤 *عناوين استقبال العملات:*\n\n` +
        `🟡 *BNB:*\n\`${w.bnbAddress}\`\n\n` +
        `🟣 *POLYGON:*\n\`${w.polygonAddress}\`\n\n` +
        `🟢 *SOLANA:*\n\`${w.solanaAddress}\`\n\n` +
        `🔷 *APTOS:*\n\`${w.aptosAddress}\`\n\n` +
        `📝 *لإيداع العملات:* /deposit [العملة] [المبلغ] [الشبكة]\n` +
        `📝 *لسحب العملات:* /withdraw [العملة] [المبلغ] [الشبكة] [العنوان]`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('📋 نسخ العناوين', 'copy_addresses'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) }
    );
});

bot.action('copy_addresses', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const w = await db.getUserWallet(ctx.from.id);
    await ctx.editMessageText(
        `📋 *عناوين محفظتك*\n\n` +
        `🟡 BNB:\n\`${w.bnbAddress}\`\n\n` +
        `🟣 POLYGON:\n\`${w.polygonAddress}\`\n\n` +
        `🟢 SOLANA:\n\`${w.solanaAddress}\`\n\n` +
        `🔷 APTOS:\n\`${w.aptosAddress}\``,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'my_wallet')]]) }
    );
});

// ========== بيانات البنك ==========
bot.action('bank_details', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const user = await db.getUser(ctx.from.id);
    await ctx.editMessageText(
        `🏦 *بيانات البنك*\n\n` +
        `🏛️ *البنك:* ${user.bankName || 'غير محدد'}\n` +
        `🔢 *رقم الحساب:* ${user.bankAccountNumber || 'غير محدد'}\n` +
        `👤 *اسم الحساب:* ${user.bankAccountName || 'غير محدد'}\n\n` +
        `📝 *لتحديث البيانات:*\n` +
        `/set_bank [البنك] [رقم الحساب] [اسم الحساب]\n\n` +
        `🏛️ *البنوك المتاحة:*\n${SUDAN_BANKS.map(b => `• ${b}`).join('\n')}`,
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
    if (args.length < 4) return ctx.reply('❌ /deposit [العملة] [المبلغ] [الشبكة]\nمثال: /deposit USDT 100 bnb');
    const currency = args[1].toUpperCase();
    const amount = parseFloat(args[2]);
    const network = args[3].toLowerCase();
    if (isNaN(amount) || amount <= 0) return ctx.reply('❌ المبلغ غير صحيح');
    const result = await db.requestDeposit(ctx.from.id, amount, currency, network);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

bot.command('withdraw', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 5) return ctx.reply('❌ /withdraw [العملة] [المبلغ] [الشبكة] [العنوان]\nمثال: /withdraw USDT 100 bnb 0x...');
    const currency = args[1].toUpperCase();
    const amount = parseFloat(args[2]);
    const network = args[3].toLowerCase();
    const address = args[4];
    if (isNaN(amount) || amount <= 0) return ctx.reply('❌ المبلغ غير صحيح');
    const result = await db.requestWithdraw(ctx.from.id, amount, currency, network, address);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

// ========== المتصدرين ==========
bot.action('leaderboard', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const leaders = await db.getLeaderboard(15);
    const stats = await db.getGlobalStats();
    if (!leaders.length) return ctx.editMessageText('🏆 لا يوجد متصدرين', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
    let text = `🏆 *قائمة المتصدرين* 🏆\n👥 *المستخدمين:* ${stats.users}\n💰 *إجمالي التداول:* ${stats.totalTraded} USD\n━━━━━━━━━━━━━━━━━━\n\n`;
    for (let i = 0; i < leaders.length; i++) {
        const l = leaders[i];
        const name = l.firstName || l.username || `مستخدم ${l.userId}`;
        const medal = i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
        const verifiedIcon = l.isVerified ? '✅' : '';
        const merchantIcon = l.isMerchant ? '👑' : '';
        text += `${medal} *${name}* ${verifiedIcon}${merchantIcon}\n`;
        text += `   💰 التداول: ${l.totalTraded.toFixed(2)} USD\n`;
        text += `   ⭐ التقييم: ${l.rating.toFixed(1)}/5\n`;
        text += `   ✅ الصفقات: ${l.completedTrades}\n━━━━━━━━━━━━━━━━━━\n`;
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
        `📞 *الدعم الفني*\n\n` +
        `👤 *الأدمن:* @${ADMIN_USERNAME}\n` +
        `🆔 *المعرف:* ${ADMIN_ID}\n\n` +
        `💸 *عناوين العمولات:*\n` +
        `🟡 BNB: \`${process.env.COMMISSION_WALLET_BNB || '0x2a2548117C7113eB807298D74A44d451E330AC95'}\`\n` +
        `🟣 POLYGON: \`${process.env.COMMISSION_WALLET_POLYGON || '0x2a2548117C7113eB807298D74A44d451E330AC95'}\`\n` +
        `🟢 SOLANA: \`${process.env.COMMISSION_WALLET_SOLANA || 'HFMJRRqC76YdBE4fXDnyicYDq6ujFhkFJctBfQonStL'}\`\n` +
        `🔷 APTOS: \`${process.env.COMMISSION_WALLET_APTOS || '0xf0713a00655788d44218e42b71343be9f18d96533d322c28ce9830dcf9022468'}\``,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.url('📨 تواصل', `https://t.me/${ADMIN_USERNAME}`)], [Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) }
    );
});

// ========== العودة للقائمة ==========
bot.action('back_to_menu', rateLimitMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    const stats = await db.getUserStats(ctx.from.id);
    const text = `✨ *القائمة الرئيسية*\n👤 ${ctx.from.first_name}\n💵 ${stats.usdBalance.toFixed(2)} USD\n⭐ ${stats.rating.toFixed(1)}/5\n✅ ${stats.completedTrades} صفقة`;
    const kb = ctx.from.id === ADMIN_ID ? adminKeyboard : mainKeyboard;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb });
});

// ========== أوامر الأدمن ==========
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
        `📊 *إحصائيات عامة*\n\n` +
        `👥 *المستخدمين:* ${s.users}\n` +
        `💰 *إجمالي التداول:* ${s.totalTraded} USD\n` +
        `⭐ *متوسط التقييم:* ${s.avgRating}/5\n` +
        `📊 *العروض النشطة:* ${s.activeOffers}\n` +
        `⏳ *الصفقات المعلقة:* ${s.pendingTrades}`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) }
    );
});

bot.action('today_stats', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ للأدمن فقط');
    const s = await db.getTodayStats();
    await ctx.editMessageText(
        `📅 *إحصائيات اليوم*\n${new Date().toLocaleDateString('ar')}\n\n` +
        `👥 *مستخدمين جدد:* ${s?.newUsers || 0}\n` +
        `📈 *الصفقات:* ${s?.totalTrades || 0}\n` +
        `💰 *حجم التداول:* ${s?.totalVolume?.toFixed(2) || 0} USD\n` +
        `💸 *العمولات:* ${s?.totalCommission?.toFixed(2) || 0} USD\n` +
        `📊 *العروض النشطة:* ${s?.activeOffers || 0}`,
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
            text += `👤 ${u.firstName || u.username || u.userId}\n`;
            text += `🆔 \`${u.userId}\`\n`;
            text += `📞 ${u.phoneNumber || 'لا يوجد'}\n`;
            text += `📧 ${u.email || 'لا يوجد'}\n`;
            text += `⭐ ${u.rating.toFixed(1)}/5\n`;
            text += `✅ ${u.isVerified ? 'موثق ✅' : 'غير موثق ❌'}\n`;
            text += `👑 ${u.isMerchant ? 'تاجر' : 'مستخدم عادي'}\n━━━━━━━━━━━━━━━━━━\n`;
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
    console.log('🌍 Supported Currencies:', SUPPORTED_CURRENCIES.length);
    console.log('🏦 Sudanese Banks:', SUDAN_BANKS.length);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
