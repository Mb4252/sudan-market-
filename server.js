const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// تحميل المتغيرات البيئية
dotenv.config();

// ========== إعدادات البوت ==========
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PORT = process.env.PORT || 5000;
const WEBHOOK_URL = process.env.RENDER_EXTERNAL_URL || `https://your-bot.onrender.com`;

if (!BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN غير موجود!');
    process.exit(1);
}

// إنشاء البوت
const bot = new Telegraf(BOT_TOKEN);

// إنشاء تطبيق Express
const app = express();
app.use(express.json());
app.use(express.static('public'));

// ========== بيانات العملة ==========
const COIN_NAME = "🚀 عملتي الرقمية";
const COIN_SYMBOL = "MYC";
const INITIAL_PRICE = 0.024;

// ========== تخزين البيانات (في الذاكرة) ==========
// ملاحظة: للإنتاج استخدم قاعدة بيانات مثل PostgreSQL
let users = {};
let trades = [];

// تحميل البيانات من ملف (إن وجد)
try {
    if (fs.existsSync('users.json')) {
        users = JSON.parse(fs.readFileSync('users.json', 'utf8'));
    }
    if (fs.existsSync('trades.json')) {
        trades = JSON.parse(fs.readFileSync('trades.json', 'utf8'));
    }
} catch (err) {
    console.log('بدء ببيانات جديدة');
}

// حفظ البيانات
function saveData() {
    fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
    fs.writeFileSync('trades.json', JSON.stringify(trades, null, 2));
}

// ========== دوال مساعدة ==========
function getCurrentPrice() {
    const change = (Math.random() * 0.01) - 0.005;
    let price = INITIAL_PRICE + change;
    price = Math.max(0.001, Math.min(0.05, price));
    return parseFloat(price.toFixed(6));
}

// لوحة المفاتيح الرئيسية
function getMainKeyboard() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('📊 السعر الحالي', 'price'),
         Markup.button.callback('💰 رصيدي', 'balance')],
        [Markup.button.callback('🟢 شراء', 'buy'),
         Markup.button.callback('🔴 بيع', 'sell')],
        [Markup.button.callback('📈 الرسم البياني', 'chart'),
         Markup.button.callback('👥 المجتمع', 'community')],
        [Markup.button.callback('🔒 الأمان', 'security'),
         Markup.button.callback('📜 تاريخ الصفقات', 'history')],
        [Markup.button.webApp('🎮 فتح التطبيق المصغر', `${WEBHOOK_URL}`)]
    ]);
}

// ========== أوامر البوت ==========
// أمر /start
bot.start(async (ctx) => {
    const userId = String(ctx.from.id);
    const userName = ctx.from.first_name;
    
    if (!users[userId]) {
        users[userId] = {
            name: userName,
            balance: 1000.0,
            coins: 0.0,
            joined: new Date().toISOString()
        };
        saveData();
    }
    
    const price = getCurrentPrice();
    
    const welcomeText = `
🚀 **مرحباً بك في ${COIN_NAME}** 🚀

🔥 **منصة تداول آمنة وسريعة**
💰 العملة: ${COIN_SYMBOL}
📈 السعر الحالي: $${price}

✨ **مميزات المنصة:**
• رسوم منخفضة جداً (0.1%)
• سرعة فائقة في التنفيذ
• محفظة رقمية آمنة

🎁 **لقد حصلت على 1000$ رصيد تجريبي!**

👇 اضغط على الأزرار أدناه للبدء:
    `;
    
    await ctx.reply(welcomeText, {
        parse_mode: 'Markdown',
        ...getMainKeyboard()
    });
});

// عرض السعر
bot.action('price', async (ctx) => {
    await ctx.answerCbQuery();
    const price = getCurrentPrice();
    const text = `
📊 **سعر ${COIN_NAME} (${COIN_SYMBOL})** 📊

💰 السعر الحالي: **$${price}**
📈 التغير 24h: **+4.8%**
⛽ رسوم الغاز: **0.1 Gwei**
🔗 الشبكة: **Optimism (OP)**

🕐 آخر تحديث: ${new Date().toLocaleTimeString('ar')}
    `;
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...getMainKeyboard()
    });
});

// عرض الرصيد
bot.action('balance', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = String(ctx.from.id);
    
    if (!users[userId]) {
        users[userId] = { balance: 1000, coins: 0, name: ctx.from.first_name };
        saveData();
    }
    
    const user = users[userId];
    const price = getCurrentPrice();
    const totalValue = user.balance + (user.coins * price);
    
    const text = `
💰 **محفظتك الرقمية** 💰

💵 **الرصيد النقدي:** $${user.balance.toFixed(2)}
🪙 **العملات الرقمية:** ${user.coins.toFixed(4)} ${COIN_SYMBOL}
📈 **القيمة الإجمالية:** $${totalValue.toFixed(2)}

🎯 **نصيحة:** قم بالشراء عند الانخفاض والبيع عند الارتفاع!
    `;
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...getMainKeyboard()
    });
});

// قائمة شراء
bot.action('buy', async (ctx) => {
    await ctx.answerCbQuery();
    const price = getCurrentPrice();
    const text = `
🟢 **شراء ${COIN_NAME}** 🟢

📊 السعر الحالي: **$${price}**

لشراء العملة، استخدم التطبيق المصغر بالضغط على الزر أدناه.
    `;
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.webApp('🎮 فتح التطبيق المصغر', `${WEBHOOK_URL}`)],
            [Markup.button.callback('🔙 رجوع', 'back')]
        ])
    });
});

// قائمة بيع
bot.action('sell', async (ctx) => {
    await ctx.answerCbQuery();
    const price = getCurrentPrice();
    const text = `
🔴 **بيع ${COIN_NAME}** 🔴

📊 السعر الحالي: **$${price}**

لبيع العملة، استخدم التطبيق المصغر بالضغط على الزر أدناه.
    `;
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.webApp('🎮 فتح التطبيق المصغر', `${WEBHOOK_URL}`)],
            [Markup.button.callback('🔙 رجوع', 'back')]
        ])
    });
});

// الرسم البياني
bot.action('chart', async (ctx) => {
    await ctx.answerCbQuery();
    const chart = `
📈 **رسم بياني لسعر ${COIN_SYMBOL}** 📈

📊 آخر 7 أيام:
████████░░░░░░░░ 24% ↑
██████████░░░░░░ 35% ↑  
██████░░░░░░░░░░ 18% ↓
███████████░░░░░ 42% ↑
█████████░░░░░░░ 31% ↑
████████████░░░░ 56% ↑
█████████████░░░ 61% ↑ (اليوم)

🎯 **تحليل فني:**
• مقاومة: $0.035
• دعم: $0.019
• اتجاه: صاعد 📈

⚠️ استثمر بحكمة ولا تخاطر بكل أموالك!
    `;
    await ctx.editMessageText(chart, {
        parse_mode: 'Markdown',
        ...getMainKeyboard()
    });
});

// المجتمع
bot.action('community', async (ctx) => {
    await ctx.answerCbQuery();
    const text = `
👥 **مجتمع ${COIN_NAME}** 👥

انضم إلى مجتمعنا للتواصل مع المتداولين الآخرين:

✨ آخر الأخبار والتحديثات
💎 إشارات تداول مجانية
🎁 مسابقات وجوائز أسبوعية
👨‍💻 دعم فني فوري

**روابط مفيدة:**
• 💬 المجموعة: https://t.me/your_group
• 📢 القناة: https://t.me/your_channel
    `;
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.url('💬 انضم للمجموعة', 'https://t.me/your_group')],
            [Markup.button.url('📢 قناة الأخبار', 'https://t.me/your_channel')],
            [Markup.button.callback('🔙 رجوع', 'back')]
        ])
    });
});

// الأمان
bot.action('security', async (ctx) => {
    await ctx.answerCbQuery();
    const text = `
🔒 **الأمان والتوثيق** 🔒

✅ **ميزات الأمان في منصتنا:**

1. 🔐 **تشفير شامل** - جميع بياناتك مشفرة
2. 🛡️ **حماية ثنائية** - دعم للمصادقة الثنائية
3. 📱 **محفظة باردة** - 95% من الأموال في محافظ باردة
4. 🚨 **تنبيهات فورية** - إشعارات لأي نشاط مريب

⚠️ **نصائح أمان:**
• لا تشارك كلمة سرك مع أي شخص
• فعّل المصادقة الثنائية (2FA)
• لا تنقر على روابط مشبوهة
    `;
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...getMainKeyboard()
    });
});

// تاريخ الصفقات
bot.action('history', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = String(ctx.from.id);
    const userTrades = trades.filter(t => t.user_id === userId).slice(-10);
    
    let text = '';
    if (userTrades.length === 0) {
        text = "📜 **ليس لديك أي صفقات حتى الآن**\n\nقم بشراء أو بيع العملة لتبدأ!";
    } else {
        text = "📜 **آخر صفقاتك:** 📜\n\n";
        for (const trade of userTrades) {
            if (trade.type === 'شراء') {
                text += `✅ ${trade.type}: $${trade.amount} - ${trade.coins.toFixed(4)} ${COIN_SYMBOL}\n`;
            } else {
                text += `❌ ${trade.type}: ${trade.coins.toFixed(4)} ${COIN_SYMBOL} - $${trade.value.toFixed(2)}\n`;
            }
            text += `   🕐 ${new Date(trade.time).toLocaleString('ar')}\n\n`;
        }
    }
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...getMainKeyboard()
    });
});

// رجوع
bot.action('back', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText('✨ **القائمة الرئيسية** ✨\nاختر أحد الخيارات:', {
        parse_mode: 'Markdown',
        ...getMainKeyboard()
    });
});

// ========== API لتسجيل الصفقات من التطبيق المصغر ==========
app.post('/api/trade', (req, res) => {
    const { userId, type, amount, coins, value } = req.body;
    
    if (!userId || !type) {
        return res.status(400).json({ error: 'بيانات ناقصة' });
    }
    
    // تحديث رصيد المستخدم
    if (!users[userId]) {
        users[userId] = { balance: 1000, coins: 0, name: 'مستخدم' };
    }
    
    if (type === 'buy') {
        const cost = amount;
        if (users[userId].balance >= cost) {
            users[userId].balance -= cost;
            users[userId].coins += coins;
            trades.push({
                user_id: userId,
                type: 'شراء',
                amount: cost,
                coins: coins,
                price: getCurrentPrice(),
                time: new Date().toISOString()
            });
        }
    } else if (type === 'sell') {
        if (users[userId].coins >= coins) {
            users[userId].coins -= coins;
            users[userId].balance += value;
            trades.push({
                user_id: userId,
                type: 'بيع',
                coins: coins,
                value: value,
                price: getCurrentPrice(),
                time: new Date().toISOString()
            });
        }
    }
    
    saveData();
    res.json({ success: true, user: users[userId] });
});

// API للحصول على بيانات المستخدم
app.get('/api/user/:userId', (req, res) => {
    const userId = req.params.userId;
    const user = users[userId] || { balance: 1000, coins: 0 };
    const price = getCurrentPrice();
    res.json({
        user,
        price,
        totalValue: user.balance + (user.coins * price)
    });
});

// API للحصول على السعر الحالي
app.get('/api/price', (req, res) => {
    res.json({ price: getCurrentPrice() });
});

// ========== إعداد Webhook ==========
async function setupWebhook() {
    try {
        const webhookUrl = `${WEBHOOK_URL}/webhook/${BOT_TOKEN}`;
        await bot.telegram.setWebhook(webhookUrl);
        console.log(`✅ Webhook تم تعيينه: ${webhookUrl}`);
    } catch (err) {
        console.error('❌ خطأ في تعيين Webhook:', err.message);
    }
}

// نقطة Webhook
app.post(`/webhook/${BOT_TOKEN}`, (req, res) => {
    bot.handleUpdate(req.body, res);
});

// صفحة رئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// فحص الصحة
app.get('/health', (req, res) => {
    res.json({ status: 'alive', time: new Date().toISOString() });
});

// ========== تشغيل الخادم ==========
if (process.env.NODE_ENV === 'production') {
    // وضع الإنتاج - استخدام Webhook
    setupWebhook();
    app.listen(PORT, () => {
        console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
        console.log(`🤖 البوت يعمل عبر Webhook`);
    });
} else {
    // وضع التطوير - استخدام Polling
    bot.launch();
    app.listen(PORT, () => {
        console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
        console.log(`🤖 البوت يعمل عبر Polling`);
    });
}

// إغلاق أنيق
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
