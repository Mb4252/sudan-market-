require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const db = require('./database');
const express = require('express');
const path = require('path');

// ========== إعداد خادم الويب ==========
const app = express();
const PORT = process.env.PORT || 10000;

// ✅ مهم جداً: تمكين تحليل JSON والبيانات القادمة
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تقديم الملفات الثابتة من مجلد mining-app
app.use(express.static(path.join(__dirname, 'mining-app')));

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'mining-app', 'index.html'));
});

// Health check - مهم لـ Render
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========== API Routes ==========

// API المستخدم - GET
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
        console.error('❌ User API error:', error);
        res.status(500).json({ error: error.message });
    }
});

// API التعدين - POST
app.post('/api/mine', async (req, res) => {
    try {
        console.log('📥 Mine request:', req.body);
        
        const { user_id } = req.body;
        
        if (!user_id) {
            return res.status(400).json({ success: false, message: 'user_id مطلوب' });
        }
        
        const result = await db.mine(parseInt(user_id));
        res.json(result);
    } catch (error) {
        console.error('❌ Mine error:', error);
        res.json({ success: false, message: error.message });
    }
});

// API المتصدرين - GET
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
        console.error('❌ Leaderboard error:', error);
        res.json([]);
    }
});

// API السيولة - GET
app.get('/api/liquidity', async (req, res) => {
    try {
        const liquidity = await db.getLiquidity();
        res.json({
            total_liquidity: liquidity?.totalLiquidity || 100000,
            total_sold: liquidity?.totalSold || 0,
            available: (liquidity?.totalLiquidity || 100000) - (liquidity?.totalSold || 0)
        });
    } catch (error) {
        console.error('❌ Liquidity error:', error);
        res.json({ total_liquidity: 100000, total_sold: 0, available: 100000 });
    }
});

// API الشراء - POST
app.post('/api/purchase', async (req, res) => {
    try {
        console.log('📥 Purchase request:', req.body);
        
        const { user_id, amount } = req.body;
        
        if (!user_id || !amount) {
            return res.status(400).json({ success: false, message: 'user_id و amount مطلوبين' });
        }
        
        const result = await db.requestPurchase(parseInt(user_id), parseFloat(amount));
        res.json(result);
    } catch (error) {
        console.error('❌ Purchase error:', error);
        res.json({ success: false, message: error.message });
    }
});

// API الترقية - POST
app.post('/api/upgrade', async (req, res) => {
    try {
        console.log('📥 Upgrade request:', req.body);
        
        const { user_id } = req.body;
        
        if (!user_id) {
            return res.status(400).json({ success: false, message: 'user_id مطلوب' });
        }
        
        const result = await db.requestUpgrade(parseInt(user_id), 5);
        res.json(result);
    } catch (error) {
        console.error('❌ Upgrade error:', error);
        res.json({ success: false, message: error.message });
    }
});

// API التسجيل - POST
app.post('/api/register', async (req, res) => {
    try {
        console.log('📥 Register request:', req.body);
        
        const { user_id, username, first_name } = req.body;
        
        if (!user_id) {
            return res.status(400).json({ success: false, message: 'user_id مطلوب' });
        }
        
        await db.registerUser(parseInt(user_id), username, first_name);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Register error:', error);
        res.json({ success: true });
    }
});

// API إحصائيات اليوم - GET
app.get('/api/user/daily/:userId', async (req, res) => {
    try {
        const stats = await db.getUserStats(parseInt(req.params.userId));
        res.json({
            daily_mined: stats?.dailyMined || 0,
            daily_limit: 4,
            remaining: 4 - (stats?.dailyMined || 0)
        });
    } catch (error) {
        console.error('❌ Daily stats error:', error);
        res.json({ daily_mined: 0, daily_limit: 4, remaining: 4 });
    }
});

// API اختبار - POST
app.post('/api/test', (req, res) => {
    console.log('📥 Test endpoint:', req.body);
    res.json({ success: true, received: req.body });
});

// تشغيل خادم الويب
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Web server running on port ${PORT}`);
    console.log(`📱 WebApp URL: ${process.env.WEBAPP_URL || `http://localhost:${PORT}`}`);
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
const UPGRADE_USDT_PRICE = parseFloat(process.env.UPGRADE_USDT_PRICE) || 5;
const CRYSTAL_PRICE = parseFloat(process.env.CRYSTAL_PRICE) || 0.01;
const DAILY_LIMIT = parseInt(process.env.DAILY_LIMIT) || 4;

// قائمة الأزرار الرئيسية
const mainKeyboard = Markup.inlineKeyboard([
    [Markup.button.webApp('🚀 فتح تطبيق التعدين', WEBAPP_URL)],
    [Markup.button.callback('⛏️ تعدين', 'mine_action')],
    [Markup.button.callback('🏆 المتصدرين', 'leaderboard')],
    [Markup.button.callback('💰 شراء كريستال', 'buy_menu')],
    [Markup.button.callback('⚡ ترقية بـ USDT', 'upgrade_menu')],
    [Markup.button.callback('👥 نظام الإحالة', 'referral_system')],
    [Markup.button.callback('📈 إحصائياتي', 'my_stats')],
    [Markup.button.callback('ℹ️ معلومات', 'info_menu')]
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
    
    await db.registerUser(user.id, user.username, user.first_name, referrerId);
    
    const stats = await db.getUserStats(user.id);
    const referralLink = `https://t.me/${ctx.botInfo.username}?start=${user.id}`;
    
    const welcomeText = `
✨ *مرحباً بك في بوت تعدين CRYSTAL!* ✨

👤 *المستخدم:* ${user.first_name}
💎 *الرصيد:* ${stats.crystalBalance.toFixed(2)} CRYSTAL
⚡ *معدل التعدين:* ${stats.miningRate}x
📈 *المستوى:* ${stats.miningLevel}
📊 *تعدين اليوم:* ${stats.dailyMined}/${DAILY_LIMIT}

💰 *سعر العملة:* ${CRYSTAL_PRICE} USDT
⚡ *سعر الترقية:* ${UPGRADE_USDT_PRICE} USDT

🎁 *مكافآت الإحالة:* ادعُ 5 أصدقاء واحصل على 10 كريستال!
🔗 *رابط الإحالة الخاص بك:*
\`${referralLink}\`

🚀 *ابدأ التعدين الآن!*
    `;
    
    await ctx.reply(welcomeText, { 
        parse_mode: 'Markdown',
        ...mainKeyboard 
    });
});

// تعدين
bot.action('mine_action', async (ctx) => {
    await ctx.answerCbQuery();
    
    const result = await db.mine(ctx.from.id);
    
    if (result.success) {
        const text = `
🎉 *تم التعدين بنجاح!*

⛏️ *حصلت على:* ${result.reward} CRYSTAL
💎 *الرصيد الحالي:* ${(await db.getUser(ctx.from.id)).crystalBalance.toFixed(2)}
📊 *المتبقي اليوم:* ${result.dailyRemaining}/${DAILY_LIMIT}

✅ استمر في التعدين كل ساعة!
        `;
        await ctx.editMessageText(text, {
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

⚠️ *سيتم إنشاء طلب شراء وستحصل على عنوان الدفع*
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
        await ctx.reply(result.message, { parse_mode: 'Markdown' });
        
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

// قائمة الترقية
bot.action('upgrade_menu', async (ctx) => {
    await ctx.answerCbQuery();
    
    const stats = await db.getUserStats(ctx.from.id);
    const nextRate = (stats.miningRate + 0.5).toFixed(1);
    
    const text = `
⚡ *ترقية معدل التعدين* ⚡

📊 *مستواك:* ${stats.miningLevel}
⚡ *المعدل الحالي:* ${stats.miningRate}x
📈 *المعدل بعد الترقية:* ${nextRate}x
💰 *السعر:* ${UPGRADE_USDT_PRICE} USDT

📝 *للترقية:*
أرسل الأمر:
\`/upgrade\`

⚠️ *سيتم إنشاء طلب ترقية وسيتم مراجعته من قبل الأدمن*
    `;
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
    });
});

// أمر طلب ترقية
bot.command('upgrade', async (ctx) => {
    const result = await db.requestUpgrade(ctx.from.id, UPGRADE_USDT_PRICE);
    
    if (result.success) {
        await ctx.reply(result.message, { parse_mode: 'Markdown' });
        
        await bot.telegram.sendMessage(ADMIN_ID, `
🔔 *طلب ترقية جديد!*

👤 المستخدم: ${ctx.from.first_name} (@${ctx.from.username || 'لا يوجد'})
🆔 المعرف: ${ctx.from.id}
📊 المستوى الحالي: ${result.current_level}
📈 المستوى المطلوب: ${result.requested_level}
💰 المبلغ: ${result.usdt_amount} USDT
📋 رقم الطلب: \`${result.request_id}\`

للتأكيد:
\`/confirm_upgrade ${result.request_id} [رابط المعاملة]\`
        `, { parse_mode: 'Markdown' });
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
        
        await bot.telegram.sendMessage(result.user_id, result.message, { parse_mode: 'Markdown' });
    } else {
        await ctx.reply(`❌ ${result.message}`);
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
• ادعُ 5 أصدقاء واحصل على 10 كريستال مجاناً!
• كل صديق يدخل عن طريقك يحصل على مكافأة ترحيبية

📊 *إحصائياتك:*
• عدد الإحالات: ${stats.referralsCount}/5
• المكافأة: ${stats.referralsCount >= 5 ? '✅ تم الحصول على 10 كريستال' : '❌ لم تتحقق بعد'}

🔗 *رابط الإحالة الخاص بك:*
\`${referralLink}\`

💡 *انشر الرابط لأصدقائك واكسب المكافآت!*
    `;
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
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
⚡ *معدل التعدين:* ${stats.miningRate}x
📈 *المستوى:* ${stats.miningLevel}
⛏️ *إجمالي التعدين:* ${stats.totalMined.toFixed(2)} CRYSTAL
📅 *تعدين اليوم:* ${stats.dailyMined}/${DAILY_LIMIT}
⏰ *المتبقي اليوم:* ${stats.dailyRemaining} كريستال

👥 *الإحالات:* ${stats.referralsCount}/5
🎁 *مكافأة الإحالات:* ${stats.referralsCount >= 5 ? '✅ تم الحصول عليها' : '❌ لم تتحقق بعد'}

📅 *تاريخ التسجيل:* ${new Date(stats.createdAt).toLocaleDateString('ar')}
    `;
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
    });
});

// معلومات عامة
bot.action('info_menu', async (ctx) => {
    await ctx.answerCbQuery();
    
    const liquidity = await db.getLiquidity();
    const available = liquidity.totalLiquidity - liquidity.totalSold;
    
    const text = `
ℹ️ *معلومات البوت* ℹ️

💰 *سعر العملة:* ${CRYSTAL_PRICE} USDT
⚡ *سعر الترقية:* ${UPGRADE_USDT_PRICE} USDT
📊 *الحد اليومي:* ${DAILY_LIMIT} كريستال
⏰ *وقت التعدين:* كل ساعة

💎 *معلومات السيولة:*
• إجمالي السيولة: ${liquidity.totalLiquidity.toFixed(2)} CRYSTAL
• المتاحة: ${available.toFixed(2)} CRYSTAL
• تم البيع: ${liquidity.totalSold.toFixed(2)} CRYSTAL
• عدد الترقيات: ${liquidity.totalUpgrades || 0}

🎁 *مكافآت الإحالة:*
• ادعُ 5 أصدقاء = 10 كريستال مجاناً

📝 *الأوامر المتاحة:*
/start - القائمة الرئيسية
/buy [الكمية] - شراء كريستال
/upgrade - طلب ترقية
/mine - تعدين مباشر
/stats - إحصائياتي
    `;
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_menu')]])
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

// أمر تعدين مباشر
bot.command('mine', async (ctx) => {
    const result = await db.mine(ctx.from.id);
    
    if (result.success) {
        const stats = await db.getUserStats(ctx.from.id);
        await ctx.reply(`
🎉 *تم التعدين بنجاح!*

⛏️ *حصلت على:* ${result.reward} CRYSTAL
💎 *الرصيد الحالي:* ${stats.crystalBalance.toFixed(2)}
📊 *المتبقي اليوم:* ${result.dailyRemaining}/${DAILY_LIMIT}
        `, { parse_mode: 'Markdown' });
    } else {
        await ctx.reply(result.message, { parse_mode: 'Markdown' });
    }
});

// أمر إحصائيات
bot.command('stats', async (ctx) => {
    const stats = await db.getUserStats(ctx.from.id);
    
    const text = `
📊 *إحصائياتك* 📊

💎 *الرصيد:* ${stats.crystalBalance.toFixed(2)}
⚡ *معدل التعدين:* ${stats.miningRate}x
📈 *المستوى:* ${stats.miningLevel}
⛏️ *إجمالي التعدين:* ${stats.totalMined.toFixed(2)}
📅 *تعدين اليوم:* ${stats.dailyMined}/${DAILY_LIMIT}
👥 *الإحالات:* ${stats.referralsCount}
    `;
    
    await ctx.reply(text, { parse_mode: 'Markdown' });
});

// العودة للقائمة الرئيسية
bot.action('back_to_menu', async (ctx) => {
    await ctx.answerCbQuery();
    
    const stats = await db.getUserStats(ctx.from.id);
    const referralLink = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
    
    const text = `
✨ *قائمة CRYSTAL الرئيسية* ✨

👤 *المستخدم:* ${ctx.from.first_name}
💎 *الرصيد:* ${stats.crystalBalance.toFixed(2)} CRYSTAL
⚡ *معدل التعدين:* ${stats.miningRate}x
📊 *تعدين اليوم:* ${stats.dailyMined}/${DAILY_LIMIT}

🎁 *رابط الإحالة الخاص بك:*
\`${referralLink}\`
    `;
    
    const keyboard = ctx.from.id === ADMIN_ID ? adminKeyboard : mainKeyboard;
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...keyboard
    });
});

// تشغيل البوت
bot.launch().then(() => {
    console.log('🚀 Bot is running...');
    console.log('👑 Admin ID:', ADMIN_ID);
    console.log('💎 Crystal Price:', CRYSTAL_PRICE, 'USDT');
    console.log('⚡ Upgrade Price:', UPGRADE_USDT_PRICE, 'USDT');
}).catch((err) => {
    console.error('Error starting bot:', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
