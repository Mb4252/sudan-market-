const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const express = require('express');
const cors = require('cors');

// ==================== 1. تهيئة خادم الويب ====================
const app = express();
const PORT = process.env.PORT || 3000;

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
                shopRevenue: 0
            },
            shopItems: {
                'energy_boost': {
                    id: 'energy_boost',
                    name: '⚡ تعزيز الطاقة',
                    description: 'يزيد سعة الطاقة إلى 150',
                    price: 50,
                    effect: { maxEnergy: 150 },
                    emoji: '⚡'
                },
                'miner_upgrade': {
                    id: 'miner_upgrade',
                    name: '⛏️ مُعدِّن محترف',
                    description: 'يزيد الأرباح 30%',
                    price: 120,
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
    return data;
}

// ==================== 3. تهيئة بوت تليجرام ====================
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error('❌ خطأ: BOT_TOKEN غير موجود في ملف .env');
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('🤖 البوت يعمل...');

// ==================== 4. قراءة المشرفين ====================
const ADMIN_IDS = process.env.ADMIN_USER_IDS 
    ? process.env.ADMIN_USER_IDS.split(',').map(id => parseInt(id.trim())) 
    : [];

// ==================== 5. أوامر التليجرام ====================

bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const inviteCode = match[1];
    
    console.log(`🔄 فتح Mini App للمستخدم: ${userId}`);
    
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
    
    // ========== الرابط الحيوي - غير هذا الرابط ==========
    const APP_URL = 'https://clean-fredelia-bot199311-892fd8e8.koyeb.app';
    // ==================================================
    
    console.log(`🔗 رابط الواجهة: ${APP_URL}`);
    
    await bot.sendMessage(chatId, 
        `🎮 *مرحباً ${msg.from.first_name}!*\n\n` +
        `اضغط على الزر أدناه لفتح **منصة التعدين المتكاملة** ⛏️`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    {
                        text: '🚀 فتح منصة التعدين',
                        web_app: { url: APP_URL }
                    }
                ]]
            }
        }
    );
});

// ==================== 6. API للويب ====================

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
    const { userId } = req.body;
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
    const { userId, itemId } = req.body;
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

app.post('/api/charge', async (req, res) => {
    const { userId } = req.body;
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
    const { fromId, toUsername, amount } = req.body;
    const data = await readData();
    
    const receiver = Object.values(data.users).find(u => 
        u.username === toUsername.replace('@', '')
    );
    
    if (!receiver) {
        return res.json({ success: false, error: 'المستقبل غير موجود' });
    }
    
    const sender = data.users[fromId];
    if (sender.balance < amount) {
        return res.json({ success: false, error: 'رصيد غير كافي' });
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
    const { userId } = req.body;
    const data = await readData();
    const user = data.users[userId];
    
    if (!user) return res.json({ success: false });
    
    const today = new Date().toDateString();
    const lastDaily = user.last_daily ? new Date(user.last_daily).toDateString() : null;
    
    if (lastDaily === today) {
        return res.json({ success: false, error: 'لقد أخذت مكافأتك اليوم' });
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

app.get('/', (req, res) => {
    res.redirect('/app.html');
});

// ==================== 7. تشغيل الخادم ====================
app.listen(PORT, () => {
    console.log(`🌐 خادم الويب يعمل على المنفذ: ${PORT}`);
    console.log(`🔗 رابط الواجهة المحلي: http://localhost:${PORT}`);
    console.log(`⚠️  مهم: غير رابط APP_URL في الكود إلى رابط ngrok أو localtunnel`);
});

initializeSystem().catch(console.error);

process.on('SIGINT', () => {
    console.log('\n🛑 إيقاف البوت...');
    bot.stopPolling();
    process.exit(0);
});

console.log('🚀 البوت الإصدار 3.0 - Mini App جاهز!');
console.log('📱 افتح تليجرام وأرسل /start لتجربة الواجهة الجديدة');
