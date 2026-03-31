require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const db = require('./database');

const bot = new Telegraf(process.env.BOT_TOKEN);
const WEBAPP_URL = process.env.WEBAPP_URL;
const ADMIN_ID = parseInt(process.env.ADMIN_ID) || 6701743450;
const CRYSTAL_PRICE = parseFloat(process.env.CRYSTAL_PRICE) || 0.01;
const UPGRADE_USDT_PRICE = 5; // سعر الترقية بـ USDT

// قائمة الأزرار الرئيسية
const mainKeyboard = Markup.inlineKeyboard([
    [Markup.button.webApp('🚀 فتح تطبيق التعدين', WEBAPP_URL)],
    [Markup.button.callback('📊 لوحة المتصدرين', 'leaderboard')],
    [Markup.button.callback('💰 شراء كريستال', 'buy_crystal')],
    [Markup.button.callback('⚡ ترقية بـ USDT', 'upgrade_usdt')],
    [Markup.button.callback('👥 نظام الإحالة', 'referral_system')],
    [Markup.button.callback('📈 إحصائياتي', 'my_stats')],
    [Markup.button.callback('ℹ️ معلومات السيولة', 'liquidity')]
]);

// قائمة أدمن
const adminKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📋 طلبات الترقية', 'pending_upgrades')],
    [Markup.button.callback('📊 إحصائيات عامة', 'global_stats')],
    [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
]);

// أمر /start
bot.start(async (ctx) => {
    const user = ctx.from;
    const referrerId = ctx.startPayload ? parseInt(ctx.startPayload) : null;
    
    await db.registerUser(user.id, user.username, user.first_name, referrerId);
    
    const userData = await db.getUser(user.id);
    const balance = userData?.crystal_balance || 0;
    const miningRate = userData?.mining_rate || 1;
    const miningLevel = userData?.mining_level || 1;
    const dailyMined = userData?.daily_mined || 0;
    
    const welcomeText = `
✨ *مرحباً بك في بوت تعدين CRYSTAL!* ✨

👤 *المستخدم:* ${user.first_name}
💎 *رصيد الكريستال:* ${balance.toFixed(2)} CRYSTAL
⚡ *معدل التعدين:* ${miningRate}x
📈 *مستوى التعدين:* ${miningLevel}
📊 *تم التعدين اليوم:* ${dailyMined}/4 CRYSTAL

💰 *سعر العملة:* ${CRYSTAL_PRICE} USDT لكل CRYSTAL

🚀 *ابدأ التعدين الآن من خلال التطبيق المصغر!*

🎁 *مكافآت الإحالة:* 
• ادعُ 5 أصدقاء واحصل على 10 كريستال مجاناً!
• رابط الإحالة الخاص بك: \`https://t.me/${ctx.botInfo.username}?start=${user.id}\`
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
        leaderboardText += `   ⛏️ تم التعدين: ${leader.total_mined.toFixed(2)} CRYSTAL\n`;
        leaderboardText += `   📈 المستوى: ${leader.mining_level}\n`;
        if (leader.referral_count > 0) {
            leaderboardText += `   👥 إحالات: ${leader.referral_count}\n`;
        }
        leaderboardText += `\n`;
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

⚠️ *الحد الأدنى للشراء:* 10 USDT
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

// شراء الترقية بـ USDT
bot.action('upgrade_usdt', async (ctx) => {
    await ctx.answerCbQuery();
    
    const user = await db.getUser(ctx.from.id);
    const currentLevel = user?.mining_level || 1;
    const nextRate = (currentLevel + 0.5).toFixed(1);
    
    const text = `
⚡ *ترقية معدل التعدين بـ USDT* ⚡

📊 *مستواك الحالي:* ${currentLevel}
⚡ *المعدل الحالي:* ${user?.mining_rate || 1}x
📈 *المعدل بعد الترقية:* ${nextRate}x
💰 *سعر الترقية:* ${UPGRADE_USDT_PRICE} USDT

✨ *فوائد الترقية:*
• زيادة فرصة الحصول على مكافآت أعلى
• وصول أسرع للمتصدرين
• زيادة الحد الأقصى اليومي المحتمل

📝 *طريقة الشراء:*
1. اضغط على "طلب ترقية"
2. سيتم إنشاء طلب وستحصل على عنوان الدفع
3. أرسل ${UPGRADE_USDT_PRICE} USDT إلى العنوان
4. أرسل رابط المعاملة للتأكيد
5. سيتم مراجعة طلبك من قبل الأدمن
    `;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📝 طلب ترقية', 'request_upgrade')],
        [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
    ]);
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...keyboard
    });
});

// طلب ترقية
bot.action('request_upgrade', async (ctx) => {
    await ctx.answerCbQuery();
    
    const result = await db.requestUpgrade(ctx.from.id, UPGRADE_USDT_PRICE);
    
    if (result.success) {
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
        ]);
        
        await ctx.editMessageText(result.message, {
            parse_mode: 'Markdown',
            ...keyboard
        });
        
        // إشعار الأدمن
        await bot.telegram.sendMessage(ADMIN_ID, `
🔔 *طلب ترقية جديد!*

👤 *المستخدم:* ${ctx.from.first_name} (@${ctx.from.username || 'لا يوجد'})
🆔 *المعرف:* ${ctx.from.id}
📋 *رقم الطلب:* ${result.request_id}
📊 *المستوى الحالي:* ${result.current_level}
📈 *المستوى المطلوب:* ${result.requested_level}
💰 *المبلغ:* ${result.usdt_amount} USDT
📤 *عنوان الدفع:* \`TCZ2NGDSvxznADHTvvkedJTcbbGbD5RhfR\`

استخدم الأزرار أدناه للموافقة أو الرفض:
        `, Markup.inlineKeyboard([
            [Markup.button.callback('✅ موافقة', `approve_upgrade_${result.request_id}`)],
            [Markup.button.callback('❌ رفض', `reject_upgrade_${result.request_id}`)]
        ]));
    } else {
        await ctx.editMessageText(`❌ ${result.message}`, {
            parse_mode: 'Markdown'
        });
    }
});

// موافقة الأدمن على الترقية
bot.action(/approve_upgrade_(\d+)/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        await ctx.answerCbQuery('⛔ هذا الأمر للأدمن فقط!');
        return;
    }
    
    const requestId = parseInt(ctx.match[1]);
    
    await ctx.answerCbQuery();
    
    // طلب رابط المعاملة
    ctx.session = { state: 'awaiting_transaction_hash', requestId };
    await ctx.reply(`📝 الرجاء إرسال رابط المعاملة (Transaction Hash) للطلب #${requestId}:`);
});

// رفض طلب الترقية
bot.action(/reject_upgrade_(\d+)/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        await ctx.answerCbQuery('⛔ هذا الأمر للأدمن فقط!');
        return;
    }
    
    const requestId = parseInt(ctx.match[1]);
    const result = await db.rejectUpgrade(requestId, ctx.from.id);
    
    await ctx.answerCbQuery();
    await ctx.reply(result.message);
    
    // إشعار المستخدم
    const request = await db.getPendingUpgrades();
    // يمكن إضافة إشعار للمستخدم هنا
});

// نظام الإحالة
bot.action('referral_system', async (ctx) => {
    await ctx.answerCbQuery();
    
    const user = await db.getUserStats(ctx.from.id);
    const referralLink = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
    
    const text = `
👥 *نظام الإحالة* 👥

🎁 *مكافآت الإحالة:*
• ادعُ 5 أصدقاء واحصل على 10 كريستال مجاناً!
• كل صديق يدخل عن طريقك يحصل على مكافأة ترحيبية

📊 *إحصائياتك:*
• عدد الإحالات: ${user?.referral_count || 0}/5
• المكافأة المستحقة: ${user?.referral_count >= 5 ? '✅ تم الحصول على 10 كريستال' : '❌ لم يتم الوصول بعد'}

🔗 *رابط الإحالة الخاص بك:*
\`${referralLink}\`

💡 *نصيحة:* شارك الرابط مع أصدقائك لتحصل على المكافأة!
    `;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
    ]);
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...keyboard
    });
});

// إحصائياتي
bot.action('my_stats', async (ctx) => {
    await ctx.answerCbQuery();
    
    const user = await db.getUserStats(ctx.from.id);
    if (!user) {
        await ctx.reply('❌ لم يتم العثور على بياناتك');
        return;
    }
    
    const today = new Date().toISOString().split('T')[0];
    const isNewDay = user.last_mining_date !== today;
    const dailyRemaining = isNewDay ? 4 : (4 - (user.daily_mined || 0));
    
    const text = `
📊 *إحصائياتك الشخصية* 📊

👤 *الاسم:* ${user.first_name}
💎 *رصيد الكريستال:* ${user.crystal_balance.toFixed(2)}
⚡ *معدل التعدين:* ${user.mining_rate}x
📈 *مستوى التعدين:* ${user.mining_level}
⛏️ *إجمالي ما تم تعدينه:* ${user.total_mined.toFixed(2)}
📅 *تم التعدين اليوم:* ${user.daily_mined || 0}/4 CRYSTAL
⏰ *المتبقي اليوم:* ${dailyRemaining} كريستال

👥 *نظام الإحالة:*
• عدد الإحالات: ${user.referral_count || 0}
• مكافأة 5 إحالات: ${user.referral_count >= 5 ? '✅ تم الحصول عليها' : '❌ لم تتحقق بعد'}

🎯 *نصيحة:* قم بالتعدين كل ساعة للحصول على أقصى استفادة!
    `;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
    ]);
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...keyboard
    });
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
⚡ *سعر الترقية:* ${UPGRADE_USDT_PRICE} USDT

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

// طلبات الترقية المعلقة (للأدمن)
bot.action('pending_upgrades', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        await ctx.answerCbQuery('⛔ هذا الأمر للأدمن فقط!');
        return;
    }
    
    await ctx.answerCbQuery();
    
    const pending = await db.getPendingUpgrades();
    
    if (pending.length === 0) {
        await ctx.editMessageText('📭 لا توجد طلبات ترقية معلقة حالياً', {
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
            ])
        });
        return;
    }
    
    let text = '📋 *طلبات الترقية المعلقة*\n\n';
    
    for (const req of pending) {
        text += `🆔 *رقم الطلب:* ${req.id}\n`;
        text += `👤 *المستخدم:* ${req.first_name || req.username}\n`;
        text += `📊 *المستوى الحالي:* ${req.current_level}\n`;
        text += `📈 *المستوى المطلوب:* ${req.requested_level}\n`;
        text += `💰 *المبلغ:* ${req.usdt_amount} USDT\n`;
        text += `📅 *التاريخ:* ${new Date(req.created_at).toLocaleString()}\n`;
        text += `───────────────────\n`;
    }
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔙 رجوع', 'back_to_menu')]
    ]);
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...keyboard
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
    const liquidity = await db.getLiquidity();
    
    const text = `
📊 *إحصائيات عامة للبوت* 📊

👥 *إجمالي المستخدمين:* ${stats.total_users || 0}
💎 *إجمالي الكريستال المتداول:* ${(stats.total_crystals || 0).toFixed(2)}
⛏️ *إجمالي ما تم تعدينه:* ${(stats.total_mined || 0).toFixed(2)}
📈 *متوسط مستوى التعدين:* ${(stats.avg_level || 1).toFixed(2)}

💰 *معلومات السيولة:*
• إجمالي السيولة: ${liquidity.total_liquidity.toFixed(2)} CRYSTAL
• تم البيع: ${liquidity.total_sold.toFixed(2)} CRYSTAL
• السيولة المتاحة: ${(liquidity.total_liquidity - liquidity.total_sold).toFixed(2)} CRYSTAL
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
    const dailyMined = user?.daily_mined || 0;
    
    const text = `
✨ *قائمة CRYSTAL الرئيسية* ✨

👤 *المستخدم:* ${ctx.from.first_name}
💎 *رصيد الكريستال:* ${balance.toFixed(2)} CRYSTAL
⚡ *معدل التعدين:* ${miningRate}x
📊 *تم التعدين اليوم:* ${dailyMined}/4 CRYSTAL
💰 *سعر العملة:* ${CRYSTAL_PRICE} USDT لكل CRYSTAL

🎁 *مكافآت الإحالة:* ادعُ 5 أصدقاء واحصل على 10 كريستال!
    `;
    
    const keyboard = ctx.from.id === ADMIN_ID ? adminKeyboard : mainKeyboard;
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...keyboard
    });
});

// معالجة تأكيد الدفع من الأدمن
bot.on('text', async (ctx) => {
    if (ctx.session?.state === 'awaiting_transaction_hash' && ctx.from.id === ADMIN_ID) {
        const transactionHash = ctx.message.text;
        const requestId = ctx.session.requestId;
        
        const result = await db.confirmUpgrade(requestId, transactionHash, ctx.from.id);
        
        if (result.success) {
            await ctx.reply(result.message);
            
            // الحصول على معلومات الطلب لإشعار المستخدم
            const request = await db.getPendingUpgrades();
            // يمكن إضافة إشعار للمستخدم هنا
        } else {
            await ctx.reply(`❌ ${result.message}`);
        }
        
        delete ctx.session.state;
    }
});

// تشغيل البوت
bot.launch().then(() => {
    console.log('🚀 Bot is running...');
    console.log('👑 Admin ID:', ADMIN_ID);
}).catch((err) => {
    console.error('Error starting bot:', err);
});

// إيقاف التشغيل بشكل نظيف
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
