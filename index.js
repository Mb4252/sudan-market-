const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

// ==================== 1. تهيئة خادم الويب ====================
const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ==================== 2. نظام التخزين ====================
const DATA_FILE = path.join(__dirname, 'bot-data.json');

async function readData() {
    try {
        const fileContent = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(fileContent);
    } catch (error) {
        const initialData = {
            users: {},
            system: {
                totalTransactions: 0,
                lastReset: Date.now(),
                totalInvites: 0,
                shopRevenue: 0,
                coinName: '💎 كريستال التعدين',
                coinSymbol: '💎',
                coinEmoji: '💎'
            },
            shopItems: {
                'energy_boost': {
                    id: 'energy_boost',
                    name: '⚡ بلورة الطاقة',
                    description: 'تزيد سعة الطاقة إلى 150 كريستالة',
                    price: 50,
                    cryptoPrices: { TON: 0.5, USDT: 1.5 },
                    effect: { maxEnergy: 150 },
                    emoji: '⚡'
                },
                'miner_upgrade': {
                    id: 'miner_upgrade',
                    name: '⛏️ معول الكريستال الأسطوري',
                    description: 'يزيد أرباح التعدين 30%',
                    price: 120,
                    cryptoPrices: { TON: 1.2, USDT: 3.5 },
                    effect: { miningBonus: 1.3 },
                    emoji: '⛏️'
                }
            }
        };
        await saveData(initialData);
        return initialData;
    }
}

async function saveData(data) {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
}

async function initializeSystem() {
    const data = await readData();
    console.log(`✨ نظام التخزين جاهز | المستخدمون: ${Object.keys(data.users).length}`);
    console.log(`🛒 عناصر المتجر: ${Object.keys(data.shopItems).length}`);
    console.log(`💎 عملة البوت: ${data.system.coinName}`);
    return data;
}

// ==================== 3. تهيئة بوت تليجرام ====================
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error('❌ خطأ: BOT_TOKEN غير موجود في ملف .env');
    process.exit(1);
}

let bot;
try {
    bot = new TelegramBot(BOT_TOKEN, { polling: true });
    console.log('🤖 البوت يعمل...');
} catch (error) {
    console.error('خطأ في تهيئة البوت:', error);
    process.exit(1);
}

// ==================== 4. قراءة المشرفين والمحافظ ====================
const ADMIN_IDS = process.env.ADMIN_USER_IDS 
    ? process.env.ADMIN_USER_IDS.split(',').map(id => parseInt(id.trim())) 
    : [];

const CRYPTO_WALLETS = {
    TON: process.env.TON_WALLET || "UQDYS6gaGrnmfypwhAYk4mI2OBaMU05NBRQpAnv-eGSI_kN1",
    USDT: process.env.USDT_WALLET || "TL5jLrLGprWcit3dEfY4pAgzbiTpRtUK2N"
};

console.log(`💎 TON Wallet: ${CRYPTO_WALLETS.TON}`);
console.log(`💵 USDT Wallet: ${CRYPTO_WALLETS.USDT}`);

// ==================== 5. نظام الأمان والتحقق ====================

function verifyWebAppData(initData) {
    try {
        if (!initData) return null;
        
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        params.delete('hash');
        
        const sortedParams = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
        
        const secretKey = crypto.createHmac('sha256', 'WebAppData')
            .update(BOT_TOKEN)
            .digest();
        
        const calculatedHash = crypto.createHmac('sha256', secretKey)
            .update(sortedParams)
            .digest('hex');
        
        if (calculatedHash === hash) {
            const userStr = params.get('user');
            if (userStr) {
                return JSON.parse(userStr);
            }
        }
    } catch (error) {
        console.error('خطأ في التحقق:', error);
    }
    return null;
}

app.use('/api', (req, res, next) => {
    const publicPaths = ['/api/user/me', '/api/shop-items'];
    if (publicPaths.includes(req.path)) {
        return next();
    }
    
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Telegram ')) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
    }
    
    const initData = authHeader.substring(9);
    const user = verifyWebAppData(initData);
    
    if (!user) {
        return res.status(403).json({ success: false, error: 'بيانات غير صالحة' });
    }
    
    req.telegramUser = user;
    next();
});

// ==================== 6. نظام طلبات الشراء ====================
let pendingPurchases = {};

// ==================== 7. أوامر التليجرام ====================
const APP_URL = process.env.APP_URL || "https://clean-fredelia-bot199311-892fd8e8.koyeb.app";
console.log(`🔗 رابط الواجهة: ${APP_URL}`);

bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const inviteCode = match[1];
    
    console.log(`🔄 مستخدم جديد: ${userId}`);
    
    const data = await readData();
    if (!data.users[userId]) {
        data.users[userId] = {
            user_id: userId,
            balance: 0,
            energy: 100,
            maxEnergy: 100,
            username: msg.from.username || msg.from.first_name,
            first_name: msg.from.first_name,
            created_at: Date.now(),
            last_mine: null,
            total_mined: 0,
            upgrades: {},
            daily_streak: 0,
            total_invites: 0,
            last_daily: null
        };
        await saveData(data);
    }
    
    if (inviteCode && inviteCode.startsWith('invite_')) {
        const inviterId = inviteCode.replace('invite_', '');
        if (inviterId !== userId && data.users[inviterId]) {
            data.users[userId].invited_by = inviterId;
            data.users[inviterId].balance += 25;
            data.users[inviterId].total_invites += 1;
            data.system.totalInvites += 1;
            await saveData(data);
        }
    }
    
    await bot.sendMessage(chatId, 
        `💎 *مرحباً بك في مناجم الكريستال!* 💎\n\n` +
        `اهلاً ${msg.from.first_name}!\n\n` +
        `⛏️ ابدأ رحلة التعدين الآن واستخرج الكريستالات النادرة.\n` +
        `💎 كلما زادت طاقتك، زادت أرباحك!\n\n` +
        `اضغط على الزر أدناه لفتح منصة التعدين:`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    {
                        text: '⛏️ فتح مناجم الكريستال',
                        web_app: { url: APP_URL }
                    }
                ]]
            }
        }
    );
});

// ==================== 8. API آمن للويب ====================

app.get('/api/user/:userId', async (req, res) => {
    const data = await readData();
    const user = data.users[req.params.userId];
    if (user) {
        res.json({ success: true, user });
    } else {
        res.json({ success: false, error: 'مستخدم غير موجود' });
    }
});

app.get('/api/user/me', async (req, res) => {
    res.json({ username: bot.options.username });
});

app.post('/api/mine', async (req, res) => {
    const userId = req.telegramUser.id.toString();
    const data = await readData();
    const user = data.users[userId];
    
    if (!user) return res.json({ success: false, error: 'مستخدم غير موجود' });
    
    if (user.energy < 10) {
        return res.json({ success: false, error: 'طاقة غير كافية' });
    }
    
    const miningBonus = user.upgrades?.miner_upgrade ? 1.3 : 1.0;
    const minedAmount = (5 + Math.random() * 5) * miningBonus;
    
    user.balance += minedAmount;
    user.energy -= 10;
    user.total_mined += minedAmount;
    user.last_mine = Date.now();
    
    await saveData(data);
    
    res.json({
        success: true,
        minedAmount: minedAmount.toFixed(2),
        newBalance: user.balance.toFixed(2),
        newEnergy: user.energy,
        maxEnergy: user.maxEnergy || 100
    });
});

app.post('/api/buy', async (req, res) => {
    const userId = req.telegramUser.id.toString();
    const { itemId } = req.body;
    const data = await readData();
    const user = data.users[userId];
    const item = data.shopItems[itemId];
    
    if (!user || !item) {
        return res.json({ success: false, error: 'عنصر غير موجود' });
    }
    
    if (user.balance < item.price) {
        return res.json({ success: false, error: 'رصيد غير كافي' });
    }
    
    if (user.upgrades?.[itemId]) {
        return res.json({ success: false, error: 'ممتلك بالفعل' });
    }
    
    user.balance -= item.price;
    if (!user.upgrades) user.upgrades = {};
    user.upgrades[itemId] = true;
    
    if (item.effect.maxEnergy) {
        user.maxEnergy = item.effect.maxEnergy;
    }
    
    data.system.shopRevenue += item.price;
    await saveData(data);
    
    res.json({
        success: true,
        newBalance: user.balance.toFixed(2),
        maxEnergy: user.maxEnergy
    });
});

app.post('/api/crypto-purchase', async (req, res) => {
    const userId = req.telegramUser.id.toString();
    const { itemId, currency } = req.body;
    const data = await readData();
    const user = data.users[userId];
    const item = data.shopItems[itemId];
    
    if (!user || !item) {
        return res.json({ success: false, error: 'عنصر غير موجود' });
    }
    
    const amount = item.cryptoPrices?.[currency];
    if (!amount) {
        return res.json({ success: false, error: 'عملة غير مدعومة' });
    }
    
    const paymentId = Date.now().toString() + userId;
    pendingPurchases[paymentId] = {
        paymentId,
        userId,
        itemId,
        currency,
        amount,
        timestamp: Date.now(),
        status: 'pending',
        expiresAt: Date.now() + 60 * 60 * 1000
    };
    
    setTimeout(() => {
        if (pendingPurchases[paymentId]?.status === 'pending') {
            delete pendingPurchases[paymentId];
        }
    }, 60 * 60 * 1000);
    
    for (const adminId of ADMIN_IDS) {
        try {
            const keyboard = {
                inline_keyboard: [
                    [{ text: '✅ تأكيد الدفع', callback_data: `confirm_pay_${paymentId}` }],
                    [{ text: '❌ رفض الطلب', callback_data: `reject_pay_${paymentId}` }]
                ]
            };
            
            await bot.sendMessage(adminId,
                `💰 *طلب شراء جديد*\n\n` +
                `👤 المستخدم: ${user.first_name} (${userId})\n` +
                `🛒 العنصر: ${item.name}\n` +
                `💰 المبلغ: ${amount} ${currency}\n` +
                `💳 المحفظة: ${CRYPTO_WALLETS[currency]}\n` +
                `⏰ الوقت: ${new Date().toLocaleString('ar-EG')}\n\n` +
                `⚠️ تأكد من وصول التحويل في محفظتك ثم اضغط تأكيد`,
                { parse_mode: 'Markdown', reply_markup: keyboard }
            );
        } catch (e) {}
    }
    
    res.json({
        success: true,
        paymentId,
        wallet: CRYPTO_WALLETS[currency],
        amount,
        currency,
        itemName: item.name,
        expiresIn: 60
    });
});

app.get('/api/payment-status/:paymentId', async (req, res) => {
    const payment = pendingPurchases[req.params.paymentId];
    if (payment) {
        res.json({
            success: true,
            status: payment.status,
            currency: payment.currency,
            amount: payment.amount
        });
    } else {
        res.json({ success: false, status: 'expired' });
    }
});

app.post('/api/charge', async (req, res) => {
    const userId = req.telegramUser.id.toString();
    const data = await readData();
    const user = data.users[userId];
    
    if (!user) return res.json({ success: false });
    
    const now = Date.now();
    if (user.last_mine) {
        const hoursPassed = (now - user.last_mine) / (1000 * 60 * 60);
        const energyToAdd = Math.floor(hoursPassed * 10);
        const maxEnergy = user.maxEnergy || 100;
        user.energy = Math.min(maxEnergy, user.energy + energyToAdd);
    }
    
    await saveData(data);
    res.json({ success: true, energy: user.energy, maxEnergy: user.maxEnergy || 100 });
});

app.get('/api/top', async (req, res) => {
    const data = await readData();
    const topUsers = Object.values(data.users)
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 10)
        .map(u => ({
            name: u.first_name,
            balance: u.balance.toFixed(2)
        }));
    
    res.json({ success: true, topUsers });
});

app.post('/api/transfer', async (req, res) => {
    const fromId = req.telegramUser.id.toString();
    const { toUsername, amount } = req.body;
    const data = await readData();
    
    const receiver = Object.values(data.users).find(u => 
        u.username === toUsername.replace('@', '')
    );
    
    if (!receiver) {
        return res.json({ success: false, error: 'المستقبل غير موجود' });
    }
    
    const sender = data.users[fromId];
    if (!sender) {
        return res.json({ success: false, error: 'المرسل غير موجود' });
    }
    
    if (sender.balance < amount) {
        return res.json({ success: false, error: 'رصيد غير كافي' });
    }
    
    if (amount < 10) {
        return res.json({ success: false, error: 'الحد الأدنى للتحويل 10 كريستالات' });
    }
    
    sender.balance -= amount;
    receiver.balance += amount;
    data.system.totalTransactions += 1;
    
    await saveData(data);
    
    res.json({
        success: true,
        newBalance: sender.balance.toFixed(2),
        receiverName: receiver.first_name
    });
});

app.post('/api/daily', async (req, res) => {
    const userId = req.telegramUser.id.toString();
    const data = await readData();
    const user = data.users[userId];
    
    if (!user) return res.json({ success: false });
    
    const today = new Date().toDateString();
    const lastDaily = user.last_daily ? new Date(user.last_daily).toDateString() : null;
    
    if (lastDaily === today) {
        return res.json({ success: false, error: 'لقد استلمت مكافأتك اليوم' });
    }
    
    if (lastDaily === new Date(Date.now() - 86400000).toDateString()) {
        user.daily_streak = (user.daily_streak || 0) + 1;
    } else {
        user.daily_streak = 1;
    }
    
    const streakBonus = Math.min(user.daily_streak * 5, 50);
    const reward = 20 + streakBonus;
    
    user.balance += reward;
    user.last_daily = Date.now();
    
    await saveData(data);
    res.json({
        success: true,
        reward: reward.toFixed(2),
        streak: user.daily_streak
    });
});

app.get('/api/stats/:userId', async (req, res) => {
    const data = await readData();
    const user = data.users[req.params.userId];
    
    if (!user) return res.json({ success: false });
    
    const totalUsers = Object.keys(data.users).length;
    const userRank = Object.values(data.users)
        .sort((a, b) => b.balance - a.balance)
        .findIndex(u => u.user_id === req.params.userId) + 1;
    
    res.json({
        success: true,
        rank: userRank,
        totalUsers,
        totalMines: Math.floor(user.total_mined / 7),
        totalInvites: user.total_invites || 0,
        upgrades: Object.keys(user.upgrades || {}).length,
        dailyStreak: user.daily_streak || 0
    });
});

app.get('/api/shop-items', async (req, res) => {
    const data = await readData();
    res.json({ success: true, items: data.shopItems });
});

app.get('/', (req, res) => {
    res.redirect('/app.html');
});

// ==================== 9. لوحة تحكم الأدمن ====================

function isAdmin(userId) {
    return ADMIN_IDS.includes(Number(userId));
}

bot.onText(/\/admin/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '❌ غير مصرح لك باستخدام هذا الأمر');
        return;
    }
    
    const data = await readData();
    const pendingCount = Object.values(pendingPurchases).filter(p => p.status === 'pending').length;
    const totalUsers = Object.keys(data.users).length;
    const totalRevenue = data.system.shopRevenue || 0;
    
    const keyboard = {
        inline_keyboard: [
            [{ text: '📊 إحصائيات البوت', callback_data: 'admin_stats' }],
            [{ text: `💰 معاملات معلقة (${pendingCount})`, callback_data: 'admin_pending' }],
            [{ text: '👥 إدارة المستخدمين', callback_data: 'admin_users' }],
            [{ text: '🛒 إدارة المتجر', callback_data: 'admin_shop' }],
            [{ text: '📨 إرسال رسالة', callback_data: 'admin_broadcast' }]
        ]
    };
    
    await bot.sendMessage(chatId, 
        `👑 *لوحة تحكم الأدمن - مناجم الكريستال* 👑\n\n` +
        `📊 إحصائيات سريعة:\n` +
        `• 👥 المستخدمون: ${totalUsers}\n` +
        `• 💰 إيرادات المتجر: ${totalRevenue.toFixed(2)} 💎\n` +
        `• ⏳ معاملات معلقة: ${pendingCount}\n\n` +
        `اختر إجراء من القائمة:`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
    );
});

bot.on('callback_query', async (callbackQuery) => {
    const message = callbackQuery.message;
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;
    
    if (!isAdmin(userId)) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ غير مصرح', show_alert: true });
        return;
    }
    
    await bot.answerCallbackQuery(callbackQuery.id);
    
    if (data === 'admin_stats') {
        const stats = await readData();
        const users = Object.values(stats.users);
        const totalBalance = users.reduce((sum, u) => sum + (u.balance || 0), 0);
        const activeToday = users.filter(u => u.last_mine && (Date.now() - u.last_mine) < 86400000).length;
        
        await bot.sendMessage(message.chat.id,
            `📊 *إحصائيات تفصيلية*\n\n` +
            `👥 إجمالي المستخدمين: ${users.length}\n` +
            `🟢 نشط اليوم: ${activeToday}\n` +
            `💰 إجمالي الأرصدة: ${totalBalance.toFixed(2)} 💎\n` +
            `⛏️ إجمالي التعدين: ${users.reduce((sum, u) => sum + (u.total_mined || 0), 0).toFixed(2)} 💎\n` +
            `🛒 مبيعات المتجر: ${stats.system.shopRevenue?.toFixed(2) || 0} 💎\n` +
            `👥 إجمالي الدعوات: ${stats.system.totalInvites || 0}`,
            { parse_mode: 'Markdown' }
        );
    }
    
    else if (data === 'admin_pending') {
        const pendingList = Object.values(pendingPurchases).filter(p => p.status === 'pending');
        
        if (pendingList.length === 0) {
            await bot.sendMessage(message.chat.id, '✅ لا توجد معاملات معلقة');
            return;
        }
        
        for (const payment of pendingList) {
            const user = (await readData()).users[payment.userId];
            const timeLeft = Math.max(0, Math.floor((payment.expiresAt - Date.now()) / 60000));
            
            const keyboard = {
                inline_keyboard: [
                    [{ text: '✅ تأكيد الدفع', callback_data: `confirm_pay_${payment.paymentId}` }],
                    [{ text: '❌ رفض الطلب', callback_data: `reject_pay_${payment.paymentId}` }]
                ]
            };
            
            await bot.sendMessage(message.chat.id,
                `💰 *طلب شراء معلق*\n\n` +
                `👤 المستخدم: ${user?.first_name || 'غير معروف'}\n` +
                `🆔 المعرف: ${payment.userId}\n` +
                `🛒 العنصر: ${payment.itemId}\n` +
                `💰 المبلغ: ${payment.amount} ${payment.currency}\n` +
                `💳 المحفظة: ${CRYPTO_WALLETS[payment.currency]}\n` +
                `⏰ الوقت المتبقي: ${timeLeft} دقيقة\n\n` +
                `⚠️ تأكد من وصول التحويل في محفظتك ثم اختر تأكيد أو رفض`,
                { parse_mode: 'Markdown', reply_markup: keyboard }
            );
        }
    }
    
    else if (data.startsWith('confirm_pay_')) {
        const paymentId = data.replace('confirm_pay_', '');
        const payment = pendingPurchases[paymentId];
        
        if (!payment) {
            await bot.sendMessage(message.chat.id, '❌ المعاملة منتهية الصلاحية');
            return;
        }
        
        const appData = await readData();
        const user = appData.users[payment.userId];
        const item = appData.shopItems[payment.itemId];
        
        if (!user || !item) {
            await bot.sendMessage(message.chat.id, '❌ خطأ في بيانات المستخدم أو العنصر');
            return;
        }
        
        if (!user.upgrades) user.upgrades = {};
        user.upgrades[payment.itemId] = true;
        
        if (item.effect.maxEnergy) {
            user.maxEnergy = item.effect.maxEnergy;
        }
        
        appData.system.shopRevenue += item.price;
        payment.status = 'completed';
        await saveData(appData);
        
        try {
            await bot.sendMessage(payment.userId,
                `💎 *تهانينا يا منقب الكريستال!* 💎\n\n` +
                `✅ تم تأكيد دفعتك وتفعيل *${item.name}* بنجاح!\n` +
                `💰 المبلغ: ${payment.amount} ${payment.currency}\n\n` +
                `الآن أصبحت أقوى في مناجم الكريستال! ⛏️`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) {}
        
        await bot.sendMessage(message.chat.id, '✅ تم تأكيد الدفع وتفعيل العنصر بنجاح');
        delete pendingPurchases[paymentId];
    }
    
    else if (data.startsWith('reject_pay_')) {
        const paymentId = data.replace('reject_pay_', '');
        const payment = pendingPurchases[paymentId];
        
        if (payment) {
            payment.status = 'rejected';
            
            try {
                await bot.sendMessage(payment.userId,
                    `❌ *تم رفض طلب الشراء*\n\n` +
                    `للأسف، لم يتم تأكيد وصول التحويل.\n` +
                    `يمكنك المحاولة مرة أخرى في مناجم الكريستال.`,
                    { parse_mode: 'Markdown' }
                );
            } catch (e) {}
            
            delete pendingPurchases[paymentId];
        }
        
        await bot.sendMessage(message.chat.id, '❌ تم رفض المعاملة');
    }
    
    else if (data === 'admin_users') {
        const stats = await readData();
        const topUsers = Object.values(stats.users)
            .sort((a, b) => b.balance - a.balance)
            .slice(0, 5);
        
        let usersList = '';
        topUsers.forEach((u, i) => {
            usersList += `${i+1}. ${u.first_name} - ${u.balance.toFixed(2)} 💎\n`;
        });
        
        await bot.sendMessage(message.chat.id,
            `👥 *أغنى منقبي الكريستال*\n\n${usersList}\n` +
            `للبحث عن مستخدم: /user [معرف أو يوزر]`,
            { parse_mode: 'Markdown' }
        );
    }
    
    else if (data === 'admin_shop') {
        const stats = await readData();
        let shopList = '';
        Object.values(stats.shopItems).forEach(item => {
            shopList += `• ${item.name}\n`;
            shopList += `  💎 ${item.price} | TON: ${item.cryptoPrices?.TON} | USDT: ${item.cryptoPrices?.USDT}\n\n`;
        });
        
        await bot.sendMessage(message.chat.id,
            `🛒 *إدارة متجر الكريستال*\n\n` +
            `${shopList}\n` +
            `للتعديل على الأسعار، تواصل مع المطور.`,
            { parse_mode: 'Markdown' }
        );
    }
    
    else if (data === 'admin_broadcast') {
        await bot.sendMessage(message.chat.id,
            '📨 *إرسال رسالة جماعية*\n\n' +
            'أرسل الرسالة التي تريد نشرها لجميع المنقبين:',
            { parse_mode: 'Markdown' }
        );
        
        bot.once('message', async (broadcastMsg) => {
            if (broadcastMsg.chat.id === message.chat.id) {
                const stats = await readData();
                const users = Object.keys(stats.users);
                let sent = 0;
                let failed = 0;
                
                const statusMsg = await bot.sendMessage(message.chat.id, `⏳ جاري الإرسال لـ ${users.length} منقب...`);
                
                for (const userId of users) {
                    try {
                        await bot.sendMessage(userId, broadcastMsg.text);
                        sent++;
                        if (sent % 10 === 0) {
                            await bot.editMessageText(`⏳ جاري الإرسال... ${sent}/${users.length}`, {
                                chat_id: message.chat.id,
                                message_id: statusMsg.message_id
                            });
                        }
                        await new Promise(r => setTimeout(r, 100));
                    } catch (e) {
                        failed++;
                    }
                }
                
                await bot.editMessageText(`✅ تم الإرسال!\n✓ نجح: ${sent}\n✗ فشل: ${failed}`, {
                    chat_id: message.chat.id,
                    message_id: statusMsg.message_id
                });
            }
        });
    }
});

bot.onText(/\/user (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const searchTerm = match[1];
    
    if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '❌ غير مصرح');
        return;
    }
    
    const data = await readData();
    let targetUser = null;
    
    if (data.users[searchTerm]) {
        targetUser = data.users[searchTerm];
    } else {
        targetUser = Object.values(data.users).find(u => 
            u.username?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }
    
    if (!targetUser) {
        await bot.sendMessage(chatId, '❌ منقب غير موجود');
        return;
    }
    
    const rank = Object.values(data.users)
        .sort((a, b) => b.balance - a.balance)
        .findIndex(u => u.user_id === targetUser.user_id) + 1;
    
    const upgradesList = Object.keys(targetUser.upgrades || {}).length > 0 
        ? Object.keys(targetUser.upgrades).join(', ') 
        : 'لا يوجد';
    
    await bot.sendMessage(chatId,
        `👤 *ملف المنقب*\n\n` +
        `🆔 المعرف: \`${targetUser.user_id}\`\n` +
        `📛 الاسم: ${targetUser.first_name}\n` +
        `👤 اليوزر: @${targetUser.username || 'لا يوجد'}\n` +
        `💰 رصيد الكريستال: ${targetUser.balance.toFixed(2)} 💎\n` +
        `⚡ الطاقة: ${targetUser.energy}/${targetUser.maxEnergy || 100}\n` +
        `🏆 الترتيب: #${rank}\n` +
        `🛒 الترقيات: ${upgradesList}\n` +
        `🔥 السلسلة اليومية: ${targetUser.daily_streak || 0}\n` +
        `👥 الدعوات: ${targetUser.total_invites || 0}\n` +
        `📅 تاريخ الانضمام: ${new Date(targetUser.created_at).toLocaleDateString('ar-EG')}`,
        { parse_mode: 'Markdown' }
    );
});

// ==================== 10. تشغيل الخادم ====================
app.listen(PORT, () => {
    console.log(`🌐 خادم الويب يعمل على المنفذ: ${PORT}`);
    console.log(`🔗 رابط الواجهة المحلي: http://localhost:${PORT}`);
    console.log(`🔗 رابط الواجهة الخارجي: ${APP_URL}`);
    console.log(`💎 TON Wallet: ${CRYPTO_WALLETS.TON}`);
    console.log(`💵 USDT Wallet: ${CRYPTO_WALLETS.USDT}`);
    console.log(`🔒 نظام الأمان: مفعل - جميع الطلبات موثقة`);
    console.log(`👮 نظام الأدمن اليدوي: مفعل`);
    console.log(`💎 عملة البوت: كريستال التعدين`);
});

initializeSystem().catch(console.error);

process.on('SIGINT', () => {
    console.log('\n🛑 إيقاف البوت...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 إيقاف البوت...');
    process.exit(0);
});

console.log('🚀 بوت مناجم الكريستال - الإصدار 4.0');
console.log('📱 افتح تليجرام وأرسل /start');
console.log('👑 لوحة الأدمن: /admin');
console.log('💎 عملة البوت: كريستال التعدين');
