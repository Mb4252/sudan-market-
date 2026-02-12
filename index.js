const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { MongoClient, ObjectId } = require('mongodb');

// ==================== 1. تهيئة خادم الويب ====================
const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ==================== 2. الاتصال بقاعدة MongoDB ====================
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'crystal_mining';

let db;
let usersCollection;
let systemCollection;
let purchasesCollection;
let buyOrdersCollection;
let sellOrdersCollection;

async function connectToMongo() {
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        console.log('✅ متصل بقاعدة MongoDB Atlas');
        
        db = client.db(DB_NAME);
        usersCollection = db.collection('users');
        systemCollection = db.collection('system');
        purchasesCollection = db.collection('purchases');
        buyOrdersCollection = db.collection('buy_orders');
        sellOrdersCollection = db.collection('sell_orders');
        
        // تأكد من وجود بيانات النظام
        const system = await systemCollection.findOne({ _id: 'config' });
        if (!system) {
            await systemCollection.insertOne({
                _id: 'config',
                totalTransactions: 0,
                totalInvites: 0,
                shopRevenue: 0,
                coinName: '💎 كريستال التعدين',
                coinSymbol: '💎',
                coinEmoji: '💎',
                usdRate: 0.10,
                totalCrystalSold: 0,
                totalCrystalBought: 0,
                totalUsdInvested: 0,
                createdAt: Date.now()
            });
        }
        
        // تأكد من وجود عناصر المتجر
        const shopItems = await db.collection('shopItems').findOne({ _id: 'items' });
        if (!shopItems) {
            await db.collection('shopItems').insertOne({
                _id: 'items',
                energy_boost: {
                    id: 'energy_boost',
                    name: '⚡ بلورة الطاقة',
                    description: 'تزيد سعة الطاقة إلى 150 كريستالة',
                    price: 50,
                    cryptoPrices: { TON: 0.5, USDT: 1.5 },
                    effect: { maxEnergy: 150 },
                    emoji: '⚡'
                },
                miner_upgrade: {
                    id: 'miner_upgrade',
                    name: '⛏️ معول الكريستال الأسطوري',
                    description: 'يزيد أرباح التعدين 30%',
                    price: 120,
                    cryptoPrices: { TON: 1.2, USDT: 3.5 },
                    effect: { miningBonus: 1.3 },
                    emoji: '⛏️'
                }
            });
        }
        
        console.log('📦 قاعدة البيانات جاهزة');
        console.log(`💰 سعر الصرف: 1 💎 = ${(await systemCollection.findOne({ _id: 'config' })).usdRate} دولار`);
        return true;
    } catch (error) {
        console.error('❌ فشل الاتصال بقاعدة البيانات:', error);
        return false;
    }
}

// ==================== 3. دوال التخزين الآمن ====================

// قراءة مستخدم
async function getUser(userId) {
    try {
        let user = await usersCollection.findOne({ user_id: userId });
        if (!user) return null;
        
        const { _id, ...userData } = user;
        return userData;
    } catch (error) {
        console.error('خطأ في قراءة المستخدم:', error);
        return null;
    }
}

// إنشاء أو تحديث مستخدم
async function saveUser(userData) {
    try {
        await usersCollection.updateOne(
            { user_id: userData.user_id },
            { $set: userData },
            { upsert: true }
        );
        return true;
    } catch (error) {
        console.error('خطأ في حفظ المستخدم:', error);
        return false;
    }
}

// تحديث رصيد المستخدم
async function updateUserBalance(userId, amount) {
    try {
        const result = await usersCollection.updateOne(
            { user_id: userId },
            { $inc: { balance: amount } }
        );
        return result.modifiedCount > 0;
    } catch (error) {
        console.error('خطأ في تحديث الرصيد:', error);
        return false;
    }
}

// إضافة ترقية للمستخدم
async function addUserUpgrade(userId, upgradeId, effect) {
    try {
        const update = { [`upgrades.${upgradeId}`]: true };
        if (effect.maxEnergy) {
            update.maxEnergy = effect.maxEnergy;
        }
        
        await usersCollection.updateOne(
            { user_id: userId },
            { $set: update }
        );
        return true;
    } catch (error) {
        console.error('خطأ في إضافة الترقية:', error);
        return false;
    }
}

// قراءة إحصائيات النظام
async function getSystemStats() {
    try {
        const system = await systemCollection.findOne({ _id: 'config' });
        return system || {};
    } catch (error) {
        console.error('خطأ في قراءة إحصائيات النظام:', error);
        return {};
    }
}

// تحديث إحصائيات النظام
async function updateSystemStats(updates) {
    try {
        await systemCollection.updateOne(
            { _id: 'config' },
            { $inc: updates }
        );
        return true;
    } catch (error) {
        console.error('خطأ في تحديث إحصائيات النظام:', error);
        return false;
    }
}

// قراءة عناصر المتجر
async function getShopItems() {
    try {
        const items = await db.collection('shopItems').findOne({ _id: 'items' });
        return items || {};
    } catch (error) {
        console.error('خطأ في قراءة المتجر:', error);
        return {};
    }
}

// حفظ طلب شراء
async function savePurchase(purchaseData) {
    try {
        await purchasesCollection.insertOne({
            ...purchaseData,
            createdAt: Date.now()
        });
        return true;
    } catch (error) {
        console.error('خطأ في حفظ طلب الشراء:', error);
        return false;
    }
}

// تحديث حالة طلب شراء
async function updatePurchaseStatus(paymentId, status, txHash = null) {
    try {
        const update = { status };
        if (txHash) update.txHash = txHash;
        
        await purchasesCollection.updateOne(
            { paymentId },
            { $set: update }
        );
        return true;
    } catch (error) {
        console.error('خطأ في تحديث طلب الشراء:', error);
        return false;
    }
}

// قراءة طلب شراء
async function getPurchase(paymentId) {
    try {
        return await purchasesCollection.findOne({ paymentId });
    } catch (error) {
        console.error('خطأ في قراءة طلب الشراء:', error);
        return null;
    }
}

// ========== نظام شراء العملة بالدولار ==========

// حفظ طلب شراء كريستال
async function saveBuyOrder(orderData) {
    try {
        await buyOrdersCollection.insertOne({
            ...orderData,
            createdAt: Date.now(),
            status: 'pending'
        });
        return true;
    } catch (error) {
        console.error('خطأ في حفظ طلب شراء:', error);
        return false;
    }
}

// تحديث حالة طلب شراء
async function updateBuyOrderStatus(orderId, status) {
    try {
        await buyOrdersCollection.updateOne(
            { orderId },
            { $set: { status, updatedAt: Date.now() } }
        );
        return true;
    } catch (error) {
        console.error('خطأ في تحديث طلب شراء:', error);
        return false;
    }
}

// قراءة طلبات شراء المستخدم
async function getUserBuyOrders(userId) {
    try {
        return await buyOrdersCollection
            .find({ userId })
            .sort({ createdAt: -1 })
            .limit(20)
            .toArray();
    } catch (error) {
        console.error('خطأ في قراءة طلبات الشراء:', error);
        return [];
    }
}

// إحصائيات شراء العملة
async function getBuyStats() {
    try {
        const totalOrders = await buyOrdersCollection.countDocuments({ status: 'completed' });
        const totalAmount = await buyOrdersCollection.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$crystalAmount' } } }
        ]).toArray();
        
        const totalUsd = await buyOrdersCollection.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$usdAmount' } } }
        ]).toArray();
        
        return {
            totalOrders: totalOrders || 0,
            totalCrystals: totalAmount[0]?.total || 0,
            totalUsd: totalUsd[0]?.total || 0
        };
    } catch (error) {
        console.error('خطأ في قراءة إحصائيات الشراء:', error);
        return { totalOrders: 0, totalCrystals: 0, totalUsd: 0 };
    }
}

// ========== نظام بيع العملة ==========

// حفظ طلب بيع كريستال
async function saveSellOrder(orderData) {
    try {
        await sellOrdersCollection.insertOne({
            ...orderData,
            createdAt: Date.now(),
            status: 'pending'
        });
        return true;
    } catch (error) {
        console.error('خطأ في حفظ طلب بيع:', error);
        return false;
    }
}

// تحديث حالة طلب بيع
async function updateSellOrderStatus(orderId, status) {
    try {
        await sellOrdersCollection.updateOne(
            { orderId },
            { $set: { status, updatedAt: Date.now() } }
        );
        return true;
    } catch (error) {
        console.error('خطأ في تحديث طلب بيع:', error);
        return false;
    }
}

// قراءة طلبات بيع المستخدم
async function getUserSellOrders(userId) {
    try {
        return await sellOrdersCollection
            .find({ userId })
            .sort({ createdAt: -1 })
            .limit(20)
            .toArray();
    } catch (error) {
        console.error('خطأ في قراءة طلبات البيع:', error);
        return [];
    }
}

// إحصائيات بيع العملة
async function getSellStats() {
    try {
        const totalOrders = await sellOrdersCollection.countDocuments({ status: 'completed' });
        const totalAmount = await sellOrdersCollection.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$crystalAmount' } } }
        ]).toArray();
        
        const totalUsd = await sellOrdersCollection.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$usdAmount' } } }
        ]).toArray();
        
        return {
            totalOrders: totalOrders || 0,
            totalCrystals: totalAmount[0]?.total || 0,
            totalUsd: totalUsd[0]?.total || 0
        };
    } catch (error) {
        console.error('خطأ في قراءة إحصائيات البيع:', error);
        return { totalOrders: 0, totalCrystals: 0, totalUsd: 0 };
    }
}

// قائمة أفضل المستخدمين
async function getTopUsers(limit = 10) {
    try {
        return await usersCollection
            .find({})
            .sort({ balance: -1 })
            .limit(limit)
            .project({ first_name: 1, balance: 1, _id: 0 })
            .toArray();
    } catch (error) {
        console.error('خطأ في قراءة أفضل المستخدمين:', error);
        return [];
    }
}

// إحصائيات المستخدم
async function getUserStats(userId) {
    try {
        const user = await usersCollection.findOne({ user_id: userId });
        if (!user) return null;
        
        const totalUsers = await usersCollection.countDocuments();
        const rank = await usersCollection.countDocuments({ balance: { $gt: user.balance } }) + 1;
        
        // إحصائيات شراء المستخدم
        const userBuys = await buyOrdersCollection.countDocuments({ 
            userId, 
            status: 'completed' 
        });
        
        const userBuyAmount = await buyOrdersCollection.aggregate([
            { $match: { userId, status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$crystalAmount' } } }
        ]).toArray();
        
        // إحصائيات بيع المستخدم
        const userSells = await sellOrdersCollection.countDocuments({ 
            userId, 
            status: 'completed' 
        });
        
        const userSellAmount = await sellOrdersCollection.aggregate([
            { $match: { userId, status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$crystalAmount' } } }
        ]).toArray();
        
        return {
            rank,
            totalUsers,
            totalMines: Math.floor((user.total_mined || 0) / 1),
            totalInvites: user.total_invites || 0,
            upgrades: Object.keys(user.upgrades || {}).length,
            dailyStreak: user.daily_streak || 0,
            totalBuys: userBuys || 0,
            totalBought: userBuyAmount[0]?.total || 0,
            totalSells: userSells || 0,
            totalSold: userSellAmount[0]?.total || 0
        };
    } catch (error) {
        console.error('خطأ في قراءة إحصائيات المستخدم:', error);
        return null;
    }
}

// ==================== 4. تهيئة البوت ====================
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error('❌ خطأ: BOT_TOKEN غير موجود');
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

// ==================== 5. إعدادات البوت ====================
const ADMIN_IDS = process.env.ADMIN_USER_IDS 
    ? process.env.ADMIN_USER_IDS.split(',').map(id => parseInt(id.trim())) 
    : [];

const CRYPTO_WALLETS = {
    TON: process.env.TON_WALLET || "UQDYS6gaGrnmfypwhAYk4mI2OBaMU05NBRQpAnv-eGSI_kN1",
    USDT: process.env.USDT_WALLET || "TL5jLrLGprWcit3dEfY4pAgzbiTpRtUK2N"
};

const APP_URL = process.env.APP_URL || "https://clean-fredelia-bot199311-892fd8e8.koyeb.app";

console.log(`🔗 رابط الواجهة: ${APP_URL}`);
console.log(`💎 TON Wallet: ${CRYPTO_WALLETS.TON}`);
console.log(`💵 USDT Wallet: ${CRYPTO_WALLETS.USDT}`);

// ==================== 6. نظام الأمان ====================
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

app.use('/api', async (req, res, next) => {
    const publicPaths = ['/api/user/me', '/api/shop-items', '/api/buy-stats', '/api/sell-stats'];
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

// ==================== 7. نظام طلبات الشراء المؤقتة ====================
let pendingPurchases = {};
let pendingBuyOrders = {};
let pendingSellOrders = {};

// ==================== 8. أوامر التليجرام ====================
bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const inviteCode = match[1];
    
    console.log(`🔄 مستخدم جديد: ${userId}`);
    
    let user = await getUser(userId);
    
    if (!user) {
        user = {
            user_id: userId,
            balance: 0,
            energy: 100,
            maxEnergy: 100,
            username: msg.from.username || msg.from.first_name,
            first_name: msg.from.first_name,
            created_at: Date.now(),
            last_mine: null,
            last_mine_click: null, // آخر مرة ضغط فيها زر التعدين
            total_mined: 0,
            upgrades: {},
            daily_streak: 0,
            total_invites: 0,
            total_bought: 0,
            total_sold: 0,
            last_daily: null
        };
        await saveUser(user);
    }
    
    if (inviteCode && inviteCode.startsWith('invite_')) {
        const inviterId = inviteCode.replace('invite_', '');
        if (inviterId !== userId) {
            const inviter = await getUser(inviterId);
            if (inviter) {
                await updateUserBalance(inviterId, 25);
                await usersCollection.updateOne(
                    { user_id: inviterId },
                    { $inc: { total_invites: 1 } }
                );
                await updateSystemStats({ totalInvites: 1 });
            }
        }
    }
    
    await bot.sendMessage(chatId, 
        `💎 *مرحباً بك في مناجم الكريستال!* 💎\n\n` +
        `اهلاً ${msg.from.first_name}!\n\n` +
        `⛏️ اضغط على زر التعدين كل ساعتين لاستخراج 1 كريستال.\n` +
        `💰 يمكنك شراء وبيع الكريستال بالدولار!\n` +
        `🎁 المكافأة اليومية: 1 💎\n\n` +
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

// ==================== 9. API آمن مع MongoDB ====================

app.get('/api/user/:userId', async (req, res) => {
    const user = await getUser(req.params.userId);
    if (user) {
        const system = await getSystemStats();
        
        // حساب الوقت المتبقي للتعدين
        let miningCooldown = 0;
        if (user.last_mine_click) {
            const hoursPassed = (Date.now() - user.last_mine_click) / (1000 * 60 * 60);
            if (hoursPassed < 2) {
                miningCooldown = 2 - hoursPassed;
            }
        }
        
        res.json({ 
            success: true, 
            user: {
                ...user,
                usdRate: system.usdRate || 0.10,
                miningCooldown: miningCooldown // بالساعات
            }
        });
    } else {
        res.json({ success: false, error: 'مستخدم غير موجود' });
    }
});

app.get('/api/user/me', async (req, res) => {
    res.json({ username: bot.options.username });
});

// ========== زر التعدين - يعمل كل ساعتين ==========
app.post('/api/mine', async (req, res) => {
    const userId = req.telegramUser.id.toString();
    const user = await getUser(userId);
    
    if (!user) return res.json({ success: false, error: 'مستخدم غير موجود' });
    
    // التحقق من مرور ساعتين على آخر تعدين
    const now = Date.now();
    if (user.last_mine_click) {
        const hoursPassed = (now - user.last_mine_click) / (1000 * 60 * 60);
        if (hoursPassed < 2) {
            const remainingHours = 2 - hoursPassed;
            const remainingMinutes = Math.ceil(remainingHours * 60);
            return res.json({ 
                success: false, 
                error: 'تعدين',
                message: `⏳ انتظر ${remainingMinutes} دقيقة للتعدين مرة أخرى`,
                cooldown: remainingHours
            });
        }
    }
    
    // تعدين 1 كريستال فقط
    const minedAmount = 1;
    const miningBonus = user.upgrades?.miner_upgrade ? 1.3 : 1.0;
    const finalAmount = minedAmount * miningBonus;
    
    const newBalance = (user.balance || 0) + finalAmount;
    const totalMined = (user.total_mined || 0) + finalAmount;
    
    await usersCollection.updateOne(
        { user_id: userId },
        {
            $set: {
                balance: newBalance,
                last_mine_click: now,
                last_mine: now,
                total_mined: totalMined
            }
        }
    );
    
    res.json({
        success: true,
        minedAmount: finalAmount.toFixed(2),
        newBalance: newBalance.toFixed(2),
        message: `✅ تم التعدين! +${finalAmount.toFixed(2)} 💎`,
        cooldown: 2 // ساعتين
    });
});

// ========== المكافأة اليومية - 1 كريستال ==========
app.post('/api/daily', async (req, res) => {
    const userId = req.telegramUser.id.toString();
    const user = await getUser(userId);
    
    if (!user) return res.json({ success: false });
    
    const today = new Date().toDateString();
    const lastDaily = user.last_daily ? new Date(user.last_daily).toDateString() : null;
    
    if (lastDaily === today) {
        return res.json({ success: false, error: 'لقد استلمت مكافأتك اليوم' });
    }
    
    let newStreak = 1;
    if (lastDaily === new Date(Date.now() - 86400000).toDateString()) {
        newStreak = (user.daily_streak || 0) + 1;
    }
    
    // مكافأة 1 كريستال فقط
    const reward = 1;
    
    await usersCollection.updateOne(
        { user_id: userId },
        {
            $inc: { balance: reward },
            $set: {
                daily_streak: newStreak,
                last_daily: Date.now()
            }
        }
    );
    
    res.json({
        success: true,
        reward: reward.toFixed(2),
        streak: newStreak,
        message: `✅ مكافأة يومية: +1 💎`
    });
});

// شراء الترقيات
app.post('/api/buy', async (req, res) => {
    const userId = req.telegramUser.id.toString();
    const { itemId } = req.body;
    
    const user = await getUser(userId);
    const shopItems = await getShopItems();
    const item = shopItems[itemId];
    
    if (!user || !item) {
        return res.json({ success: false, error: 'عنصر غير موجود' });
    }
    
    if (user.balance < item.price) {
        return res.json({ success: false, error: 'رصيد غير كافي' });
    }
    
    if (user.upgrades?.[itemId]) {
        return res.json({ success: false, error: 'ممتلك بالفعل' });
    }
    
    const newBalance = user.balance - item.price;
    
    await usersCollection.updateOne(
        { user_id: userId },
        {
            $set: { balance: newBalance },
            $inc: { [`upgrades.${itemId}`]: 1 }
        }
    );
    
    if (item.effect.maxEnergy) {
        await usersCollection.updateOne(
            { user_id: userId },
            { $set: { maxEnergy: item.effect.maxEnergy } }
        );
    }
    
    await updateSystemStats({ shopRevenue: item.price });
    
    res.json({
        success: true,
        newBalance: newBalance.toFixed(2),
        maxEnergy: item.effect.maxEnergy || user.maxEnergy
    });
});

// شراء بالعملات الرقمية
app.post('/api/crypto-purchase', async (req, res) => {
    const userId = req.telegramUser.id.toString();
    const { itemId, currency } = req.body;
    
    const user = await getUser(userId);
    const shopItems = await getShopItems();
    const item = shopItems[itemId];
    
    if (!user || !item) {
        return res.json({ success: false, error: 'عنصر غير موجود' });
    }
    
    const amount = item.cryptoPrices?.[currency];
    if (!amount) {
        return res.json({ success: false, error: 'عملة غير مدعومة' });
    }
    
    const paymentId = Date.now().toString() + userId;
    const purchaseData = {
        paymentId,
        userId,
        itemId,
        currency,
        amount,
        status: 'pending',
        expiresAt: Date.now() + 60 * 60 * 1000
    };
    
    pendingPurchases[paymentId] = purchaseData;
    await savePurchase(purchaseData);
    
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
                `💰 *طلب شراء ترقية جديد*\n\n` +
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

// ========== نظام شراء الكريستال بالدولار ==========
app.post('/api/buy-crystal', async (req, res) => {
    const userId = req.telegramUser.id.toString();
    const { usdAmount } = req.body;
    
    const user = await getUser(userId);
    if (!user) {
        return res.json({ success: false, error: 'مستخدم غير موجود' });
    }
    
    const system = await getSystemStats();
    const usdRate = system.usdRate || 0.10;
    
    if (usdAmount < 5) {
        return res.json({ success: false, error: 'الحد الأدنى للشراء 5 دولار' });
    }
    
    if (usdAmount > 500) {
        return res.json({ success: false, error: 'الحد الأقصى للشراء 500 دولار' });
    }
    
    const crystalAmount = usdAmount / usdRate;
    const orderId = 'BUY_' + Date.now().toString() + userId;
    
    const orderData = {
        orderId,
        userId,
        userFirstName: user.first_name,
        usdAmount,
        crystalAmount,
        usdRate,
        status: 'pending',
        createdAt: Date.now(),
        expiresAt: Date.now() + 60 * 60 * 1000
    };
    
    pendingBuyOrders[orderId] = orderData;
    await saveBuyOrder(orderData);
    
    setTimeout(() => {
        if (pendingBuyOrders[orderId]?.status === 'pending') {
            delete pendingBuyOrders[orderId];
        }
    }, 60 * 60 * 1000);
    
    for (const adminId of ADMIN_IDS) {
        try {
            const keyboard = {
                inline_keyboard: [
                    [{ text: '✅ تأكيد شراء كريستال', callback_data: `confirm_buy_${orderId}` }],
                    [{ text: '❌ رفض الطلب', callback_data: `reject_buy_${orderId}` }]
                ]
            };
            
            await bot.sendMessage(adminId,
                `💰 *طلب شراء كريستال جديد*\n\n` +
                `👤 المستخدم: ${user.first_name} (${userId})\n` +
                `💵 المبلغ: ${usdAmount} دولار\n` +
                `💎 كمية الكريستال: ${crystalAmount.toFixed(2)} 💎\n` +
                `💰 سعر الصرف: 1 💎 = ${usdRate} دولار\n` +
                `💳 المحفظة: ${CRYPTO_WALLETS.USDT}\n` +
                `⏰ الوقت: ${new Date().toLocaleString('ar-EG')}\n\n` +
                `⚠️ تأكد من وصول التحويل (USDT) ثم اضغط تأكيد`,
                { parse_mode: 'Markdown', reply_markup: keyboard }
            );
        } catch (e) {}
    }
    
    const buyStats = await getBuyStats();
    
    res.json({
        success: true,
        orderId,
        wallet: CRYPTO_WALLETS.USDT,
        usdAmount,
        crystalAmount: crystalAmount.toFixed(2),
        usdRate,
        expiresIn: 60,
        stats: {
            totalOrders: buyStats.totalOrders,
            totalCrystals: buyStats.totalCrystals.toFixed(2),
            totalUsd: buyStats.totalUsd.toFixed(2)
        }
    });
});

// ========== نظام بيع الكريستال ==========
app.post('/api/sell-crystal', async (req, res) => {
    const userId = req.telegramUser.id.toString();
    const { crystalAmount } = req.body;
    
    const user = await getUser(userId);
    if (!user) {
        return res.json({ success: false, error: 'مستخدم غير موجود' });
    }
    
    if (user.balance < crystalAmount) {
        return res.json({ success: false, error: 'رصيد غير كافي' });
    }
    
    const system = await getSystemStats();
    const usdRate = system.usdRate || 0.10;
    
    if (crystalAmount < 10) {
        return res.json({ success: false, error: 'الحد الأدنى للبيع 10 كريستال' });
    }
    
    if (crystalAmount > 1000) {
        return res.json({ success: false, error: 'الحد الأقصى للبيع 1000 كريستال' });
    }
    
    const usdAmount = crystalAmount * usdRate;
    const orderId = 'SELL_' + Date.now().toString() + userId;
    
    const orderData = {
        orderId,
        userId,
        userFirstName: user.first_name,
        crystalAmount,
        usdAmount,
        usdRate,
        status: 'pending',
        createdAt: Date.now(),
        expiresAt: Date.now() + 60 * 60 * 1000
    };
    
    pendingSellOrders[orderId] = orderData;
    await saveSellOrder(orderData);
    
    await usersCollection.updateOne(
        { user_id: userId },
        { $inc: { balance: -crystalAmount } }
    );
    
    setTimeout(() => {
        if (pendingSellOrders[orderId]?.status === 'pending') {
            usersCollection.updateOne(
                { user_id: userId },
                { $inc: { balance: crystalAmount } }
            );
            delete pendingSellOrders[orderId];
        }
    }, 60 * 60 * 1000);
    
    for (const adminId of ADMIN_IDS) {
        try {
            const keyboard = {
                inline_keyboard: [
                    [{ text: '✅ تأكيد بيع كريستال', callback_data: `confirm_sell_${orderId}` }],
                    [{ text: '❌ رفض الطلب', callback_data: `reject_sell_${orderId}` }]
                ]
            };
            
            await bot.sendMessage(adminId,
                `💰 *طلب بيع كريستال جديد*\n\n` +
                `👤 المستخدم: ${user.first_name} (${userId})\n` +
                `💎 كمية الكريستال: ${crystalAmount} 💎\n` +
                `💵 المبلغ: ${usdAmount.toFixed(2)} دولار\n` +
                `💰 سعر الصرف: 1 💎 = ${usdRate} دولار\n` +
                `💳 حول المبلغ لهذه المحفظة: ${CRYPTO_WALLETS.USDT}\n` +
                `⏰ الوقت: ${new Date().toLocaleString('ar-EG')}\n\n` +
                `⚠️ حول المبلغ للمستخدم ثم اضغط تأكيد`,
                { parse_mode: 'Markdown', reply_markup: keyboard }
            );
        } catch (e) {}
    }
    
    const sellStats = await getSellStats();
    
    res.json({
        success: true,
        orderId,
        crystalAmount,
        usdAmount: usdAmount.toFixed(2),
        usdRate,
        newBalance: (user.balance - crystalAmount).toFixed(2),
        expiresIn: 60,
        stats: {
            totalOrders: sellStats.totalOrders,
            totalCrystals: sellStats.totalCrystals.toFixed(2),
            totalUsd: sellStats.totalUsd.toFixed(2)
        }
    });
});

// إحصائيات الشراء العامة
app.get('/api/buy-stats', async (req, res) => {
    const stats = await getBuyStats();
    res.json({ success: true, stats });
});

// إحصائيات البيع العامة
app.get('/api/sell-stats', async (req, res) => {
    const stats = await getSellStats();
    res.json({ success: true, stats });
});

// طلبات المستخدم
app.get('/api/user-orders/:userId', async (req, res) => {
    const userId = req.params.userId;
    const buyOrders = await getUserBuyOrders(userId);
    const sellOrders = await getUserSellOrders(userId);
    
    res.json({
        success: true,
        buyOrders: buyOrders.map(o => ({
            ...o,
            _id: undefined
        })),
        sellOrders: sellOrders.map(o => ({
            ...o,
            _id: undefined
        }))
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
        const savedPayment = await getPurchase(req.params.paymentId);
        if (savedPayment) {
            res.json({
                success: true,
                status: savedPayment.status,
                currency: savedPayment.currency,
                amount: savedPayment.amount
            });
        } else {
            res.json({ success: false, status: 'expired' });
        }
    }
});

app.post('/api/charge', async (req, res) => {
    const userId = req.telegramUser.id.toString();
    const user = await getUser(userId);
    
    if (!user) return res.json({ success: false });
    
    let newEnergy = user.energy;
    
    if (user.last_mine) {
        const hoursPassed = (Date.now() - user.last_mine) / (1000 * 60 * 60);
        const energyToAdd = Math.floor(hoursPassed * 10);
        const maxEnergy = user.maxEnergy || 100;
        newEnergy = Math.min(maxEnergy, user.energy + energyToAdd);
        
        await usersCollection.updateOne(
            { user_id: userId },
            { $set: { energy: newEnergy } }
        );
    }
    
    res.json({ success: true, energy: newEnergy, maxEnergy: user.maxEnergy || 100 });
});

app.get('/api/top', async (req, res) => {
    const topUsers = await getTopUsers(10);
    res.json({ success: true, topUsers });
});

// ========== تحويل الكريستال بين المستخدمين ==========
app.post('/api/transfer', async (req, res) => {
    const fromId = req.telegramUser.id.toString();
    const { toUsername, amount } = req.body;
    
    const receiver = await usersCollection.findOne({ 
        username: toUsername.replace('@', '') 
    });
    
    if (!receiver) {
        return res.json({ success: false, error: 'المستقبل غير موجود' });
    }
    
    const sender = await getUser(fromId);
    
    if (!sender) {
        return res.json({ success: false, error: 'المرسل غير موجود' });
    }
    
    if (sender.balance < amount) {
        return res.json({ success: false, error: 'رصيد غير كافي' });
    }
    
    if (amount < 1) {
        return res.json({ success: false, error: 'الحد الأدنى للتحويل 1 كريستال' });
    }
    
    await usersCollection.updateOne(
        { user_id: fromId },
        { $inc: { balance: -amount } }
    );
    
    await usersCollection.updateOne(
        { user_id: receiver.user_id },
        { $inc: { balance: amount } }
    );
    
    await updateSystemStats({ totalTransactions: 1 });
    
    const newSender = await getUser(fromId);
    
    // إشعار المستلم
    try {
        await bot.sendMessage(receiver.user_id,
            `💰 *تم استلام تحويل!* 💰\n\n` +
            `👤 من: ${sender.first_name}\n` +
            `💎 المبلغ: ${amount} كريستال\n\n` +
            `تم إضافة المبلغ إلى محفظتك.`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {}
    
    res.json({
        success: true,
        newBalance: newSender.balance.toFixed(2),
        receiverName: receiver.first_name
    });
});

app.get('/api/stats/:userId', async (req, res) => {
    const stats = await getUserStats(req.params.userId);
    if (stats) {
        res.json({ success: true, ...stats });
    } else {
        res.json({ success: false });
    }
});

app.get('/api/shop-items', async (req, res) => {
    const items = await getShopItems();
    const system = await getSystemStats();
    res.json({ 
        success: true, 
        items,
        usdRate: system.usdRate || 0.10
    });
});

app.get('/', (req, res) => {
    res.redirect('/app.html');
});

// ==================== 10. معالجة أزرار الأدمن ====================

function isAdmin(userId) {
    return ADMIN_IDS.includes(Number(userId));
}

bot.on('callback_query', async (callbackQuery) => {
    const message = callbackQuery.message;
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;
    const chatId = message.chat.id;
    
    if (!isAdmin(userId)) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ غير مصرح', show_alert: true });
        return;
    }
    
    await bot.answerCallbackQuery(callbackQuery.id);
    
    // تأكيد شراء الكريستال
    if (data.startsWith('confirm_buy_')) {
        const orderId = data.replace('confirm_buy_', '');
        const order = pendingBuyOrders[orderId];
        
        if (!order) {
            await bot.sendMessage(chatId, '❌ الطلب منتهي الصلاحية');
            return;
        }
        
        await usersCollection.updateOne(
            { user_id: order.userId },
            { 
                $inc: { 
                    balance: order.crystalAmount,
                    total_bought: order.crystalAmount
                } 
            }
        );
        
        await updateSystemStats({ 
            totalCrystalSold: order.crystalAmount,
            totalUsdInvested: order.usdAmount 
        });
        
        await updateBuyOrderStatus(orderId, 'completed');
        order.status = 'completed';
        
        try {
            await bot.sendMessage(order.userId,
                `💰 *تم شراء الكريستال بنجاح!* 💰\n\n` +
                `✅ تم إضافة ${order.crystalAmount.toFixed(2)} 💎 إلى محفظتك!\n` +
                `💵 المبلغ المدفوع: ${order.usdAmount} دولار USDT\n\n` +
                `شكراً لثقتك بمناجم الكريستال! ⛏️`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) {}
        
        await bot.sendMessage(chatId, 
            `✅ تم تأكيد شراء الكريستال\n` +
            `👤 المستخدم: ${order.userFirstName}\n` +
            `💎 الكمية: ${order.crystalAmount.toFixed(2)}\n` +
            `💵 المبلغ: ${order.usdAmount} دولار`
        );
        
        delete pendingBuyOrders[orderId];
    }
    
    // رفض شراء الكريستال
    else if (data.startsWith('reject_buy_')) {
        const orderId = data.replace('reject_buy_', '');
        const order = pendingBuyOrders[orderId];
        
        if (order) {
            await updateBuyOrderStatus(orderId, 'rejected');
            
            try {
                await bot.sendMessage(order.userId,
                    `❌ *تم رفض طلب شراء الكريستال*\n\n` +
                    `للأسف، لم يتم تأكيد وصول التحويل.\n` +
                    `يمكنك المحاولة مرة أخرى.`,
                    { parse_mode: 'Markdown' }
                );
            } catch (e) {}
            
            delete pendingBuyOrders[orderId];
        }
        
        await bot.sendMessage(chatId, '❌ تم رفض طلب الشراء');
    }
    
    // تأكيد بيع الكريستال
    else if (data.startsWith('confirm_sell_')) {
        const orderId = data.replace('confirm_sell_', '');
        const order = pendingSellOrders[orderId];
        
        if (!order) {
            await bot.sendMessage(chatId, '❌ الطلب منتهي الصلاحية');
            return;
        }
        
        await usersCollection.updateOne(
            { user_id: order.userId },
            { $inc: { total_sold: order.crystalAmount } }
        );
        
        await updateSellOrderStatus(orderId, 'completed');
        order.status = 'completed';
        
        try {
            await bot.sendMessage(order.userId,
                `💰 *تم بيع الكريستال بنجاح!* 💰\n\n` +
                `✅ تم بيع ${order.crystalAmount} 💎\n` +
                `💵 المبلغ المستلم: ${order.usdAmount.toFixed(2)} دولار USDT\n\n` +
                `شكراً لاستخدامك مناجم الكريستال! ⛏️`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) {}
        
        await bot.sendMessage(chatId, 
            `✅ تم تأكيد بيع الكريستال\n` +
            `👤 المستخدم: ${order.userFirstName}\n` +
            `💎 الكمية: ${order.crystalAmount}\n` +
            `💵 المبلغ: ${order.usdAmount.toFixed(2)} دولار`
        );
        
        delete pendingSellOrders[orderId];
    }
    
    // رفض بيع الكريستال
    else if (data.startsWith('reject_sell_')) {
        const orderId = data.replace('reject_sell_', '');
        const order = pendingSellOrders[orderId];
        
        if (order) {
            await usersCollection.updateOne(
                { user_id: order.userId },
                { $inc: { balance: order.crystalAmount } }
            );
            
            await updateSellOrderStatus(orderId, 'rejected');
            
            try {
                await bot.sendMessage(order.userId,
                    `❌ *تم رفض طلب بيع الكريستال*\n\n` +
                    `تم إرجاع ${order.crystalAmount} 💎 إلى محفظتك.`,
                    { parse_mode: 'Markdown' }
                );
            } catch (e) {}
            
            delete pendingSellOrders[orderId];
        }
        
        await bot.sendMessage(chatId, '❌ تم رفض طلب البيع');
    }
    
    // تأكيد دفع ترقية
    else if (data.startsWith('confirm_pay_')) {
        const paymentId = data.replace('confirm_pay_', '');
        const payment = pendingPurchases[paymentId];
        
        if (!payment) {
            await bot.sendMessage(chatId, '❌ المعاملة منتهية الصلاحية');
            return;
        }
        
        const shopItems = await getShopItems();
        const item = shopItems[payment.itemId];
        
        if (!item) {
            await bot.sendMessage(chatId, '❌ خطأ في بيانات العنصر');
            return;
        }
        
        await addUserUpgrade(payment.userId, payment.itemId, item.effect);
        await updateSystemStats({ shopRevenue: item.price });
        await updatePurchaseStatus(paymentId, 'completed');
        
        payment.status = 'completed';
        
        try {
            await bot.sendMessage(payment.userId,
                `💎 *تهانينا يا منقب الكريستال!* 💎\n\n` +
                `✅ تم تأكيد دفعتك وتفعيل *${item.name}* بنجاح!\n` +
                `💰 المبلغ: ${payment.amount} ${payment.currency}\n\n` +
                `الآن أصبحت أقوى في مناجم الكريستال! ⛏️`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) {}
        
        await bot.sendMessage(chatId, '✅ تم تأكيد الدفع وتفعيل العنصر بنجاح');
        delete pendingPurchases[paymentId];
    }
    
    else if (data.startsWith('reject_pay_')) {
        const paymentId = data.replace('reject_pay_', '');
        const payment = pendingPurchases[paymentId];
        
        if (payment) {
            payment.status = 'rejected';
            await updatePurchaseStatus(paymentId, 'rejected');
            
            try {
                await bot.sendMessage(payment.userId,
                    `❌ *تم رفض طلب الشراء*\n\n` +
                    `للأسف، لم يتم تأكيد وصول التحويل.\n` +
                    `يمكنك المحاولة مرة أخرى.`,
                    { parse_mode: 'Markdown' }
                );
            } catch (e) {}
            
            delete pendingPurchases[paymentId];
        }
        
        await bot.sendMessage(chatId, '❌ تم رفض المعاملة');
    }
});

// أمر الأدمن لعرض الإحصائيات
bot.onText(/\/admin/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '❌ غير مصرح لك باستخدام هذا الأمر');
        return;
    }
    
    const totalUsers = await usersCollection.countDocuments();
    const system = await getSystemStats();
    const pendingBuys = Object.keys(pendingBuyOrders).length;
    const pendingSells = Object.keys(pendingSellOrders).length;
    const pendingUpgrades = Object.values(pendingPurchases).filter(p => p.status === 'pending').length;
    
    const buyStats = await getBuyStats();
    const sellStats = await getSellStats();
    
    const message = 
        `👑 *لوحة تحكم الأدمن - مناجم الكريستال* 👑\n\n` +
        `📊 *إحصائيات عامة:*\n` +
        `• 👥 المستخدمون: ${totalUsers}\n` +
        `• 💎 إجمالي الكريستال المباع: ${buyStats.totalCrystals.toFixed(2)} 💎\n` +
        `• 💵 إجمالي الاستثمار: ${buyStats.totalUsd.toFixed(2)} دولار\n` +
        `• 💰 إيرادات المتجر: ${(system.shopRevenue || 0).toFixed(2)} 💎\n\n` +
        `⏳ *طلبات معلقة:*\n` +
        `• 💵 شراء كريستال: ${pendingBuys}\n` +
        `• 💎 بيع كريستال: ${pendingSells}\n` +
        `• 🛒 ترقيات: ${pendingUpgrades}\n\n` +
        `💰 *سعر الصرف:* 1 💎 = ${system.usdRate || 0.10} دولار\n\n` +
        `🔧 نظام التعدين: كل ساعتين - 1 كريستال\n` +
        `🎁 المكافأة اليومية: 1 كريستال`;
    
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// أمر البحث عن مستخدم
bot.onText(/\/user (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const searchTerm = match[1];
    
    if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '❌ غير مصرح');
        return;
    }
    
    let targetUser = null;
    
    if (await usersCollection.findOne({ user_id: searchTerm })) {
        targetUser = await getUser(searchTerm);
    } else {
        targetUser = await usersCollection.findOne({ 
            username: { $regex: searchTerm, $options: 'i' } 
        });
        if (targetUser) {
            const { _id, ...userData } = targetUser;
            targetUser = userData;
        }
    }
    
    if (!targetUser) {
        await bot.sendMessage(chatId, '❌ منقب غير موجود');
        return;
    }
    
    const rank = await usersCollection.countDocuments({ balance: { $gt: targetUser.balance } }) + 1;
    const totalUsers = await usersCollection.countDocuments();
    
    const upgradesList = Object.keys(targetUser.upgrades || {}).length > 0 
        ? Object.keys(targetUser.upgrades).join(', ') 
        : 'لا يوجد';
    
    const userBuys = await buyOrdersCollection.countDocuments({ 
        userId: targetUser.user_id, 
        status: 'completed' 
    });
    
    const userSells = await sellOrdersCollection.countDocuments({ 
        userId: targetUser.user_id, 
        status: 'completed' 
    });
    
    await bot.sendMessage(chatId,
        `👤 *ملف المنقب*\n\n` +
        `🆔 المعرف: \`${targetUser.user_id}\`\n` +
        `📛 الاسم: ${targetUser.first_name}\n` +
        `👤 اليوزر: @${targetUser.username || 'لا يوجد'}\n` +
        `💰 رصيد الكريستال: ${targetUser.balance.toFixed(2)} 💎\n` +
        `⚡ الطاقة: ${targetUser.energy}/${targetUser.maxEnergy || 100}\n` +
        `🏆 الترتيب: #${rank} من ${totalUsers}\n\n` +
        `📊 *إحصائيات التعدين:*\n` +
        `• ⛏️ إجمالي التعدين: ${(targetUser.total_mined || 0).toFixed(2)} 💎\n` +
        `• 🔥 السلسلة اليومية: ${targetUser.daily_streak || 0}\n\n` +
        `📊 *إحصائيات التداول:*\n` +
        `• 💵 مشتريات: ${userBuys} (${(targetUser.total_bought || 0).toFixed(2)} 💎)\n` +
        `• 💰 مبيعات: ${userSells} (${(targetUser.total_sold || 0).toFixed(2)} 💎)\n\n` +
        `🛒 الترقيات: ${upgradesList}\n` +
        `👥 الدعوات: ${targetUser.total_invites || 0}\n` +
        `📅 تاريخ الانضمام: ${new Date(targetUser.created_at).toLocaleDateString('ar-EG')}`,
        { parse_mode: 'Markdown' }
    );
});

// ==================== 11. تشغيل الخادم ====================
async function startServer() {
    const connected = await connectToMongo();
    if (!connected) {
        console.error('❌ فشل الاتصال بقاعدة البيانات. تأكد من MONGODB_URI');
        process.exit(1);
    }
    
    app.listen(PORT, () => {
        console.log(`🌐 خادم الويب يعمل على المنفذ: ${PORT}`);
        console.log(`🔗 رابط الواجهة المحلي: http://localhost:${PORT}`);
        console.log(`🔗 رابط الواجهة الخارجي: ${APP_URL}`);
        console.log(`💎 TON Wallet: ${CRYPTO_WALLETS.TON}`);
        console.log(`💵 USDT Wallet: ${CRYPTO_WALLETS.USDT}`);
        console.log(`🔒 نظام الأمان: مفعل`);
        console.log(`⛏️ نظام التعدين: كل ساعتين - 1 كريستال`);
        console.log(`🎁 المكافأة اليومية: 1 كريستال`);
        console.log(`💰 نظام شراء وبيع الكريستال: مفعل`);
        console.log(`👮 نظام الأدمن اليدوي: مفعل`);
    });
}

startServer();

process.on('SIGINT', () => {
    console.log('\n🛑 إيقاف البوت...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 إيقاف البوت...');
    process.exit(0);
});

console.log('🚀 بوت مناجم الكريستال - الإصدار 6.0');
console.log('📱 افتح تليجرام وأرسل /start');
console.log('👑 لوحة الأدمن: /admin');
console.log('⛏️ تعدين: 1 كريستال كل ساعتين');
console.log('🎁 مكافأة يومية: 1 كريستال');
console.log('💰 سعر الصرف: 1 💎 = 0.10 دولار');
