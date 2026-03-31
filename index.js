require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const db = require('./database');
const express = require('express');
const path = require('path');

// ========== إعداد خادم الويب ==========
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'mining-app')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'mining-app', 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========== API Routes ==========
app.get('/api/user/:userId', async (req, res) => {
    try {
        const user = await db.getUser(parseInt(req.params.userId));
        if (user) {
            res.json({
                balance: user.crystalBalance,
                miningRate: user.miningRate,
                miningLevel: user.miningLevel,
                totalMined: user.totalMined,
                lastMiningTime: user.lastMiningTime,
                dailyMined: user.dailyMined,
                lastMiningDate: user.lastMiningDate
            });
        } else {
            res.json({ balance: 0, miningRate: 1, miningLevel: 1, totalMined: 0 });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/mine', async (req, res) => {
    try {
        const { user_id } = req.body;
        const result = await db.mine(parseInt(user_id));
        res.json(result);
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        const leaders = await db.getLeaderboard(10);
        const formatted = leaders.map(leader => ({
            name: leader.firstName || leader.username || `مستخدم ${leader.userId}`,
            balance: leader.crystalBalance || 0,
            level: leader.miningLevel || 1
        }));
        res.json(formatted);
    } catch (error) {
        res.json([]);
    }
});

app.get('/api/liquidity', async (req, res) => {
    try {
        const liquidity = await db.getLiquidity();
        res.json({
            total_liquidity: liquidity?.totalLiquidity || 1000000,
            total_sold: liquidity?.totalSold || 0,
            available: (liquidity?.totalLiquidity || 1000000) - (liquidity?.totalSold || 0)
        });
    } catch (error) {
        res.json({ total_liquidity: 1000000, total_sold: 0, available: 1000000 });
    }
});

app.post('/api/purchase', async (req, res) => {
    try {
        const { user_id, amount } = req.body;
        const result = await db.requestPurchase(parseInt(user_id), parseFloat(amount));
        res.json(result);
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/upgrade', async (req, res) => {
    try {
        const { user_id } = req.body;
        const result = await db.upgradeMiningRate(parseInt(user_id));
        res.json(result);
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { user_id, username, first_name, language } = req.body;
        await db.registerUser(parseInt(user_id), username, first_name, null, language || 'ar');
        res.json({ success: true });
    } catch (error) {
        res.json({ success: true });
    }
});

app.get('/api/user/daily/:userId', async (req, res) => {
    try {
        const stats = await db.getUserStats(parseInt(req.params.userId));
        res.json({
            daily_mined: stats?.dailyMined || 0,
            daily_limit: 700,
            remaining: 700 - (stats?.dailyMined || 0)
        });
    } catch (error) {
        res.json({ daily_mined: 0, daily_limit: 700, remaining: 700 });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});

// ========== إعداد بوت التلجرام ==========
(async () => {
    try {
        await db.connect();
        console.log('✅ Database connected successfully');
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        process.exit(1);
    }
})();

const bot = new Telegraf(process.env.BOT_TOKEN);
const WEBAPP_URL = process.env.WEBAPP_URL || `https://sdm-security-bot.onrender.com`;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'Mb4252';
const UPGRADE_USDT_PRICE = 5;
const CRYSTAL_PRICE = 0.01;
const DAILY_LIMIT = 700;
const TRON_ADDRESS = process.env.TRON_ADDRESS;

// قائمة الأزرار الرئيسية
const mainKeyboard = Markup.inlineKeyboard([
    [Markup.button.webApp('🚀 فتح تطبيق التعدين', WEBAPP_URL)],
    [Markup.button.callback('⛏️ تعدين', 'mine_action')],
    [Markup.button.callback('💰 الرصيد بـ USDT', 'show_usdt')],
    [Markup.button.callback('🏆 المتصدرين', 'leaderboard')],
    [Markup.button.callback('📊 سوق P2P', 'p2p_market')],
    [Markup.button.callback('⚡ ترقية', 'upgrade_menu')],
    [Markup.button.callback('👥 إحالة', 'referral_system')],
    [Markup.button.callback('🌐 اللغة', 'change_language')],
    [Markup.button.callback('📞 الدعم', 'support')],
    [Markup.button.callback('📈 إحصائياتي', 'my_stats')]
]);

// قائمة أدمن
const adminKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📋 طلبات الترقية', 'pending_upgrades')],
    [Markup.button.callback('💰 طلبات الشراء', 'pending_purchases')],
    [Markup.button.callback('📊 إحصائيات عامة', 'global_stats')],
    [Markup.button.callback('📅 إحصائيات اليوم', 'today_stats')],
    [Markup.button.callback('🔍 بحث عن مستخدم', 'search_user')],
    [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
]);

// أمر /start
bot.start(async (ctx) => {
    const user = ctx.from;
    const referrerId = ctx.startPayload ? parseInt(ctx.startPayload) : null;
    
    await db.registerUser(user.id, user.username, user.first_name, referrerId, 'ar');
    
    const stats = await db.getUserStats(user.id);
    const referralLink = `https://t.me/${ctx.botInfo.username}?start=${user.id}`;
    
    const welcomeText = db.getText('welcome', stats.language, {
        name: user.first_name,
        balance: stats.crystalBalance,
        rate: stats.miningRate,
        level: stats.miningLevel,
        daily: stats.dailyMined,
        limit: DAILY_LIMIT
    });
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.webApp('🚀 فتح تطبيق التعدين', WEBAPP_URL)],
        [Markup.button.callback('⛏️ تعدين', 'mine_action')],
        [Markup.button.callback('💰 الرصيد بـ USDT', 'show_usdt')],
        [Markup.button.callback('🏆 المتصدرين', 'leaderboard')],
        [Markup.button.callback('📊 سوق P2P', 'p2p_market')],
        [Markup.button.callback('⚡ ترقية', 'upgrade_menu')],
        [Markup.button.callback('👥 إحالة', 'referral_system')],
        [Markup.button.callback('🌐 اللغة', 'change_language')],
        [Markup.button.callback('📞 الدعم', 'support')],
        [Markup.button.callback('📈 إحصائياتي', 'my_stats')]
    ]);
    
    await ctx.reply(welcomeText, { parse_mode: 'Markdown', ...keyboard });
    
    // إرسال رابط الإحالة
    await ctx.reply(`🔗 *رابط الإحالة الخاص بك:*\n\`${referralLink}\``, { parse_mode: 'Markdown' });
});

// تعدين
bot.action('mine_action', async (ctx) => {
    await ctx.answerCbQuery();
    
    const result = await db.mine(ctx.from.id);
    
    if (result.success) {
        await ctx.editMessageText(result.message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
        });
    } else {
        await ctx.editMessageText(result.message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
        });
    }
});

// عرض الرصيد بـ USDT
bot.action('show_usdt', async (ctx) => {
    await ctx.answerCbQuery();
    
    const stats = await db.getUserStats(ctx.from.id);
    const text = db.getText('usdtValue', stats.language, {
        crystals: stats.crystalBalance,
        usdt: stats.usdtValue
    });
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
    });
});

// المتصدرين
bot.action('leaderboard', async (ctx) => {
    await ctx.answerCbQuery();
    
    const leaders = await db.getLeaderboard(15);
    
    if (!leaders || leaders.length === 0) {
        await ctx.editMessageText('🏆 لا يوجد متصدرين بعد! ابدأ التعدين الآن 🚀', {
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
        });
        return;
    }
    
    let leaderboardText = '🏆 *قائمة المتصدرين* 🏆\n\n';
    
    for (let i = 0; i < leaders.length; i++) {
        const leader = leaders[i];
        const name = leader.firstName || leader.username || `مستخدم ${leader.userId}`;
        const medal = i === 0 ? '👑 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : `${i + 1}. `;
        leaderboardText += `${medal} *${name}*\n`;
        leaderboardText += `   💎 ${leader.crystalBalance.toFixed(2)} CRYSTAL\n`;
        leaderboardText += `   ⛏️ المستوى ${leader.miningLevel}\n\n`;
    }
    
    await ctx.editMessageText(leaderboardText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
    });
});

// قائمة الترقية
bot.action('upgrade_menu', async (ctx) => {
    await ctx.answerCbQuery();
    
    const stats = await db.getUserStats(ctx.from.id);
    const upgradeCost = 100 * stats.miningLevel;
    const usdtValue = upgradeCost * 0.01;
    const nextRate = (stats.miningRate + 0.5).toFixed(1);
    
    const text = `
⚡ *ترقية معدل التعدين* ⚡

📊 *مستواك:* ${stats.miningLevel}
⚡ *المعدل الحالي:* ${stats.miningRate}x
📈 *المعدل بعد الترقية:* ${nextRate}x

💰 *تكلفة الترقية:* ${upgradeCost} CRYSTAL
💵 *قيمتها:* ${usdtValue} USDT

📝 *للترقية:*
أرسل الأمر:
\`/upgrade\`

⚠️ *سيتم خصم المبلغ من رصيدك مباشرة*
    `;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('⚡ ترقية الآن', 'do_upgrade')],
        [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
    ]);
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...keyboard
    });
});

// تنفيذ الترقية
bot.action('do_upgrade', async (ctx) => {
    await ctx.answerCbQuery();
    
    const result = await db.upgradeMiningRate(ctx.from.id);
    
    if (result.success) {
        await ctx.editMessageText(result.message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
        });
    } else {
        await ctx.editMessageText(result.message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
        });
    }
});

// أمر ترقية
bot.command('upgrade', async (ctx) => {
    const result = await db.upgradeMiningRate(ctx.from.id);
    
    if (result.success) {
        await ctx.reply(result.message, { parse_mode: 'Markdown' });
    } else {
        await ctx.reply(result.message, { parse_mode: 'Markdown' });
    }
});

// قائمة الشراء
bot.action('buy_menu', async (ctx) => {
    await ctx.answerCbQuery();
    
    const liquidity = await db.getLiquidity();
    const available = liquidity.totalLiquidity - liquidity.totalSold;
    
    const text = `
💰 *شراء عملة CRYSTAL* 💰

💎 *السعر:* ${CRYSTAL_PRICE} USDT لكل CRYSTAL
📊 *السيولة المتاحة:* ${available.toFixed(2)} CRYSTAL
💵 *الحد الأدنى:* 10 USDT (1000 CRYSTAL)

📝 *للشراء:*
أرسل الأمر التالي مع الكمية:
\`/buy 1000\` (لشراء 1000 كريستال)

⚠️ *سيتم إنشاء طلب شراء وستحصل على عنوان الدفع عبر شبكة TRON (TRC20)*
    `;
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
    });
});

// أمر شراء
bot.command('buy', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) {
        await ctx.reply('❌ الصيغة: /buy [الكمية]\nمثال: /buy 1000');
        return;
    }
    
    const amount = parseFloat(args[1]);
    if (isNaN(amount) || amount <= 0) {
        await ctx.reply('❌ الرجاء إدخال كمية صحيحة');
        return;
    }
    
    const result = await db.requestPurchase(ctx.from.id, amount);
    
    if (result.success) {
        // زر نسخ العنوان
        const copyKeyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📋 نسخ عنوان TRON', `copy_address_${result.payment_address}`)],
            [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
        ]);
        
        await ctx.reply(result.message, { parse_mode: 'Markdown', ...copyKeyboard });
        
        await bot.telegram.sendMessage(ADMIN_ID, `
🔔 *طلب شراء جديد!*

👤 المستخدم: ${ctx.from.first_name} (@${ctx.from.username || 'لا يوجد'})
🆔 المعرف: ${ctx.from.id}
💎 الكمية: ${result.crystal_amount} CRYSTAL
💰 المبلغ: ${result.usdt_amount} USDT
📋 رقم الطلب: \`${result.request_id}\`

للتأكيد:
\`/confirm_purchase ${result.request_id} [رابط المعاملة]\`
        `, { parse_mode: 'Markdown' });
    } else {
        await ctx.reply(`❌ ${result.message}`);
    }
});

// زر نسخ عنوان TRON
bot.action(/copy_address_(.+)/, async (ctx) => {
    const address = ctx.match[1];
    await ctx.answerCbQuery('✅ تم نسخ العنوان!');
    await ctx.reply(`📋 *العنوان المنسوخ:*\n\`${address}\``, { parse_mode: 'Markdown' });
});

// تأكيد شراء (للأدمن)
bot.command('confirm_purchase', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        await ctx.reply('⛔ هذا الأمر للأدمن فقط!');
        return;
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length !== 3) {
        await ctx.reply('❌ الصيغة: /confirm_purchase [رقم الطلب] [رابط المعاملة]');
        return;
    }
    
    const requestId = args[1];
    const transactionHash = args[2];
    
    const result = await db.confirmPurchase(requestId, transactionHash, ctx.from.id);
    
    if (result.success) {
        await ctx.reply(result.message, { parse_mode: 'Markdown' });
    } else {
        await ctx.reply(`❌ ${result.message}`);
    }
});

// تأكيد ترقية (للأدمن)
bot.command('confirm_upgrade', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        await ctx.reply('⛔ هذا الأمر للأدمن فقط!');
        return;
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length !== 3) {
        await ctx.reply('❌ الصيغة: /confirm_upgrade [رقم الطلب] [رابط المعاملة]');
        return;
    }
    
    const requestId = args[1];
    const transactionHash = args[2];
    
    const result = await db.confirmUpgrade(requestId, transactionHash, ctx.from.id);
    
    if (result.success) {
        await ctx.reply(result.message, { parse_mode: 'Markdown' });
        
        if (result.user_id) {
            await bot.telegram.sendMessage(result.user_id, result.message, { parse_mode: 'Markdown' });
        }
    } else {
        await ctx.reply(`❌ ${result.message}`);
    }
});

// سوق P2P
bot.action('p2p_market', async (ctx) => {
    await ctx.answerCbQuery();
    
    const stats = await db.getUserStats(ctx.from.id);
    
    const text = `
📊 *سوق P2P لبيع وشراء CRYSTAL* 📊

💎 *رصيدك:* ${stats.crystalBalance.toFixed(2)} CRYSTAL
💰 *قيمته:* ${stats.usdtValue.toFixed(2)} USDT

اختر ما تريد:
• 🟢 *عروض البيع* - شراء كريستال من مستخدمين
• 🔴 *عروض الشراء* - بيع كريستال لمستخدمين
• ➕ *إنشاء عرض* - أنشئ عرضك الخاص

⚠️ *جميع الصفقات بين المستخدمين مباشرة*
    `;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🟢 عروض البيع', 'p2p_buy_offers')],
        [Markup.button.callback('🔴 عروض الشراء', 'p2p_sell_offers')],
        [Markup.button.callback('➕ إنشاء عرض', 'p2p_create_offer')],
        [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
    ]);
    
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
});

// عرض عروض البيع
bot.action('p2p_buy_offers', async (ctx) => {
    await ctx.answerCbQuery();
    
    const offers = await db.getP2pOffers('sell');
    
    if (offers.length === 0) {
        await ctx.editMessageText('📭 لا توجد عروض بيع حالياً', {
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'p2p_market')]])
        });
        return;
    }
    
    let text = '🟢 *عروض البيع* 🟢\n\n';
    for (const offer of offers) {
        text += `👤 ${offer.firstName || offer.username}\n`;
        text += `💎 ${offer.crystalAmount} CRYSTAL\n`;
        text += `💰 ${offer.usdtAmount} USDT\n`;
        text += `📊 ${offer.pricePerCrystal.toFixed(4)} USDT/CRYSTAL\n`;
        text += `🆔 \`${offer.id}\`\n`;
        text += `━━━━━━━━━━━━━━━━━━\n`;
    }
    
    text += `\n📝 *لشراء عرض:* /buy_offer [رقم العرض]`;
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'p2p_market')]])
    });
});

// عرض عروض الشراء
bot.action('p2p_sell_offers', async (ctx) => {
    await ctx.answerCbQuery();
    
    const offers = await db.getP2pOffers('buy');
    
    if (offers.length === 0) {
        await ctx.editMessageText('📭 لا توجد عروض شراء حالياً', {
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'p2p_market')]])
        });
        return;
    }
    
    let text = '🔴 *عروض الشراء* 🔴\n\n';
    for (const offer of offers) {
        text += `👤 ${offer.firstName || offer.username}\n`;
        text += `💎 ${offer.crystalAmount} CRYSTAL\n`;
        text += `💰 ${offer.usdtAmount} USDT\n`;
        text += `📊 ${offer.pricePerCrystal.toFixed(4)} USDT/CRYSTAL\n`;
        text += `🆔 \`${offer.id}\`\n`;
        text += `━━━━━━━━━━━━━━━━━━\n`;
    }
    
    text += `\n📝 *لبيع عرض:* /sell_offer [رقم العرض]`;
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'p2p_market')]])
    });
});

// إنشاء عرض P2P
bot.action('p2p_create_offer', async (ctx) => {
    await ctx.answerCbQuery();
    
    const text = `
📝 *إنشاء عرض P2P*

أرسل العرض بالصيغة التالية:
\`sell 1000 10\` - لبيع 1000 كريستال بـ 10 USDT
\`buy 500 5\` - لشراء 500 كريستال بـ 5 USDT

📊 *سعر الوحدة:* ${CRYSTAL_PRICE} USDT (السعر الرسمي)

⚠️ *ملاحظة:* يمكنك تحديد السعر حسب رغبتك
    `;
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'p2p_market')]])
    });
    
    ctx.session = { state: 'p2p_create' };
});

// أمر شراء عرض P2P
bot.command('buy_offer', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) {
        await ctx.reply('❌ الصيغة: /buy_offer [رقم العرض]');
        return;
    }
    
    const offerId = args[1];
    const result = await db.executeP2pTrade(offerId, ctx.from.id);
    
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

// أمر بيع عرض P2P
bot.command('sell_offer', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) {
        await ctx.reply('❌ الصيغة: /sell_offer [رقم العرض]');
        return;
    }
    
    const offerId = args[1];
    const result = await db.executeP2pTrade(offerId, ctx.from.id);
    
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
});

// معالجة إنشاء عرض P2P
bot.on('text', async (ctx) => {
    if (ctx.session?.state === 'p2p_create') {
        const parts = ctx.message.text.split(' ');
        if (parts.length !== 3) {
            await ctx.reply('❌ الصيغة: [sell/buy] [الكمية] [السعر]\nمثال: sell 1000 10');
            delete ctx.session.state;
            return;
        }
        
        const [type, amount, usdt] = parts;
        const crystalAmount = parseFloat(amount);
        const usdtAmount = parseFloat(usdt);
        
        if (isNaN(crystalAmount) || isNaN(usdtAmount)) {
            await ctx.reply('❌ الرجاء إدخال أرقام صحيحة');
            delete ctx.session.state;
            return;
        }
        
        const result = await db.createP2pOffer(ctx.from.id, type, crystalAmount, usdtAmount);
        await ctx.reply(result.message, { parse_mode: 'Markdown' });
        delete ctx.session.state;
    }
});

// نظام الإحالة
bot.action('referral_system', async (ctx) => {
    await ctx.answerCbQuery();
    
    const stats = await db.getUserStats(ctx.from.id);
    const referralLink = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
    
    const text = `
👥 *نظام الإحالة* 👥

🎁 *المكافآت:*
• ادعُ 10 أصدقاء واحصل على 3000 كريستال مجاناً!
• كل صديق يدخل عن طريقك يحصل على مكافأة ترحيبية

📊 *إحصائياتك:*
• عدد الإحالات: ${stats.referralsCount}/10
• المكافأة: ${stats.referralsCount >= 10 ? '✅ تم الحصول على 3000 كريستال' : '❌ لم تتحقق بعد'}

🔗 *رابط الإحالة الخاص بك:*
\`${referralLink}\`

💡 *انشر الرابط لأصدقائك واكسب المكافآت!*
    `;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📤 مشاركة الرابط', 'share_referral')],
        [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
    ]);
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...keyboard
    });
});

// مشاركة رابط الإحالة
bot.action('share_referral', async (ctx) => {
    await ctx.answerCbQuery();
    
    const referralLink = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
    
    await ctx.reply(`🔗 *رابط الإحالة الخاص بك:*\n\`${referralLink}\``, {
        parse_mode: 'Markdown'
    });
});

// إحصائياتي
bot.action('my_stats', async (ctx) => {
    await ctx.answerCbQuery();
    
    const stats = await db.getUserStats(ctx.from.id);
    if (!stats) {
        await ctx.reply('❌ لم يتم العثور على بياناتك');
        return;
    }
    
    const text = `
📊 *إحصائياتك الشخصية* 📊

👤 *الاسم:* ${stats.firstName}
💎 *الرصيد:* ${stats.crystalBalance.toFixed(2)} CRYSTAL
💰 *القيمة:* ${stats.usdtValue.toFixed(2)} USDT
⚡ *معدل التعدين:* ${stats.miningRate}x
📈 *المستوى:* ${stats.miningLevel}
⛏️ *إجمالي التعدين:* ${stats.totalMined.toFixed(2)} CRYSTAL
📅 *تعدين اليوم:* ${stats.dailyMined}/${DAILY_LIMIT}
⏰ *المتبقي اليوم:* ${DAILY_LIMIT - stats.dailyMined} كريستال

👥 *الإحالات:* ${stats.referralsCount}/10
🎁 *مكافأة الإحالات:* ${stats.referralsCount >= 10 ? '✅ تم الحصول على 3000 كريستال' : '❌ لم تتحقق بعد'}

📅 *تاريخ التسجيل:* ${new Date(stats.createdAt).toLocaleDateString('ar')}
    `;
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
    });
});

// تغيير اللغة
bot.action('change_language', async (ctx) => {
    await ctx.answerCbQuery();
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🇸🇦 العربية', 'lang_ar')],
        [Markup.button.callback('🇬🇧 English', 'lang_en')],
        [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
    ]);
    
    await ctx.editMessageText('🌐 *اختر اللغة / Choose Language*', {
        parse_mode: 'Markdown',
        ...keyboard
    });
});

bot.action('lang_ar', async (ctx) => {
    await db.setLanguage(ctx.from.id, 'ar');
    await ctx.answerCbQuery('✅ تم تغيير اللغة إلى العربية');
    await ctx.editMessageText('✅ تم تغيير اللغة إلى العربية', {
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
    });
});

bot.action('lang_en', async (ctx) => {
    await db.setLanguage(ctx.from.id, 'en');
    await ctx.answerCbQuery('✅ Language changed to English');
    await ctx.editMessageText('✅ Language changed to English', {
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
    });
});

// الدعم الفني
bot.action('support', async (ctx) => {
    await ctx.answerCbQuery();
    
    const stats = await db.getUserStats(ctx.from.id);
    const text = db.getText('support', stats?.language || 'ar', {
        adminUsername: ADMIN_USERNAME,
        adminId: ADMIN_ID
    });
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.url('📨 تواصل مع الأدمن', `https://t.me/${ADMIN_USERNAME}`)],
        [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
    ]);
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...keyboard
    });
});

// طلبات الترقية المعلقة (للأدمن)
bot.action('pending_upgrades', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        await ctx.answerCbQuery('⛔ هذا الأمر للأدمن فقط!');
        return;
    }
    
    await ctx.answerCbQuery();
    
    const pending = await db.getPendingUpgrades();
    
    if (!pending || pending.length === 0) {
        await ctx.editMessageText('📭 لا توجد طلبات ترقية معلقة', {
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
        });
        return;
    }
    
    let text = '📋 *طلبات الترقية المعلقة*\n\n';
    
    for (const req of pending) {
        text += `🆔 الطلب: \`${req.id}\`\n`;
        text += `👤 المستخدم: ${req.firstName || req.username}\n`;
        text += `📊 ${req.currentLevel} → ${req.requestedLevel}\n`;
        text += `💰 ${req.usdtAmount} USDT\n`;
        text += `📅 ${new Date(req.createdAt).toLocaleString()}\n`;
        text += `━━━━━━━━━━━━━━━━━━\n`;
    }
    
    text += `\n📝 *للتأكيد:* /confirm_upgrade [الرقم] [رابط المعاملة]`;
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
    });
});

// طلبات الشراء المعلقة (للأدمن)
bot.action('pending_purchases', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        await ctx.answerCbQuery('⛔ هذا الأمر للأدمن فقط!');
        return;
    }
    
    await ctx.answerCbQuery();
    
    const pending = await db.getPendingPurchases();
    
    if (!pending || pending.length === 0) {
        await ctx.editMessageText('📭 لا توجد طلبات شراء معلقة', {
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
        });
        return;
    }
    
    let text = '💰 *طلبات الشراء المعلقة*\n\n';
    
    for (const req of pending) {
        text += `🆔 الطلب: \`${req.id}\`\n`;
        text += `👤 المستخدم: ${req.firstName || req.username}\n`;
        text += `💎 ${req.crystalAmount} CRYSTAL\n`;
        text += `💰 ${req.usdtAmount} USDT\n`;
        text += `📅 ${new Date(req.createdAt).toLocaleString()}\n`;
        text += `━━━━━━━━━━━━━━━━━━\n`;
    }
    
    text += `\n📝 *للتأكيد:* /confirm_purchase [الرقم] [رابط المعاملة]`;
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
    });
});

// إحصائيات عامة (للأدمن)
bot.action('global_stats', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        await ctx.answerCbQuery('⛔ هذا الأمر للأدمن فقط!');
        return;
    }
    
    await ctx.answerCbQuery();
    
    const stats = await db.getGlobalStats();
    
    const text = `
📊 *إحصائيات عامة* 📊

👥 *المستخدمين:* ${stats.users}
💎 *إجمالي الكريستال:* ${stats.totalCrystals}
⛏️ *إجمالي التعدين:* ${stats.totalMined}
📈 *متوسط المستوى:* ${stats.avgLevel}
⚡ *متوسط المعدل:* ${stats.avgRate}x

💰 *السيولة:*
• إجمالي السيولة: ${stats.liquidity.toFixed(2)} CRYSTAL
• تم البيع: ${stats.sold.toFixed(2)} CRYSTAL
• المتاحة: ${stats.available.toFixed(2)} CRYSTAL
• عدد الترقيات: ${stats.upgrades}

📊 *نسبة البيع:* ${((stats.sold / stats.liquidity) * 100).toFixed(2)}%
    `;
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
    });
});

// إحصائيات اليوم (للأدمن)
bot.action('today_stats', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        await ctx.answerCbQuery('⛔ هذا الأمر للأدمن فقط!');
        return;
    }
    
    await ctx.answerCbQuery();
    
    const stats = await db.getTodayStats();
    
    const text = `
📅 *إحصائيات اليوم* 📅
${new Date().toLocaleDateString('ar')}

👥 *مستخدمين جدد:* ${stats?.totalUsers || 0}
⛏️ *تم التعدين:* ${stats?.totalMined?.toFixed(2) || 0} CRYSTAL
💰 *عمليات شراء:* ${stats?.totalPurchases || 0}
⚡ *عمليات ترقية:* ${stats?.totalUpgrades || 0}
🔄 *صفقات P2P:* ${stats?.p2pTrades || 0}
    `;
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
    });
});

// بحث عن مستخدم (للأدمن)
bot.action('search_user', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        await ctx.answerCbQuery('⛔ هذا الأمر للأدمن فقط!');
        return;
    }
    
    await ctx.answerCbQuery();
    await ctx.reply('🔍 الرجاء إرسال اسم المستخدم أو المعرف للبحث:');
    ctx.session = { state: 'search_user' };
});

// معالجة البحث
bot.on('text', async (ctx) => {
    if (ctx.session?.state === 'search_user' && ctx.from.id === ADMIN_ID) {
        const query = ctx.message.text;
        const users = await db.searchUsers(query);
        
        if (users.length === 0) {
            await ctx.reply('❌ لم يتم العثور على مستخدمين');
        } else {
            let text = '🔍 *نتائج البحث:*\n\n';
            for (const user of users) {
                text += `👤 ${user.firstName || user.username || user.userId}\n`;
                text += `🆔 \`${user.userId}\`\n`;
                text += `💎 ${user.crystalBalance.toFixed(2)} CRYSTAL\n`;
                text += `📈 المستوى ${user.miningLevel}\n`;
                text += `━━━━━━━━━━━━━━━━━━\n`;
            }
            await ctx.reply(text, { parse_mode: 'Markdown' });
        }
        
        delete ctx.session.state;
    }
});

// العودة للقائمة الرئيسية
bot.action('back_to_menu', async (ctx) => {
    await ctx.answerCbQuery();
    
    const stats = await db.getUserStats(ctx.from.id);
    const referralLink = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
    
    const text = db.getText('welcome', stats.language, {
        name: ctx.from.first_name,
        balance: stats.crystalBalance,
        rate: stats.miningRate,
        level: stats.miningLevel,
        daily: stats.dailyMined,
        limit: DAILY_LIMIT
    });
    
    const keyboard = ctx.from.id === ADMIN_ID ? adminKeyboard : mainKeyboard;
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...keyboard
    });
    
    await ctx.reply(`🔗 *رابط الإحالة:*\n\`${referralLink}\``, { parse_mode: 'Markdown' });
});

// تشغيل البوت
bot.launch().then(() => {
    console.log('🚀 Bot is running...');
    console.log('👑 Admin ID:', ADMIN_ID);
    console.log('💎 Daily Limit:', DAILY_LIMIT, 'CRYSTAL');
    console.log('💰 TRON Address:', TRON_ADDRESS);
}).catch((err) => {
    console.error('Error starting bot:', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
