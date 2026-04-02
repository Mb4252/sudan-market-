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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'mining-app')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'mining-app', 'index.html')));
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ========== المتغيرات البيئية ==========
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

// ========== API Routes ==========
app.get('/api/global_stats', async (req, res) => res.json(await db.getGlobalStats()));
app.get('/api/user/:userId', async (req, res) => {
    const u = await db.getUser(parseInt(req.params.userId));
    res.json(u || { usdBalance: 0, isVerified: false });
});
app.get('/api/user/stats/:userId', async (req, res) => res.json(await db.getUserStats(parseInt(req.params.userId))));
app.get('/api/kyc/status/:userId', async (req, res) => res.json(await db.getKycStatus(parseInt(req.params.userId))));
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

// ========== أوامر البوت ==========
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

// ========== أمر عرض المعرف ==========
bot.command('my_id', async (ctx) => {
    await ctx.reply(`🆔 *معرفك:* \`${ctx.from.id}\`\n👤 *اسمك:* ${ctx.from.first_name}\n📛 *يوزر:* @${ctx.from.username || 'لا يوجد'}`, { parse_mode: 'Markdown' });
});

// ========== أمر عرض لوحة الأدمن ==========
bot.command('admin', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply('⛔ هذا الأمر للأدمن فقط!');
    }
    await ctx.reply('👑 *لوحة تحكم الأدمن*', { parse_mode: 'Markdown', ...adminKeyboard });
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
        statusText = `❌ *تم رفض طلب التوثيق*\n📝 السبب: ${kycStatus.rejectionReason || 'بيانات غير صحيحة'}`;
        actionButton = [[Markup.button.callback('📝 تقديم طلب جديد', 'start_kyc'), Markup.button.callback('🔙 رجوع', 'back_to_menu')]];
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
        `• البيانات البنكية (اسم البنك - رقم الحساب - اسم الحساب)\n\n` +
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

// أمر التوثيق المباشر
bot.command('kyc', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 5) {
        return ctx.reply('❌ الصيغة: /kyc [الاسم الكامل] [رقم الجواز] [الرقم الوطني] [رقم الهاتف] <البريد الإلكتروني اختياري>\nمثال: /kyc "محمد أحمد" A12345678 1234567890 0912345678');
    }
    
    const fullName = args[1];
    const passportNumber = args[2];
    const nationalId = args[3];
    const phoneNumber = args[4];
    const email = args[5] || '';
    
    ctx.session.kycData = { fullName, passportNumber, nationalId, phoneNumber, email };
    ctx.session.state = 'kyc_step2';
    
    await ctx.reply('📸 *الرجاء إرسال صورة واضحة للجواز الساري* (صورة أو ملف)\n\n📌 *نصيحة:* تأكد من وضوح الصورة وجودتها');
});

// معالجة الصور
bot.on('photo', messageRateLimitMiddleware, async (ctx) => {
    if (ctx.session?.state === 'kyc_step2') {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        ctx.session.kycData.passportPhotoFileId = photo.file_id;
        ctx.session.state = 'kyc_step3';
        await ctx.reply('📸 *الرجاء إرسال صورة شخصية واضحة*');
    } else if (ctx.session?.state === 'kyc_step3') {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        ctx.session.kycData.personalPhotoFileId = photo.file_id;
        ctx.session.state = 'kyc_step4';
        await ctx.reply('🏦 *الرجاء إدخال بياناتك البنكية:*\n\n' +
            `/bank [اسم البنك] [رقم الحساب] [اسم صاحب الحساب]\n\n` +
            `📎 *مثال:*\n` +
            `/bank "بنك الخرطوم" 1234567890 "محمد أحمد"`);
    }
});

// معالجة البيانات البنكية
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
        
        const result = await db.createKycRequest(
            ctx.from.id,
            ctx.session.kycData.fullName,
            ctx.session.kycData.passportNumber,
            ctx.session.kycData.nationalId,
            ctx.session.kycData.phoneNumber,
            ctx.session.kycData.email || '',
            'SD',
            '',
            ctx.session.kycData.passportPhotoFileId,
            ctx.session.kycData.personalPhotoFileId,
            bankName,
            bankAccountNumber,
            bankAccountName
        );
        
        await ctx.reply(result.message, { parse_mode: 'Markdown' });
        
        // إرسال إشعار للأدمن
        const pendingRequests = await db.getPendingKycRequests();
        const newRequest = pendingRequests.find(r => r.userId === ctx.from.id);
        
        if (newRequest) {
            // إرسال الصور للأدمن
            await bot.telegram.sendPhoto(ADMIN_ID, newRequest.passportPhotoFileId, {
                caption: `🆔 *طلب توثيق جديد!*\n\n` +
                    `👤 *المستخدم:* ${ctx.from.first_name} (@${ctx.from.username || 'لا يوجد'})\n` +
                    `🆔 *المعرف:* ${ctx.from.id}\n` +
                    `📋 *رقم الطلب:* \`${newRequest._id}\`\n\n` +
                    `📝 *البيانات:*\n` +
                    `• الاسم: ${newRequest.fullName}\n` +
                    `• الجواز: ${newRequest.passportNumber}\n` +
                    `• الرقم الوطني: ${newRequest.nationalId}\n` +
                    `• الهاتف: ${newRequest.phoneNumber}\n` +
                    `• البريد: ${newRequest.email || 'لا يوجد'}\n\n` +
                    `✅ /approve_kyc ${newRequest._id}\n` +
                    `❌ /reject_kyc ${newRequest._id} [السبب]`,
                parse_mode: 'Markdown'
            });
            
            await bot.telegram.sendPhoto(ADMIN_ID, newRequest.personalPhotoFileId, {
                caption: `📸 *الصورة الشخصية للمستخدم*\n🆔 الطلب: ${newRequest._id}`
            });
        }
        
        delete ctx.session.state;
        delete ctx.session.kycData;
    }
});

// ========== أوامر الأدمن للتوثيق ==========

// عرض طلبات التوثيق المعلقة
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
        text += `🆔 الطلب: \`${req._id}\`\n`;
        text += `👤 المستخدم: ${req.fullName}\n`;
        text += `📞 الهاتف: ${req.phoneNumber}\n`;
        text += `📅 التاريخ: ${new Date(req.createdAt).toLocaleString()}\n`;
        text += `━━━━━━━━━━━━━━━━━━\n`;
    }
    text += `\n📝 *للموافقة:* /approve_kyc [الرقم]\n❌ *للرفض:* /reject_kyc [الرقم] [السبب]`;
    
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]]) });
});

// الموافقة على طلب توثيق
bot.command('approve_kyc', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) return ctx.reply('❌ /approve_kyc [رقم الطلب]');
    
    const result = await db.approveKyc(args[1], ctx.from.id);
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

// ========== باقي الأزرار (كما هي) ==========
// ... (أضف باقي الأزرار والأوامر من الملف السابق)

// تشغيل البوت
bot.launch().then(() => {
    console.log('🚀 P2P Exchange Bot running');
    console.log('👑 Admin:', ADMIN_ID);
    console.log('💵 Platform Fee:', PLATFORM_FEE, '%');
    console.log('🌍 Supported Currencies:', SUPPORTED_CURRENCIES.length);
    console.log('🏦 Sudanese Banks:', SUDAN_BANKS.length);
    console.log('🆔 KYC System: Admin Review Mode');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
