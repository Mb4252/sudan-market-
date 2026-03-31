require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const db = require('./database');

const bot = new Telegraf(process.env.BOT_TOKEN);
const WEBAPP_URL = process.env.WEBAPP_URL;
const CRYSTAL_PRICE = parseFloat(process.env.CRYSTAL_PRICE) || 0.01;
const MIN_PURCHASE = parseFloat(process.env.MIN_PURCHASE) || 10;

// قائمة الأزرار الرئيسية
const mainKeyboard = Markup.inlineKeyboard([
    [Markup.button.webApp('🚀 فتح تطبيق التعدين', WEBAPP_URL)],
    [Markup.button.callback('📊 لوحة المتصدرين', 'leaderboard')],
    [Markup.button.callback('💰 شراء كريستال', 'buy_crystal')],
    [Markup.button.callback('⚡ تطوير معدل التعدين', 'upgrade')],
    [Markup.button.callback('ℹ️ معلومات السيولة', 'liquidity')]
]);

// أمر /start
bot.start(async (ctx) => {
    const user = ctx.from;
    const referrerId = ctx.startPayload ? parseInt(ctx.startPayload) : null;
    
    await db.registerUser(user.id, user.username, user.first_name, referrerId);
    
    const userData = await db.getUser(user.id);
    const balance = userData?.crystal_balance || 0;
    const miningRate = userData?.mining_rate || 1;
    
    const welcomeText = `
✨ *مرحباً بك في بوت تعدين CRYSTAL!* ✨

👤 *المستخدم:* ${user.first_name}
💎 *رصيد الكريستال:* ${balance.toFixed(2)} CRYSTAL
⚡ *معدل التعدين:* ${miningRate}x
💰 *سعر العملة:* ${CRYSTAL_PRICE} USDT لكل CRYSTAL

🚀 *ابدأ التعدين الآن من خلال التطبيق المصغر!*
    `;
    
    await ctx.reply(welcomeText, { 
        parse_mode: 'Markdown',
        ...mainKeyboard 
    });
});

// لوحة المتصدرين
bot.action('leaderboard', async (ctx) => {
    await ctx.answerCbQuery();
    
    const leaders = await db.getLeaderboard(10);
    
    let leaderboardText = '🏆 *قائمة المتصدرين* 🏆\n\n';
    
    for (let i = 0; i < leaders.length; i++) {
        const leader = leaders[i];
        const name = leader.first_name || leader.username || `مستخدم ${leader.user_id}`;
        leaderboardText += `${i + 1}. ${name}\n`;
        leaderboardText += `   💎 الرصيد: ${leader.crystal_balance.toFixed(2)} CRYSTAL\n`;
        leaderboardText += `   ⛏️ تم التعدين: ${leader.total_mined.toFixed(2)} CRYSTAL\n\n`;
    }
    
    const backKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
    ]);
    
    await ctx.editMessageText(leaderboardText, {
        parse_mode: 'Markdown',
        ...backKeyboard
    });
});

// شراء العملة
bot.action('buy_crystal', async (ctx) => {
    await ctx.answerCbQuery();
    
    const liquidity = await db.getLiquidity();
    const available = liquidity.total_liquidity - liquidity.total_sold;
    
    const text = `
💰 *شراء عملة CRYSTAL* 💰

💰 *سعر العملة:* ${CRYSTAL_PRICE} USDT لكل CRYSTAL
📊 *السيولة المتاحة:* ${available.toFixed(2)} CRYSTAL
💰 *إجمالي السيولة:* ${liquidity.total_liquidity.toFixed(2)} CRYSTAL
💵 *تم البيع:* ${liquidity.total_sold.toFixed(2)} CRYSTAL

📝 *للشراء:*
1. أرسل المبلغ الذي تريد شراءه بالكريستال
2. سيتم إنشاء عنوان دفع USDT لك
3. قم بالتحويل وأرسل رابط المعاملة للتأكيد

⚠️ *الحد الأدنى للشراء:* ${MIN_PURCHASE} USDT
    `;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔙 رجوع', 'back_to_menu')],
        [Markup.button.callback('💵 شراء', 'initiate_purchase')]
    ]);
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...keyboard
    });
});

// بدء عملية الشراء
bot.action('initiate_purchase', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('📝 الرجاء إرسال عدد الكريستال الذي تريد شراءه:');
    
    // تخزين حالة المستخدم
    ctx.session = { state: 'awaiting_purchase_amount' };
});

// معالجة رسائل الشراء
bot.on('text', async (ctx) => {
    if (ctx.session?.state === 'awaiting_purchase_amount') {
        const amount = parseFloat(ctx.message.text);
        
        if (isNaN(amount) || amount <= 0) {
            await ctx.reply('❌ الرجاء إدخال رقم صحيح');
            return;
        }
        
        const order = await db.createPurchaseOrder(ctx.from.id, amount, CRYSTAL_PRICE, MIN_PURCHASE);
        
        if (!order.success) {
            await ctx.reply(`❌ ${order.error}`);
        } else {
            const text = `
✅ *تم إنشاء طلب الشراء!*

💎 *الكمية:* ${order.crystal_amount.toFixed(2)} CRYSTAL
💰 *المبلغ:* ${order.usdt_amount.toFixed(2)} USDT
🆔 *رقم العملية:* ${order.transaction_id}

📤 *ارسل المبلغ إلى العنوان التالي:*
\`${order.payment_address}\`

⚠️ *بعد التحويل، أرسل:* 
/confirm ${order.transaction_id} [رابط المعاملة]
            `;
            
            await ctx.reply(text, { parse_mode: 'Markdown' });
        }
        
        delete ctx.session.state;
    }
});

// تأكيد الدفع
bot.command('confirm', async (ctx) => {
    const args = ctx.message.text.split(' ');
    
    if (args.length !== 3) {
        await ctx.reply('❌ الصيغة: /confirm [رقم العملية] [رابط المعاملة]');
        return;
    }
    
    const transactionId = parseInt(args[1]);
    const transactionHash = args[2];
    
    const result = await db.confirmPayment(transactionId, transactionHash);
    
    if (result.success) {
        await ctx.reply(`✅ ${result.message}`);
    } else {
        await ctx.reply(`❌ ${result.message}`);
    }
});

// ترقية التعدين
bot.action('upgrade', async (ctx) => {
    await ctx.answerCbQuery();
    
    const user = await db.getUser(ctx.from.id);
    const currentRate = user?.mining_rate || 1;
    const upgradeCost = 100 * (user?.mining_level || 1);
    
    const text = `
⚡ *تطوير معدل التعدين* ⚡

📊 *المعدل الحالي:* ${currentRate}x
💰 *تكلفة الترقية:* ${upgradeCost} CRYSTAL
📈 *المعدل بعد الترقية:* ${currentRate + 0.5}x

*فوائد الترقية:*
• زيادة سرعة التعدين
• زيادة المكافآت العشوائية
• وصول أسرع للمتصدرين
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
    
    const result = await db.upgradeMining(ctx.from.id);
    
    if (result.success) {
        await ctx.editMessageText(`✅ ${result.message}\n\n🔙 اضغط رجوع للعودة`);
    } else {
        await ctx.editMessageText(`❌ ${result.message}\n\n🔙 اضغط رجوع للعودة`);
    }
});

// معلومات السيولة
bot.action('liquidity', async (ctx) => {
    await ctx.answerCbQuery();
    
    const liquidity = await db.getLiquidity();
    const available = liquidity.total_liquidity - liquidity.total_sold;
    const soldPercentage = (liquidity.total_sold / liquidity.total_liquidity * 100).toFixed(2);
    
    const text = `
💰 *معلومات السيولة* 💰

💎 *إجمالي السيولة:* ${liquidity.total_liquidity.toFixed(2)} CRYSTAL
📊 *السيولة المتاحة:* ${available.toFixed(2)} CRYSTAL
💵 *تم البيع:* ${liquidity.total_sold.toFixed(2)} CRYSTAL
📈 *نسبة البيع:* ${soldPercentage}%

💎 *سعر العملة:* ${CRYSTAL_PRICE} USDT لكل CRYSTAL

✅ *السيولة كافية وآمنة!*
    `;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
    ]);
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...keyboard
    });
});

// العودة للقائمة الرئيسية
bot.action('back_to_menu', async (ctx) => {
    await ctx.answerCbQuery();
    
    const user = await db.getUser(ctx.from.id);
    const balance = user?.crystal_balance || 0;
    const miningRate = user?.mining_rate || 1;
    
    const text = `
✨ *قائمة CRYSTAL الرئيسية* ✨

👤 *المستخدم:* ${ctx.from.first_name}
💎 *رصيد الكريستال:* ${balance.toFixed(2)} CRYSTAL
⚡ *معدل التعدين:* ${miningRate}x
💰 *سعر العملة:* ${CRYSTAL_PRICE} USDT لكل CRYSTAL
    `;
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...mainKeyboard
    });
});

// تشغيل البوت
bot.launch().then(() => {
    console.log('🚀 Bot is running...');
}).catch((err) => {
    console.error('Error starting bot:', err);
});

// إيقاف التشغيل بشكل نظيف
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
