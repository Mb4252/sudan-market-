const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'crystal_mining';

let db;
let usersCollection;
let systemCollection;
let purchasesCollection;
let buyOrdersCollection;
let withdrawOrdersCollection;
let inviteRewardsCollection;
let walletsCollection;
let transactionsCollection;

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
        withdrawOrdersCollection = db.collection('withdraw_orders');
        inviteRewardsCollection = db.collection('invite_rewards');
        walletsCollection = db.collection('wallets');
        transactionsCollection = db.collection('transactions');
        
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
                withdrawRate: 0.08,
                totalCrystalSold: 0,
                totalUsdInvested: 0,
                totalWithdrawn: 0,
                totalWalletConnections: 0,
                botWalletAddress: process.env.BOT_WALLET_ADDRESS || "TL5jLrLGprWcit3dEfY4pAgzbiTpRtUK2N",
                createdAt: Date.now()
            });
        }
        
        const shopItems = await db.collection('shopItems').findOne({ _id: 'items' });
        if (!shopItems) {
            await db.collection('shopItems').insertOne({
                _id: 'items',
                energy_boost: {
                    id: 'energy_boost',
                    name: '⚡ بلورة الطاقة',
                    description: 'تزيد سعة الطاقة إلى 150 كريستالة',
                    price: 50,
                    effect: { maxEnergy: 150 },
                    emoji: '⚡'
                },
                miner_upgrade: {
                    id: 'miner_upgrade',
                    name: '⛏️ معول الكريستال الأسطوري',
                    description: 'يزيد أرباح التعدين 30%',
                    price: 120,
                    effect: { miningBonus: 1.3 },
                    emoji: '⛏️'
                }
            });
        }
        
        await walletsCollection.createIndex({ userId: 1, type: 1, status: 1 });
        await walletsCollection.createIndex({ createdAt: -1 });
        await transactionsCollection.createIndex({ fromAddress: 1, toAddress: 1, createdAt: -1 });
        await transactionsCollection.createIndex({ status: 1, createdAt: -1 });
        
        console.log('📦 قاعدة البيانات جاهزة');
        const config = await systemCollection.findOne({ _id: 'config' });
        console.log(`💰 سعر الشراء: 1 💎 = ${config.usdRate} دولار`);
        console.log(`💸 سعر السحب: 1 💎 = ${config.withdrawRate} دولار`);
        console.log(`🏦 محفظة البوت: ${config.botWalletAddress}`);
        console.log(`💳 نظام المحافظ المتكامل: مفعل`);
        return true;
    } catch (error) {
        console.error('❌ فشل الاتصال بقاعدة البيانات:', error);
        return false;
    }
}

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

async function getSystemStats() {
    try {
        const system = await systemCollection.findOne({ _id: 'config' });
        return system || {};
    } catch (error) {
        console.error('خطأ في قراءة إحصائيات النظام:', error);
        return {};
    }
}

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

async function getShopItems() {
    try {
        const items = await db.collection('shopItems').findOne({ _id: 'items' });
        return items || {};
    } catch (error) {
        console.error('خطأ في قراءة المتجر:', error);
        return {};
    }
}

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

async function getPurchase(paymentId) {
    try {
        return await purchasesCollection.findOne({ paymentId });
    } catch (error) {
        console.error('خطأ في قراءة طلب الشراء:', error);
        return null;
    }
}

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

async function saveWithdrawOrder(orderData) {
    try {
        await withdrawOrdersCollection.insertOne({
            ...orderData,
            createdAt: Date.now(),
            status: 'pending'
        });
        return true;
    } catch (error) {
        console.error('خطأ في حفظ طلب سحب:', error);
        return false;
    }
}

async function updateWithdrawOrderStatus(orderId, status) {
    try {
        await withdrawOrdersCollection.updateOne(
            { orderId },
            { $set: { status, updatedAt: Date.now() } }
        );
        return true;
    } catch (error) {
        console.error('خطأ في تحديث طلب سحب:', error);
        return false;
    }
}

async function getUserWithdrawOrders(userId) {
    try {
        return await withdrawOrdersCollection
            .find({ userId })
            .sort({ createdAt: -1 })
            .limit(20)
            .toArray();
    } catch (error) {
        console.error('خطأ في قراءة طلبات السحب:', error);
        return [];
    }
}

async function getWithdrawStats() {
    try {
        const totalOrders = await withdrawOrdersCollection.countDocuments({ status: 'completed' });
        const totalAmount = await withdrawOrdersCollection.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$crystalAmount' } } }
        ]).toArray();
        
        const totalUsd = await withdrawOrdersCollection.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$usdAmount' } } }
        ]).toArray();
        
        return {
            totalOrders: totalOrders || 0,
            totalCrystals: totalAmount[0]?.total || 0,
            totalUsd: totalUsd[0]?.total || 0
        };
    } catch (error) {
        console.error('خطأ في قراءة إحصائيات السحب:', error);
        return { totalOrders: 0, totalCrystals: 0, totalUsd: 0 };
    }
}

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

async function getUserStats(userId) {
    try {
        const user = await usersCollection.findOne({ user_id: userId });
        if (!user) return null;
        
        const totalUsers = await usersCollection.countDocuments();
        const rank = await usersCollection.countDocuments({ balance: { $gt: user.balance } }) + 1;
        
        const userBuys = await buyOrdersCollection.countDocuments({ 
            userId, 
            status: 'completed' 
        });
        
        const userBuyAmount = await buyOrdersCollection.aggregate([
            { $match: { userId, status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$crystalAmount' } } }
        ]).toArray();
        
        const userWithdraws = await withdrawOrdersCollection.countDocuments({ 
            userId, 
            status: 'completed' 
        });
        
        const userWithdrawAmount = await withdrawOrdersCollection.aggregate([
            { $match: { userId, status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$crystalAmount' } } }
        ]).toArray();
        
        return {
            rank,
            totalUsers,
            totalMines: Math.floor((user.total_mined || 0) / 1),
            upgrades: Object.keys(user.upgrades || {}).length,
            dailyStreak: user.daily_streak || 0,
            totalBuys: userBuys || 0,
            totalBought: userBuyAmount[0]?.total || 0,
            totalWithdraws: userWithdraws || 0,
            totalWithdrawn: userWithdrawAmount[0]?.total || 0
        };
    } catch (error) {
        console.error('خطأ في قراءة إحصائيات المستخدم:', error);
        return null;
    }
}

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

const ADMIN_IDS = process.env.ADMIN_USER_IDS 
    ? process.env.ADMIN_USER_IDS.split(',').map(id => parseInt(id.trim())) 
    : [];

const BOT_WALLET_ADDRESS = process.env.BOT_WALLET_ADDRESS || "TL5jLrLGprWcit3dEfY4pAgzbiTpRtUK2N";

const APP_URL = process.env.APP_URL || "https://clean-fredelia-bot199311-892fd8e8.koyeb.app";

console.log(`🔗 رابط الواجهة: ${APP_URL}`);
console.log(`🏦 محفظة البوت: ${BOT_WALLET_ADDRESS}`);

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
    const publicPaths = [
        '/api/user/me', 
        '/api/shop-items', 
        '/api/buy-stats', 
        '/api/withdraw-stats', 
        '/api/withdraw-info', 
        '/api/invite-info',
        '/api/wallets',
        '/api/bot-wallet'
    ];
    
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

let pendingPurchases = {};
let pendingBuyOrders = {};
let pendingWithdrawOrders = {};
let pendingWalletConnections = {};

bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const inviteCode = match[1];
    
    console.log(`🔄 مستخدم جديد: ${userId}`);
    console.log(`🔗 كود الدعوة: ${inviteCode || 'لا يوجد'}`);
    
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
            last_mine_click: null,
            total_mined: 0,
            miningFraction: 0,
            upgrades: {},
            daily_streak: 0,
            total_invites: 0,
            invited_by: null,
            invite_code: null,
            total_bought: 0,
            total_sold: 0,
            last_daily: null,
            last_withdraw: null,
            withdrawCooldown: 0
        };
        await saveUser(user);
    }
    
    if (inviteCode && inviteCode.startsWith('invite_')) {
        const inviterId = inviteCode.replace('invite_', '');
        
        if (inviterId !== userId) {
            const inviter = await getUser(inviterId);
            
            if (inviter) {
                console.log(`🎯 مستخدم ${userId} تمت دعوته بواسطة ${inviterId}`);
                
                await usersCollection.updateOne(
                    { user_id: userId },
                    { $set: { invited_by: inviterId } }
                );
                
                const existingReward = await inviteRewardsCollection.findOne({
                    inviterId: inviterId,
                    invitedId: userId
                });
                
                if (!existingReward) {
                    const inviteReward = {
                        inviterId: inviterId,
                        invitedId: userId,
                        invitedName: user.first_name,
                        status: 'pending',
                        createdAt: Date.now(),
                        rewardAmount: 0
                    };
                    
                    await inviteRewardsCollection.insertOne(inviteReward);
                }
                
                try {
                    await bot.sendMessage(inviterId,
                        `🎉 *مبروك! شخص جديد انضم عن طريقك!* 🎉\n\n` +
                        `👤 المستخدم: ${user.first_name}\n` +
                        `🆔 المعرف: ${userId}\n\n` +
                        `💰 *المكافأة:*\n` +
                        `• إذا قام بالإيداع: +1 💎\n` +
                        `• إذا لم يودع خلال 7 أيام: +0.3 💎\n\n` +
                        `⏳ سيتم إضافة المكافأة تلقائياً`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (e) {
                    console.error('❌ فشل إرسال إشعار للداعي:', e);
                }
                
                await usersCollection.updateOne(
                    { user_id: inviterId },
                    { $inc: { total_invites: 1 } }
                );
                
                await updateSystemStats({ totalInvites: 1 });
            }
        }
    }
    
    if (!user.invite_code) {
        const inviteCode = `invite_${userId}`;
        await usersCollection.updateOne(
            { user_id: userId },
            { $set: { invite_code: inviteCode } }
        );
    }
    
    await bot.sendMessage(chatId, 
        `💎 *مرحباً بك في مناجم الكريستال!* 💎\n\n` +
        `اهلاً ${msg.from.first_name}!\n\n` +
        `⛏️ *التعدين:* 1 كريستال كل 24 ساعة (مع الكسور)\n` +
        `💰 *الشراء:* 1 💎 = 0.10$ (USDT)\n` +
        `💸 *السحب:* 1 💎 = 0.08$ (حد أدنى 5$ - 20% يومياً)\n` +
        `💳 *نظام المحافظ المتكامل:*\n` +
        `   • محفظة دفع: للتحويل إلى محفظة البوت عند الشراء\n` +
        `   • محفظة سحب: لاستلام أرباحك من البوت\n` +
        `🏦 *محفظة البوت الرسمية:*\n` +
        `\`${BOT_WALLET_ADDRESS}\`\n\n` +
        `👥 *نظام الدعوة:*\n` +
        `• دعوة صديق = 1 💎 (إذا أودع)\n` +
        `• دعوة صديق = 0.3 💎 (إذا لم يودع)\n` +
        `• رابط الدعوة خاص بك في التبويب 👥\n\n` +
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

app.get('/api/user/:userId', async (req, res) => {
    const user = await getUser(req.params.userId);
    if (user) {
        const system = await getSystemStats();
        
        let miningCooldown = 0;
        let miningFraction = user.miningFraction || 0;
        
        if (user.last_mine_click) {
            const hoursPassed = (Date.now() - user.last_mine_click) / (1000 * 60 * 60);
            if (hoursPassed < 24) {
                miningCooldown = 24 - hoursPassed;
                miningFraction = Math.min(1, hoursPassed / 24);
            } else {
                miningFraction = 1;
            }
        }
        
        let withdrawCooldown = 0;
        if (user.last_withdraw) {
            const hoursPassed = (Date.now() - user.last_withdraw) / (1000 * 60 * 60);
            if (hoursPassed < 24) {
                withdrawCooldown = 24 - hoursPassed;
            }
        }
        
        res.json({ 
            success: true, 
            user: {
                ...user,
                usdRate: system.usdRate || 0.10,
                withdrawRate: system.withdrawRate || 0.08,
                botWallet: system.botWalletAddress || BOT_WALLET_ADDRESS,
                miningCooldown: miningCooldown,
                miningFraction: miningFraction,
                withdrawCooldown: withdrawCooldown
            }
        });
    } else {
        res.json({ success: false, error: 'مستخدم غير موجود' });
    }
});

app.get('/api/user/me', async (req, res) => {
    res.json({ username: bot.options.username });
});

app.get('/api/bot-wallet', async (req, res) => {
    const system = await getSystemStats();
    res.json({ 
        success: true, 
        address: system.botWalletAddress || BOT_WALLET_ADDRESS 
    });
});

app.post('/api/mine', async (req, res) => {
    const userId = req.telegramUser.id.toString();
    const user = await getUser(userId);
    
    if (!user) return res.json({ success: false, error: 'مستخدم غير موجود' });
    
    const now = Date.now();
    
    if (user.last_mine_click) {
        const hoursPassed = (now - user.last_mine_click) / (1000 * 60 * 60);
        if (hoursPassed < 24) {
            const remainingHours = 24 - hoursPassed;
            const remainingMinutes = Math.ceil(remainingHours * 60);
            return res.json({ 
                success: false, 
                error: 'تعدين',
                message: `⏳ انتظر ${remainingMinutes} دقيقة للتعدين مرة أخرى`,
                cooldown: remainingHours
            });
        }
    }
    
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
                total_mined: totalMined,
                miningFraction: 0
            }
        }
    );
    
    res.json({
        success: true,
        minedAmount: finalAmount.toFixed(3),
        newBalance: newBalance.toFixed(3),
        totalMined: totalMined.toFixed(3),
        message: `✅ تم التعدين! +${finalAmount.toFixed(3)} 💎`,
        cooldown: 24
    });
});

app.post('/api/buy-boost', async (req, res) => {
    const userId = req.telegramUser.id.toString();
    const { boostId, price } = req.body;
    
    const user = await getUser(userId);
    if (!user) return res.json({ success: false, error: 'مستخدم غير موجود' });
    
    let crystalAmount = 0;
    let boostName = '';
    
    switch(boostId) {
        case 'speed_1':
            crystalAmount = 1;
            boostName = 'تسريع بسيط';
            break;
        case 'speed_2':
            crystalAmount = 5;
            boostName = 'تسريع قوي';
            break;
        case 'speed_3':
            crystalAmount = 12;
            boostName = 'تسريع خارق';
            break;
        case 'speed_4':
            crystalAmount = 25;
            boostName = 'تسريع أسطوري';
            break;
        default:
            return res.json({ success: false, error: 'تسريع غير موجود' });
    }
    
    const orderId = 'BOOST_' + Date.now().toString() + userId;
    
    const orderData = {
        orderId,
        userId,
        userFirstName: user.first_name,
        boostId,
        boostName,
        usdAmount: price,
        crystalAmount,
        status: 'pending',
        createdAt: Date.now(),
        expiresAt: Date.now() + 60 * 60 * 1000
    };
    
    pendingPurchases[orderId] = orderData;
    await savePurchase(orderData);
    
    for (const adminId of ADMIN_IDS) {
        try {
            const keyboard = {
                inline_keyboard: [
                    [{ text: '✅ تأكيد شراء التسريع', callback_data: `confirm_boost_${orderId}` }],
                    [{ text: '❌ رفض الطلب', callback_data: `reject_boost_${orderId}` }]
                ]
            };
            
            await bot.sendMessage(adminId,
                `⚡ *طلب شراء تسريع جديد*\n\n` +
                `👤 المستخدم: ${user.first_name} (${userId})\n` +
                `🚀 التسريع: ${boostName}\n` +
                `💎 الكمية: +${crystalAmount} كريستال\n` +
                `💰 المبلغ: ${price} USDT\n` +
                `🏦 محفظة البوت: \`${BOT_WALLET_ADDRESS}\`\n` +
                `⏰ الوقت: ${new Date().toLocaleString('ar-EG')}\n\n` +
                `⚠️ تأكد من وصول التحويل ثم اضغط تأكيد`,
                { parse_mode: 'Markdown', reply_markup: keyboard }
            );
        } catch (e) {}
    }
    
    res.json({
        success: true,
        orderId,
        wallet: BOT_WALLET_ADDRESS,
        usdAmount: price,
        crystalAmount,
        boostName,
        expiresIn: 60
    });
});

app.post('/api/buy-crystal', async (req, res) => {
    const userId = req.telegramUser.id.toString();
    const { usdAmount } = req.body;
    
    const user = await getUser(userId);
    if (!user) {
        return res.json({ success: false, error: 'مستخدم غير موجود' });
    }
    
    const paymentWallet = await walletsCollection.findOne({
        userId: userId,
        type: 'payment',
        status: 'active'
    });
    
    if (!paymentWallet) {
        return res.json({ 
            success: false, 
            error: 'محفظة دفع',
            message: '❌ يجب ربط محفظة دفع نشطة أولاً' 
        });
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
        expiresAt: Date.now() + 60 * 60 * 1000,
        paymentWallet: {
            address: paymentWallet.address,
            wallet_name: paymentWallet.wallet_name,
            network: paymentWallet.network
        },
        botWallet: system.botWalletAddress || BOT_WALLET_ADDRESS
    };
    
    pendingBuyOrders[orderId] = orderData;
    await saveBuyOrder(orderData);
    
    setTimeout(() => {
        if (pendingBuyOrders[orderId]?.status === 'pending') {
            delete pendingBuyOrders[orderId];
        }
    }, 60 * 60 * 1000);
    
    if (user.invited_by) {
        const inviterId = user.invited_by;
        const inviter = await getUser(inviterId);
        
        if (inviter) {
            const pendingReward = await inviteRewardsCollection.findOne({
                inviterId: inviterId,
                invitedId: userId,
                status: 'pending'
            });
            
            if (pendingReward) {
                await usersCollection.updateOne(
                    { user_id: inviterId },
                    { $inc: { balance: 1 } }
                );
                
                await inviteRewardsCollection.updateOne(
                    { _id: pendingReward._id },
                    { 
                        $set: { 
                            status: 'completed',
                            completedAt: Date.now(),
                            rewardAmount: 1,
                            depositAmount: usdAmount
                        }
                    }
                );
                
                try {
                    await bot.sendMessage(inviterId,
                        `💰 *مبروك! تم إيداع من قبل الشخص الذي دعوته!* 💰\n\n` +
                        `👤 المستخدم: ${user.first_name}\n` +
                        `💵 مبلغ الإيداع: ${usdAmount} USDT\n` +
                        `🎁 *المكافأة: +1 💎*\n\n` +
                        `تم إضافتها إلى محفظتك!`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (e) {}
                
                console.log(`🎁 تم منح 1 كريستال للداعي ${inviterId} من إيداع ${userId}`);
            }
        }
    }
    
    for (const adminId of ADMIN_IDS) {
        try {
            const keyboard = {
                inline_keyboard: [
                    [{ text: '✅ تأكيد شراء كريستال', callback_data: `confirm_buy_${orderId}` }],
                    [{ text: '❌ رفض الطلب', callback_data: `reject_buy_${orderId}` }]
                ]
            };
            
            let inviteText = '';
            if (user.invited_by) {
                const inviter = await getUser(user.invited_by);
                inviteText = `👥 مدعو بواسطة: ${inviter?.first_name || user.invited_by}\n`;
            }
            
            await bot.sendMessage(adminId,
                `💰 *طلب شراء كريستال جديد*\n\n` +
                `👤 المستخدم: ${user.first_name} (${userId})\n` +
                `${inviteText}` +
                `💵 المبلغ: ${usdAmount} USDT\n` +
                `💎 كمية الكريستال: ${crystalAmount.toFixed(2)} 💎\n` +
                `💰 سعر الصرف: 1 💎 = ${usdRate} دولار\n\n` +
                `💳 *محفظة دفع المستخدم:*\n` +
                `• عنوان: \`${paymentWallet.address}\`\n` +
                `• الشبكة: ${paymentWallet.network || 'TRC20'}\n` +
                `• الاسم: ${paymentWallet.wallet_name || 'غير محدد'}\n\n` +
                `🏦 *محفظة البوت:*\n` +
                `\`${system.botWalletAddress || BOT_WALLET_ADDRESS}\`\n\n` +
                `⏰ الوقت: ${new Date().toLocaleString('ar-EG')}\n\n` +
                `⚠️ تأكد من وصول التحويل من محفظة المستخدم إلى محفظة البوت ثم اضغط تأكيد`,
                { parse_mode: 'Markdown', reply_markup: keyboard }
            );
        } catch (e) {}
    }
    
    const buyStats = await getBuyStats();
    
    res.json({
        success: true,
        orderId,
        wallet: system.botWalletAddress || BOT_WALLET_ADDRESS,
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

app.post('/api/withdraw', async (req, res) => {
    const userId = req.telegramUser.id.toString();
    const { crystalAmount } = req.body;
    
    const user = await getUser(userId);
    if (!user) {
        return res.json({ success: false, error: 'مستخدم غير موجود' });
    }
    
    const withdrawWallet = await walletsCollection.findOne({
        userId: userId,
        type: 'withdraw',
        status: 'active'
    });
    
    if (!withdrawWallet) {
        return res.json({ 
            success: false, 
            error: 'محفظة سحب',
            message: '❌ يجب ربط محفظة سحب نشطة أولاً' 
        });
    }
    
    const system = await getSystemStats();
    const usdRate = system.usdRate || 0.10;
    const withdrawRate = system.withdrawRate || 0.08;
    
    const MIN_WITHDRAW_USD = 5;
    const MAX_WITHDRAW_PERCENT = 0.20;
    
    const totalDeposits = user.total_bought || 0;
    const totalDepositsUSD = totalDeposits * usdRate;
    
    const maxDailyWithdrawUSD = totalDepositsUSD * MAX_WITHDRAW_PERCENT;
    const maxDailyWithdrawCrystals = maxDailyWithdrawUSD / withdrawRate;
    
    const requestedUSD = crystalAmount * withdrawRate;
    
    if (requestedUSD < MIN_WITHDRAW_USD) {
        const minCrystals = MIN_WITHDRAW_USD / withdrawRate;
        return res.json({
            success: false,
            error: 'حد أدنى',
            message: `⚠️ الحد الأدنى للسحب هو 5$ (≈ ${minCrystals.toFixed(0)} كريستال)`,
            minAmount: minCrystals,
            minUsd: MIN_WITHDRAW_USD
        });
    }
    
    if (requestedUSD > maxDailyWithdrawUSD) {
        return res.json({
            success: false,
            error: 'حد أقصى',
            message: `⚠️ الحد الأقصى للسحب اليومي هو 20% من رأس مالك\n` +
                     `💰 رأس مالك: ${totalDepositsUSD.toFixed(2)}$\n` +
                     `💵 أقصى مبلغ للسحب اليوم: ${maxDailyWithdrawUSD.toFixed(2)}$\n` +
                     `💎 ≈ ${maxDailyWithdrawCrystals.toFixed(0)} كريستال`,
            maxAmount: maxDailyWithdrawCrystals,
            maxUsd: maxDailyWithdrawUSD,
            totalDeposits: totalDepositsUSD
        });
    }
    
    if (user.last_withdraw) {
        const hoursPassed = (Date.now() - user.last_withdraw) / (1000 * 60 * 60);
        if (hoursPassed < 24) {
            const remainingHours = 24 - hoursPassed;
            const remainingMinutes = Math.ceil(remainingHours * 60);
            return res.json({ 
                success: false, 
                error: 'وقت',
                message: `⏳ السحب مرة واحدة كل 24 ساعة\n` +
                        `🕐 انتظر ${Math.floor(remainingHours)} ساعة و ${remainingMinutes % 60} دقيقة`,
                cooldown: remainingHours
            });
        }
    }
    
    if (user.balance < crystalAmount) {
        return res.json({ 
            success: false, 
            error: 'رصيد',
            message: `❌ رصيدك غير كافي!\n` +
                     `💰 رصيدك الحالي: ${user.balance.toFixed(2)} 💎`,
            balance: user.balance
        });
    }
    
    if (crystalAmount < 10) {
        return res.json({ 
            success: false, 
            error: 'الحد الأدنى 10 كريستال' 
        });
    }
    
    const usdAmount = crystalAmount * withdrawRate;
    const orderId = 'WITHDRAW_' + Date.now().toString() + userId;
    
    const withdrawPercent = (usdAmount / totalDepositsUSD) * 100;
    const totalWithdrawnUSD = (user.total_sold || 0) * withdrawRate;
    const remainingDeposits = totalDepositsUSD - totalWithdrawnUSD;
    
    const orderData = {
        orderId,
        userId,
        userFirstName: user.first_name,
        crystalAmount,
        usdAmount,
        usdRate: withdrawRate,
        buyRate: usdRate,
        status: 'pending',
        createdAt: Date.now(),
        expiresAt: Date.now() + 60 * 60 * 1000,
        totalDeposits: totalDepositsUSD,
        maxDailyWithdraw: maxDailyWithdrawUSD,
        withdrawPercent: withdrawPercent,
        remainingDeposits: remainingDeposits,
        withdrawWallet: {
            address: withdrawWallet.address,
            wallet_name: withdrawWallet.wallet_name,
            network: withdrawWallet.network
        }
    };
    
    pendingWithdrawOrders[orderId] = orderData;
    await saveWithdrawOrder(orderData);
    
    await usersCollection.updateOne(
        { user_id: userId },
        { 
            $inc: { 
                balance: -crystalAmount,
                total_sold: crystalAmount 
            },
            $set: { 
                last_withdraw: Date.now(),
                last_withdraw_amount: usdAmount,
                last_withdraw_crystals: crystalAmount
            }
        }
    );
    
    setTimeout(() => {
        if (pendingWithdrawOrders[orderId]?.status === 'pending') {
            usersCollection.updateOne(
                { user_id: userId },
                { $inc: { balance: crystalAmount } }
            );
            delete pendingWithdrawOrders[orderId];
        }
    }, 60 * 60 * 1000);
    
    const daysToWithdrawAll = Math.ceil(remainingDeposits / maxDailyWithdrawUSD);
    
    for (const adminId of ADMIN_IDS) {
        try {
            const keyboard = {
                inline_keyboard: [
                    [{ text: '✅ تأكيد سحب', callback_data: `confirm_withdraw_${orderId}` }],
                    [{ text: '❌ رفض', callback_data: `reject_withdraw_${orderId}` }]
                ]
            };
            
            await bot.sendMessage(adminId,
                `💰 *طلب سحب جديد - نظام 20%*\n\n` +
                `👤 *المستخدم:* ${user.first_name}\n` +
                `🆔 ID: \`${userId}\`\n\n` +
                `💎 *طلبه:*\n` +
                `• كريستال: ${crystalAmount} 💎\n` +
                `• دولار: ${usdAmount.toFixed(2)} USDT\n` +
                `• سعر السحب: 1 💎 = ${withdrawRate}$\n\n` +
                `💳 *محفظة سحب المستخدم:*\n` +
                `• عنوان: \`${withdrawWallet.address}\`\n` +
                `• الشبكة: ${withdrawWallet.network || 'TRC20'}\n` +
                `• الاسم: ${withdrawWallet.wallet_name || 'غير محدد'}\n\n` +
                `📊 *تحليل المحفظة:*\n` +
                `• 💰 إجمالي المشتريات: ${totalDepositsUSD.toFixed(2)}$\n` +
                `• 💸 إجمالي المسحوبات: ${totalWithdrawnUSD.toFixed(2)}$\n` +
                `• 💎 المتبقي للسحب: ${remainingDeposits.toFixed(2)}$\n` +
                `• 📈 نسبة هذا السحب: ${withdrawPercent.toFixed(1)}% من رأس المال\n\n` +
                `🎯 *حدود السحب:*\n` +
                `• 🔵 الحد الأقصى اليوم: ${maxDailyWithdrawUSD.toFixed(2)}$ (20%)\n` +
                `• 🟢 هذا الطلب: ${usdAmount.toFixed(2)}$\n` +
                `• ⚪ متبقي لليوم: ${(maxDailyWithdrawUSD - usdAmount).toFixed(2)}$\n\n` +
                `📅 *توقعات:*\n` +
                `• 🕐 مدة سحب الرصيد كامل: ${daysToWithdrawAll} يوم\n\n` +
                `⚠️ *يرجى تحويل المبلغ إلى عنوان محفظة المستخدم أعلاه ثم الضغط على تأكيد*`,
                { parse_mode: 'Markdown', reply_markup: keyboard }
            );
        } catch (e) {}
    }
    
    res.json({
        success: true,
        orderId,
        crystalAmount,
        usdAmount: usdAmount.toFixed(2),
        usdRate: withdrawRate,
        buyRate: usdRate,
        newBalance: (user.balance - crystalAmount).toFixed(3),
        totalSold: (user.total_sold || 0) + crystalAmount,
        walletAddress: withdrawWallet.address,
        
        smartWithdraw: {
            minWithdraw: MIN_WITHDRAW_USD,
            minCrystals: (MIN_WITHDRAW_USD / withdrawRate).toFixed(0),
            maxWithdraw: maxDailyWithdrawUSD.toFixed(2),
            maxCrystals: maxDailyWithdrawCrystals.toFixed(0),
            totalDeposits: totalDepositsUSD.toFixed(2),
            totalDepositsCrystals: totalDeposits.toFixed(0),
            totalWithdrawn: totalWithdrawnUSD.toFixed(2),
            totalWithdrawnCrystals: (user.total_sold || 0).toFixed(0),
            availableToWithdraw: remainingDeposits.toFixed(2),
            withdrawPercent: withdrawPercent.toFixed(1),
            daysRemaining: daysToWithdrawAll,
            dailyUsed: usdAmount.toFixed(2),
            dailyRemaining: (maxDailyWithdrawUSD - usdAmount).toFixed(2),
            dailyProgress: ((usdAmount / maxDailyWithdrawUSD) * 100).toFixed(0)
        }
    });
});

app.get('/api/withdraw-info/:userId', async (req, res) => {
    const userId = req.params.userId;
    const user = await getUser(userId);
    
    if (!user) {
        return res.json({ success: false });
    }
    
    const system = await getSystemStats();
    const usdRate = system.usdRate || 0.10;
    const withdrawRate = system.withdrawRate || 0.08;
    
    const MIN_WITHDRAW_USD = 5;
    const MAX_WITHDRAW_PERCENT = 0.20;
    
    const totalDeposits = user.total_bought || 0;
    const totalDepositsUSD = totalDeposits * usdRate;
    
    const totalWithdrawn = user.total_sold || 0;
    const totalWithdrawnUSD = totalWithdrawn * withdrawRate;
    
    const maxDailyWithdrawUSD = totalDepositsUSD * MAX_WITHDRAW_PERCENT;
    const maxDailyWithdrawCrystals = maxDailyWithdrawUSD / withdrawRate;
    
    const availableToWithdrawUSD = totalDepositsUSD - totalWithdrawnUSD;
    const availableToWithdrawCrystals = availableToWithdrawUSD / withdrawRate;
    
    let nextWithdrawTime = 0;
    if (user.last_withdraw) {
        nextWithdrawTime = user.last_withdraw + (24 * 60 * 60 * 1000);
    }
    
    res.json({
        success: true,
        deposits: {
            crystals: totalDeposits.toFixed(0),
            usd: totalDepositsUSD.toFixed(2)
        },
        withdrawn: {
            crystals: totalWithdrawn.toFixed(0),
            usd: totalWithdrawnUSD.toFixed(2)
        },
        available: {
            crystals: availableToWithdrawCrystals.toFixed(0),
            usd: availableToWithdrawUSD.toFixed(2),
            percent: totalDeposits > 0 ? ((availableToWithdrawUSD / totalDepositsUSD) * 100).toFixed(0) : 0
        },
        daily: {
            maxUsd: maxDailyWithdrawUSD.toFixed(2),
            maxCrystals: maxDailyWithdrawCrystals.toFixed(0),
            minUsd: MIN_WITHDRAW_USD,
            minCrystals: (MIN_WITHDRAW_USD / withdrawRate).toFixed(0)
        },
        nextWithdraw: nextWithdrawTime,
        canWithdraw: !user.last_withdraw || (Date.now() > nextWithdrawTime)
    });
});

app.get('/api/invite-info/:userId', async (req, res) => {
    const userId = req.params.userId;
    const user = await getUser(userId);
    
    if (!user) {
        return res.json({ success: false });
    }
    
    const totalInvites = user.total_invites || 0;
    
    const rewards = await inviteRewardsCollection.find({
        inviterId: userId,
        status: { $in: ['completed', 'partial'] }
    }).toArray();
    
    const totalRewards = rewards.reduce((sum, reward) => sum + (reward.rewardAmount || 0), 0);
    
    const recentInvites = await inviteRewardsCollection.find({
        inviterId: userId
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .toArray();
    
    res.json({
        success: true,
        totalInvites,
        totalRewards,
        recentInvites: recentInvites.map(invite => ({
            invitedName: invite.invitedName,
            status: invite.status,
            rewardAmount: invite.rewardAmount,
            createdAt: invite.createdAt,
            depositAmount: invite.depositAmount
        }))
    });
});

app.get('/api/wallets/:userId', async (req, res) => {
    const userId = req.params.userId;
    
    try {
        const paymentWallet = await walletsCollection.findOne({
            userId: userId,
            type: 'payment',
            status: 'active'
        });
        
        const withdrawWallet = await walletsCollection.findOne({
            userId: userId,
            type: 'withdraw',
            status: 'active'
        });
        
        const paymentPending = await walletsCollection.findOne({
            userId: userId,
            type: 'payment',
            status: 'pending'
        });
        
        const withdrawPending = await walletsCollection.findOne({
            userId: userId,
            type: 'withdraw',
            status: 'pending'
        });
        
        const history = await walletsCollection.find({ 
            userId: userId 
        })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray();
        
        const cleanHistory = history.map(({ _id, ...item }) => item);
        
        res.json({ 
            success: true, 
            paymentWallet: paymentWallet || paymentPending || null,
            withdrawWallet: withdrawWallet || withdrawPending || null,
            history: cleanHistory
        });
    } catch (error) {
        console.error('خطأ في قراءة المحافظ:', error);
        res.json({ success: false, error: 'فشل في قراءة المحافظ' });
    }
});

app.post('/api/wallet/connect', async (req, res) => {
    const userId = req.telegramUser.id.toString();
    const { type, address, walletName, network } = req.body;
    
    if (!address || address.length < 30) {
        return res.json({ success: false, error: 'عنوان محفظة غير صالح' });
    }
    
    if (!type || !['payment', 'withdraw'].includes(type)) {
        return res.json({ success: false, error: 'نوع محفظة غير صالح' });
    }
    
    try {
        await walletsCollection.updateMany(
            { userId: userId, type: type, status: 'active' },
            { $set: { status: 'replaced', updatedAt: Date.now() } }
        );
        
        await walletsCollection.updateMany(
            { userId: userId, type: type, status: 'pending' },
            { $set: { status: 'replaced', updatedAt: Date.now() } }
        );
        
        const walletData = {
            userId: userId,
            type: type,
            address: address,
            wallet_name: walletName || (type === 'payment' ? 'محفظة دفع' : 'محفظة سحب'),
            network: network || 'TRC20',
            status: 'pending',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        
        await walletsCollection.insertOne(walletData);
        
        await updateSystemStats({ totalWalletConnections: 1 });
        
        const user = await getUser(userId);
        const system = await getSystemStats();
        
        const connectionId = 'WALLET_' + Date.now().toString() + userId;
        pendingWalletConnections[connectionId] = {
            userId,
            type,
            address,
            walletName: walletData.wallet_name,
            network,
            userFirstName: user?.first_name || userId
        };
        
        setTimeout(() => {
            delete pendingWalletConnections[connectionId];
        }, 24 * 60 * 60 * 1000);
        
        for (const adminId of ADMIN_IDS) {
            try {
                const keyboard = {
                    inline_keyboard: [
                        [{ text: '✅ قبول المحفظة', callback_data: `approve_wallet_${connectionId}` }],
                        [{ text: '❌ رفض المحفظة', callback_data: `reject_wallet_${connectionId}` }]
                    ]
                };
                
                const walletTypeText = type === 'payment' ? '💵 محفظة دفع' : '💰 محفظة سحب';
                
                await bot.sendMessage(adminId,
                    `💳 *طلب ربط ${walletTypeText} جديد*\n\n` +
                    `👤 المستخدم: ${user?.first_name || userId}\n` +
                    `🆔 ID: \`${userId}\`\n\n` +
                    `📱 *معلومات المحفظة:*\n` +
                    `• عنوان: \`${address}\`\n` +
                    `• الشبكة: ${network || 'TRC20'}\n` +
                    `• الاسم: ${walletData.wallet_name}\n\n` +
                    `🏦 *محفظة البوت:*\n` +
                    `\`${system.botWalletAddress || BOT_WALLET_ADDRESS}\`\n\n` +
                    `⏰ الوقت: ${new Date().toLocaleString('ar-EG')}\n\n` +
                    `⚠️ تأكد من صحة العنوان قبل القبول`,
                    { parse_mode: 'Markdown', reply_markup: keyboard }
                );
            } catch (e) {}
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في ربط المحفظة:', error);
        res.json({ success: false, error: 'فشل في ربط المحفظة' });
    }
});

app.post('/api/wallet/disconnect', async (req, res) => {
    const userId = req.telegramUser.id.toString();
    const { type } = req.body;
    
    if (!type || !['payment', 'withdraw'].includes(type)) {
        return res.json({ success: false, error: 'نوع محفظة غير صالح' });
    }
    
    try {
        await walletsCollection.updateMany(
            { userId: userId, type: type, status: 'active' },
            { $set: { status: 'disconnected', updatedAt: Date.now() } }
        );
        
        await walletsCollection.updateMany(
            { userId: userId, type: type, status: 'pending' },
            { $set: { status: 'disconnected', updatedAt: Date.now() } }
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في فصل المحفظة:', error);
        res.json({ success: false, error: 'فشل في فصل المحفظة' });
    }
});

app.post('/api/admin/confirm-transaction', async (req, res) => {
    if (!isAdmin(req.telegramUser?.id)) {
        return res.status(403).json({ success: false, error: 'غير مصرح' });
    }
    
    const { txHash, fromAddress, toAddress, amount, userId, orderId } = req.body;
    
    try {
        const transaction = {
            txHash,
            fromAddress,
            toAddress,
            amount,
            userId,
            orderId,
            confirmedBy: req.telegramUser.id,
            confirmedAt: Date.now(),
            status: 'confirmed'
        };
        
        await transactionsCollection.insertOne(transaction);
        
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في تأكيد المعاملة:', error);
        res.json({ success: false, error: 'فشل في تأكيد المعاملة' });
    }
});

app.get('/api/buy-stats', async (req, res) => {
    const stats = await getBuyStats();
    res.json({ success: true, stats });
});

app.get('/api/withdraw-stats', async (req, res) => {
    const stats = await getWithdrawStats();
    res.json({ success: true, stats });
});

app.get('/api/user-orders/:userId', async (req, res) => {
    const userId = req.params.userId;
    const buyOrders = await getUserBuyOrders(userId);
    res.json({
        success: true,
        buyOrders: buyOrders.map(o => ({ ...o, _id: undefined }))
    });
});

app.get('/api/user-withdraws/:userId', async (req, res) => {
    const userId = req.params.userId;
    const withdrawOrders = await getUserWithdrawOrders(userId);
    res.json({
        success: true,
        withdraws: withdrawOrders.map(o => ({ ...o, _id: undefined }))
    });
});

app.get('/api/payment-status/:paymentId', async (req, res) => {
    const payment = pendingPurchases[req.params.paymentId];
    if (payment) {
        res.json({
            success: true,
            status: payment.status,
            currency: 'USDT',
            amount: payment.usdAmount
        });
    } else {
        const savedPayment = await getPurchase(req.params.paymentId);
        if (savedPayment) {
            res.json({
                success: true,
                status: savedPayment.status,
                currency: 'USDT',
                amount: savedPayment.usdAmount
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
        usdRate: system.usdRate || 0.10,
        withdrawRate: system.withdrawRate || 0.08,
        botWallet: system.botWalletAddress || BOT_WALLET_ADDRESS
    });
});

app.get('/', (req, res) => {
    res.redirect('/app.html');
});

function isAdmin(userId) {
    return ADMIN_IDS.includes(Number(userId));
}

async function processPendingInvites() {
    try {
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        
        const pendingRewards = await inviteRewardsCollection.find({
            status: 'pending',
            createdAt: { $lt: sevenDaysAgo }
        }).toArray();
        
        console.log(`📊 معالجة ${pendingRewards.length} دعوة معلقة...`);
        
        for (const reward of pendingRewards) {
            await usersCollection.updateOne(
                { user_id: reward.inviterId },
                { $inc: { balance: 0.3 } }
            );
            
            await inviteRewardsCollection.updateOne(
                { _id: reward._id },
                { 
                    $set: { 
                        status: 'partial',
                        completedAt: Date.now(),
                        rewardAmount: 0.3,
                        reason: 'لم يودع خلال 7 أيام'
                    }
                }
            );
            
            try {
                await bot.sendMessage(reward.inviterId,
                    `⏳ *مكافأة دعوة محدودة* ⏳\n\n` +
                    `👤 المستخدم: ${reward.invitedName}\n` +
                    `❌ لم يقم بالإيداع خلال 7 أيام\n` +
                    `🎁 *المكافأة الجزئية: +0.3 💎*\n\n` +
                    `تم إضافتها إلى محفظتك!`,
                    { parse_mode: 'Markdown' }
                );
            } catch (e) {}
            
            console.log(`🎁 تم منح 0.3 كريستال للداعي ${reward.inviterId} (لم يودع المدعو)`);
        }
    } catch (error) {
        console.error('❌ خطأ في معالجة الدعوات المعلقة:', error);
    }
}

setInterval(processPendingInvites, 60 * 60 * 1000);
setTimeout(processPendingInvites, 10 * 1000);

bot.on('callback_query', async (callbackQuery) => {
    const message = callbackQuery.message;
    const data = callbackQuery.data;
    const adminId = callbackQuery.from.id;
    const chatId = message.chat.id;
    
    if (!isAdmin(adminId)) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ غير مصرح', show_alert: true });
        return;
    }
    
    await bot.answerCallbackQuery(callbackQuery.id);
    
    if (data.startsWith('approve_wallet_')) {
        const connectionId = data.replace('approve_wallet_', '');
        const connection = pendingWalletConnections[connectionId];
        
        if (!connection) {
            await bot.sendMessage(chatId, '❌ طلب ربط المحفظة منتهي الصلاحية');
            return;
        }
        
        try {
            await walletsCollection.updateOne(
                { 
                    userId: connection.userId, 
                    type: connection.type,
                    address: connection.address,
                    status: 'pending'
                },
                { 
                    $set: { 
                        status: 'active', 
                        approvedAt: Date.now(), 
                        approvedBy: adminId 
                    } 
                }
            );
            
            await walletsCollection.updateMany(
                { 
                    userId: connection.userId, 
                    type: connection.type, 
                    status: { $ne: 'active' } 
                },
                { $set: { status: 'replaced' } }
            );
            
            const walletTypeText = connection.type === 'payment' ? '💵 محفظة الدفع' : '💰 محفظة السحب';
            
            try {
                await bot.sendMessage(connection.userId,
                    `✅ *تمت الموافقة على ${walletTypeText}!* ✅\n\n` +
                    `📱 المحفظة: \`${connection.address.substring(0, 10)}...${connection.address.substring(connection.address.length - 8)}\`\n` +
                    `🌐 الشبكة: ${connection.network || 'TRC20'}\n\n` +
                    `${
                        connection.type === 'payment' 
                            ? '💵 يمكنك الآن شراء الكريستال باستخدام هذه المحفظة' 
                            : '💰 يمكنك الآن سحب أرباحك إلى هذه المحفظة'
                    }`,
                    { parse_mode: 'Markdown' }
                );
            } catch (e) {}
            
            await bot.sendMessage(chatId, 
                `✅ تم قبول ${walletTypeText} للمستخدم ${connection.userFirstName || connection.userId}`,
                { parse_mode: 'Markdown' }
            );
            
            delete pendingWalletConnections[connectionId];
        } catch (error) {
            console.error('خطأ في قبول المحفظة:', error);
            await bot.sendMessage(chatId, '❌ فشل في قبول المحفظة');
        }
    }
    
    else if (data.startsWith('reject_wallet_')) {
        const connectionId = data.replace('reject_wallet_', '');
        const connection = pendingWalletConnections[connectionId];
        
        if (connection) {
            try {
                await walletsCollection.updateMany(
                    { 
                        userId: connection.userId, 
                        type: connection.type,
                        status: 'pending' 
                    },
                    { $set: { status: 'rejected', rejectedAt: Date.now(), rejectedBy: adminId } }
                );
                
                const walletTypeText = connection.type === 'payment' ? 'محفظة الدفع' : 'محفظة السحب';
                
                try {
                    await bot.sendMessage(connection.userId,
                        `❌ *تم رفض طلب ربط ${walletTypeText}*\n\n` +
                        `يرجى التأكد من صحة عنوان المحفظة والمحاولة مرة أخرى.`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (e) {}
                
                await bot.sendMessage(chatId, 
                    `✅ تم رفض ${walletTypeText} للمستخدم ${connection.userFirstName || connection.userId}`
                );
                
                delete pendingWalletConnections[connectionId];
            } catch (error) {
                await bot.sendMessage(chatId, '❌ فشل في رفض المحفظة');
            }
        } else {
            await bot.sendMessage(chatId, '❌ طلب ربط المحفظة غير موجود');
        }
    }
    
    else if (data.startsWith('confirm_buy_')) {
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
                `💵 المبلغ المدفوع: ${order.usdAmount} USDT\n\n` +
                `شكراً لثقتك بمناجم الكريستال! ⛏️`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) {}
        
        const buyStats = await getBuyStats();
        await bot.sendMessage(chatId, 
            `✅ *تم تأكيد شراء الكريستال*\n\n` +
            `👤 المستخدم: ${order.userFirstName}\n` +
            `💎 الكمية: ${order.crystalAmount.toFixed(2)}\n` +
            `💵 المبلغ: ${order.usdAmount} USDT\n` +
            `💳 من محفظة: \`${order.paymentWallet?.address || 'غير محدد'}\`\n` +
            `🏦 إلى محفظة البوت: \`${order.botWallet}\`\n\n` +
            `📊 *إجمالي المال الداخل للبوت:*\n` +
            `💰 ${buyStats.totalUsd.toFixed(2)} USDT`,
            { parse_mode: 'Markdown' }
        );
        
        delete pendingBuyOrders[orderId];
    }
    
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
    
    else if (data.startsWith('confirm_withdraw_')) {
        const orderId = data.replace('confirm_withdraw_', '');
        const order = pendingWithdrawOrders[orderId];
        
        if (!order) {
            await bot.sendMessage(chatId, '❌ الطلب منتهي الصلاحية');
            return;
        }
        
        await usersCollection.updateOne(
            { user_id: order.userId },
            { $inc: { total_sold: order.crystalAmount } }
        );
        
        await updateSystemStats({ 
            totalWithdrawn: order.usdAmount
        });
        
        await updateWithdrawOrderStatus(orderId, 'completed');
        order.status = 'completed';
        
        try {
            await bot.sendMessage(order.userId,
                `💰 *تم سحب الأرباح بنجاح!* 💰\n\n` +
                `✅ تم بيع ${order.crystalAmount} 💎\n` +
                `💵 المبلغ المستلم: ${order.usdAmount.toFixed(2)} USDT\n` +
                `💳 تم التحويل إلى محفظتك:\n` +
                `\`${order.withdrawWallet?.address || 'غير محدد'}\`\n\n` +
                `شكراً لاستخدامك مناجم الكريستال! ⛏️`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) {}
        
        const withdrawStats = await getWithdrawStats();
        const buyStats = await getBuyStats();
        
        await bot.sendMessage(chatId, 
            `✅ *تم تأكيد سحب الأرباح*\n\n` +
            `👤 المستخدم: ${order.userFirstName}\n` +
            `💎 الكمية: ${order.crystalAmount}\n` +
            `💵 المبلغ: ${order.usdAmount.toFixed(2)} USDT\n` +
            `💳 إلى محفظة: \`${order.withdrawWallet?.address || 'غير محدد'}\`\n\n` +
            `📊 *إحصائيات البوت:*\n` +
            `💰 إجمالي الودائع: ${buyStats.totalUsd.toFixed(2)} USDT\n` +
            `💸 إجمالي المسحوبات: ${withdrawStats.totalUsd.toFixed(2)} USDT\n` +
            `💎 الرصيد المتاح: ${(buyStats.totalUsd - withdrawStats.totalUsd).toFixed(2)} USDT`,
            { parse_mode: 'Markdown' }
        );
        
        delete pendingWithdrawOrders[orderId];
    }
    
    else if (data.startsWith('reject_withdraw_')) {
        const orderId = data.replace('reject_withdraw_', '');
        const order = pendingWithdrawOrders[orderId];
        
        if (order) {
            await usersCollection.updateOne(
                { user_id: order.userId },
                { $inc: { balance: order.crystalAmount } }
            );
            
            await updateWithdrawOrderStatus(orderId, 'rejected');
            
            try {
                await bot.sendMessage(order.userId,
                    `❌ *تم رفض طلب سحب الأرباح*\n\n` +
                    `تم إرجاع ${order.crystalAmount} 💎 إلى محفظتك.`,
                    { parse_mode: 'Markdown' }
                );
            } catch (e) {}
            
            delete pendingWithdrawOrders[orderId];
        }
        
        await bot.sendMessage(chatId, '❌ تم رفض طلب السحب');
    }
    
    else if (data.startsWith('confirm_boost_')) {
        const orderId = data.replace('confirm_boost_', '');
        const order = pendingPurchases[orderId];
        
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
            totalUsdInvested: order.usdAmount,
            shopRevenue: order.usdAmount
        });
        
        await updatePurchaseStatus(orderId, 'completed');
        order.status = 'completed';
        
        try {
            await bot.sendMessage(order.userId,
                `⚡ *تم شراء التسريع بنجاح!* ⚡\n\n` +
                `✅ تم تفعيل *${order.boostName}*\n` +
                `💎 تم إضافة +${order.crystalAmount} كريستال إلى محفظتك!\n` +
                `💰 المبلغ: ${order.usdAmount} USDT\n\n` +
                `استمتع بالتعدين الأسرع! ⛏️`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) {}
        
        const buyStats = await getBuyStats();
        await bot.sendMessage(chatId, 
            `✅ *تم تأكيد شراء التسريع*\n\n` +
            `👤 المستخدم: ${order.userFirstName}\n` +
            `🚀 التسريع: ${order.boostName}\n` +
            `💎 الكمية: +${order.crystalAmount}\n` +
            `💵 المبلغ: ${order.usdAmount} USDT\n\n` +
            `📊 إجمالي المال الداخل: ${buyStats.totalUsd.toFixed(2)} USDT`,
            { parse_mode: 'Markdown' }
        );
        
        delete pendingPurchases[orderId];
    }
    
    else if (data.startsWith('reject_boost_')) {
        const orderId = data.replace('reject_boost_', '');
        const order = pendingPurchases[orderId];
        
        if (order) {
            order.status = 'rejected';
            await updatePurchaseStatus(orderId, 'rejected');
            
            try {
                await bot.sendMessage(order.userId,
                    `❌ *تم رفض طلب شراء التسريع*\n\n` +
                    `للأسف، لم يتم تأكيد وصول التحويل.\n` +
                    `يمكنك المحاولة مرة أخرى.`,
                    { parse_mode: 'Markdown' }
                );
            } catch (e) {}
            
            delete pendingPurchases[orderId];
        }
        
        await bot.sendMessage(chatId, '❌ تم رفض المعاملة');
    }
});

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
    const pendingWithdraws = Object.keys(pendingWithdrawOrders).length;
    const pendingBoosts = Object.values(pendingPurchases).filter(p => p.status === 'pending').length;
    const pendingWallets = Object.keys(pendingWalletConnections).length;
    
    const paymentWalletsActive = await walletsCollection.countDocuments({ type: 'payment', status: 'active' });
    const withdrawWalletsActive = await walletsCollection.countDocuments({ type: 'withdraw', status: 'active' });
    const paymentWalletsPending = await walletsCollection.countDocuments({ type: 'payment', status: 'pending' });
    const withdrawWalletsPending = await walletsCollection.countDocuments({ type: 'withdraw', status: 'pending' });
    
    const buyStats = await getBuyStats();
    const withdrawStats = await getWithdrawStats();
    
    const totalInvites = await inviteRewardsCollection.countDocuments({ status: 'completed' });
    const totalInviteRewards = await inviteRewardsCollection.aggregate([
        { $match: { status: { $in: ['completed', 'partial'] } } },
        { $group: { _id: null, total: { $sum: '$rewardAmount' } } }
    ]).toArray();
    
    const message = 
        `👑 *لوحة تحكم الأدمن - مناجم الكريستال* 👑\n\n` +
        `📊 *إحصائيات عامة:*\n` +
        `• 👥 المستخدمون: ${totalUsers}\n` +
        `• 💎 إجمالي الكريستال المباع: ${buyStats.totalCrystals.toFixed(2)} 💎\n` +
        `• 💰 إجمالي المال الداخل للبوت: ${buyStats.totalUsd.toFixed(2)} USDT\n` +
        `• 💸 إجمالي المسحوبات: ${withdrawStats.totalUsd.toFixed(2)} USDT\n` +
        `• 💎 الرصيد المتاح: ${(buyStats.totalUsd - withdrawStats.totalUsd).toFixed(2)} USDT\n` +
        `• 🏪 إيرادات المتجر: ${(system.shopRevenue || 0).toFixed(2)} 💎\n` +
        `• 👥 مكافآت الدعوات: ${(totalInviteRewards[0]?.total || 0).toFixed(1)} 💎\n\n` +
        `🏦 *محفظة البوت:*\n` +
        `\`${system.botWalletAddress || BOT_WALLET_ADDRESS}\`\n\n` +
        `💳 *إحصائيات المحافظ:*\n` +
        `• 💵 محافظ دفع نشطة: ${paymentWalletsActive}\n` +
        `• 💰 محافظ سحب نشطة: ${withdrawWalletsActive}\n` +
        `• ⏳ في انتظار المراجعة: ${paymentWalletsPending + withdrawWalletsPending}\n\n` +
        `⏳ *طلبات معلقة:*\n` +
        `• 💵 شراء كريستال: ${pendingBuys}\n` +
        `• 💰 سحب أرباح: ${pendingWithdraws}\n` +
        `• ⚡ تسريع: ${pendingBoosts}\n` +
        `• 💳 ربط محافظ: ${pendingWallets}\n\n` +
        `💰 *سعر الصرف:*\n` +
        `• 💵 شراء: 1 💎 = ${system.usdRate || 0.10} دولار\n` +
        `• 💸 سحب: 1 💎 = ${system.withdrawRate || 0.08} دولار\n\n` +
        `🔧 *نظام التعدين:* 1 كريستال كل 24 ساعة (مع الكسور)\n` +
        `💸 *نظام السحب:* مرة واحدة كل 24 ساعة - 20% من رأس المال - حد أدنى 5$\n` +
        `💳 *نظام المحافظ:* ربط محافظ دفع وسحب - مراجعة يدوية\n` +
        `👥 *نظام الدعوة:* 1💎 (إيداع) / 0.3💎 (لا إيداع)`;
    
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

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
    const system = await getSystemStats();
    
    const upgradesList = Object.keys(targetUser.upgrades || {}).length > 0 
        ? Object.keys(targetUser.upgrades).join(', ') 
        : 'لا يوجد';
    
    const userBuys = await buyOrdersCollection.countDocuments({ 
        userId: targetUser.user_id, 
        status: 'completed' 
    });
    
    const userWithdraws = await withdrawOrdersCollection.countDocuments({ 
        userId: targetUser.user_id, 
        status: 'completed' 
    });
    
    const totalDeposits = targetUser.total_bought || 0;
    const totalDepositsUSD = totalDeposits * (system.usdRate || 0.10);
    const totalWithdrawnUSD = (targetUser.total_sold || 0) * (system.withdrawRate || 0.08);
    const availableToWithdraw = totalDepositsUSD - totalWithdrawnUSD;
    const maxDailyWithdraw = totalDepositsUSD * 0.20;
    
    const userInvites = await inviteRewardsCollection.find({
        inviterId: targetUser.user_id
    }).toArray();
    
    const completedInvites = userInvites.filter(i => i.status === 'completed').length;
    const partialInvites = userInvites.filter(i => i.status === 'partial').length;
    const pendingInvites = userInvites.filter(i => i.status === 'pending').length;
    const totalInviteRewards = userInvites.reduce((sum, i) => sum + (i.rewardAmount || 0), 0);
    
    const paymentWallet = await walletsCollection.findOne({ 
        userId: targetUser.user_id, 
        type: 'payment',
        status: 'active' 
    });
    
    const withdrawWallet = await walletsCollection.findOne({ 
        userId: targetUser.user_id, 
        type: 'withdraw',
        status: 'active' 
    });
    
    const paymentPending = await walletsCollection.findOne({ 
        userId: targetUser.user_id, 
        type: 'payment',
        status: 'pending' 
    });
    
    const withdrawPending = await walletsCollection.findOne({ 
        userId: targetUser.user_id, 
        type: 'withdraw',
        status: 'pending' 
    });
    
    let paymentWalletStatus = 'غير مرتبطة';
    let paymentWalletAddress = '';
    if (paymentWallet) {
        paymentWalletStatus = '✅ نشطة';
        paymentWalletAddress = paymentWallet.address;
    } else if (paymentPending) {
        paymentWalletStatus = '⏳ قيد المراجعة';
        paymentWalletAddress = paymentPending.address;
    }
    
    let withdrawWalletStatus = 'غير مرتبطة';
    let withdrawWalletAddress = '';
    if (withdrawWallet) {
        withdrawWalletStatus = '✅ نشطة';
        withdrawWalletAddress = withdrawWallet.address;
    } else if (withdrawPending) {
        withdrawWalletStatus = '⏳ قيد المراجعة';
        withdrawWalletAddress = withdrawPending.address;
    }
    
    let withdrawStatus = 'متاح';
    if (targetUser.last_withdraw) {
        const hoursPassed = (Date.now() - targetUser.last_withdraw) / (1000 * 60 * 60);
        if (hoursPassed < 24) {
            const remainingHours = 24 - hoursPassed;
            withdrawStatus = `⏳ متبقي ${Math.ceil(remainingHours)} ساعة`;
        }
    }
    
    let paymentWalletInfo = '';
    if (paymentWalletAddress) {
        paymentWalletInfo = `💳 محفظة دفع: \`${paymentWalletAddress.substring(0, 10)}...${paymentWalletAddress.substring(paymentWalletAddress.length - 8)}\`\n`;
    }
    
    let withdrawWalletInfo = '';
    if (withdrawWalletAddress) {
        withdrawWalletInfo = `💳 محفظة سحب: \`${withdrawWalletAddress.substring(0, 10)}...${withdrawWalletAddress.substring(withdrawWalletAddress.length - 8)}\`\n`;
    }
    
    await bot.sendMessage(chatId,
        `👤 *ملف المنقب*\n\n` +
        `🆔 المعرف: \`${targetUser.user_id}\`\n` +
        `📛 الاسم: ${targetUser.first_name}\n` +
        `👤 اليوزر: @${targetUser.username || 'لا يوجد'}\n` +
        `💰 رصيد الكريستال: ${targetUser.balance.toFixed(3)} 💎\n` +
        `💵 قيمة الرصيد: ${(targetUser.balance * (system.withdrawRate || 0.08)).toFixed(2)}$\n` +
        `⚡ الطاقة: ${targetUser.energy}/${targetUser.maxEnergy || 100}\n` +
        `🏆 الترتيب: #${rank} من ${totalUsers}\n\n` +
        `📊 *إحصائيات التعدين:*\n` +
        `• ⛏️ إجمالي التعدين: ${(targetUser.total_mined || 0).toFixed(3)} 💎\n` +
        `• 🔥 السلسلة اليومية: ${targetUser.daily_streak || 0}\n\n` +
        `📊 *إحصائيات التداول:*\n` +
        `• 💵 رأس المال المستثمر: ${totalDepositsUSD.toFixed(2)}$ (${totalDeposits} 💎)\n` +
        `• 💰 مسحوب سابقاً: ${totalWithdrawnUSD.toFixed(2)}$ (${targetUser.total_sold || 0} 💎)\n` +
        `• 💎 متبقي للسحب: ${availableToWithdraw.toFixed(2)}$\n` +
        `• 📈 الحد اليومي: ${maxDailyWithdraw.toFixed(2)}$ (20%)\n` +
        `• 💸 حالة السحب: ${withdrawStatus}\n\n` +
        `💳 *المحافظ:*\n` +
        `• 💵 محفظة دفع: ${paymentWalletStatus}\n` +
        `${paymentWalletInfo}` +
        `• 💰 محفظة سحب: ${withdrawWalletStatus}\n` +
        `${withdrawWalletInfo}` +
        `\n👥 *إحصائيات الدعوة:*\n` +
        `• 📊 إجمالي الدعوات: ${userInvites.length}\n` +
        `• ✅ أودعوا: ${completedInvites}\n` +
        `• ⏳ لم يودعوا: ${partialInvites}\n` +
        `• 🕒 في الانتظار: ${pendingInvites}\n` +
        `• 🎁 إجمالي المكافآت: ${totalInviteRewards.toFixed(1)} 💎\n\n` +
        `🛒 الترقيات: ${upgradesList}\n` +
        `📅 تاريخ الانضمام: ${new Date(targetUser.created_at).toLocaleDateString('ar-EG')}`,
        { parse_mode: 'Markdown' }
    );
});

async function startServer() {
    const connected = await connectToMongo();
    if (!connected) {
        console.error('❌ فشل الاتصال بقاعدة البيانات. تأكد من MONGODB_URI');
        process.exit(1);
    }
    
    app.listen(PORT, () => {
        console.log('\n===========================================');
        console.log(`🌐 خادم الويب يعمل على المنفذ: ${PORT}`);
        console.log(`🔗 رابط الواجهة: ${APP_URL}`);
        console.log(`🏦 محفظة البوت: ${BOT_WALLET_ADDRESS}`);
        console.log(`⛏️ نظام التعدين: 1 كريستال كل 24 ساعة (مع الكسور)`);
        console.log(`💰 نظام شراء الكريستال: USDT فقط - 1💎 = 0.10$`);
        console.log(`💸 نظام السحب الذكي:`);
        console.log(`   • سعر السحب: 1💎 = 0.08$`);
        console.log(`   • حد أدنى: 5$`);
        console.log(`   • حد أقصى يومي: 20% من رأس المال`);
        console.log(`   • مرة واحدة كل 24 ساعة`);
        console.log(`💳 نظام المحافظ المتكامل:`);
        console.log(`   • 💵 محفظة دفع: للشراء والتحويل إلى محفظة البوت`);
        console.log(`   • 💰 محفظة سحب: لاستلام الأرباح`);
        console.log(`   • مراجعة يدوية من الأدمن`);
        console.log(`   • ربط محفظة واحدة لكل نوع`);
        console.log(`👥 نظام الدعوة:`);
        console.log(`   • إذا أودع المدعو: +1 💎`);
        console.log(`   • إذا لم يودع: +0.3 💎 (بعد 7 أيام)`);
        console.log(`👮 نظام الأدمن اليدوي: مفعل`);
        console.log('===========================================\n');
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

console.log('🚀 بوت مناجم الكريستال - الإصدار 11.0');
console.log('📱 افتح تليجرام وأرسل /start');
console.log('👑 لوحة الأدمن: /admin');
console.log('⛏️ تعدين: 1 كريستال كل 24 ساعة مع الكسور التراكمية');
console.log('💰 شراء: 1 💎 = 0.10$');
console.log('💸 سحب: 1 💎 = 0.08$');
console.log('📊 نظام السحب الذكي: 20% يومياً - حد أدنى 5$');
console.log('💳 نظام المحافظ المتكامل:');
console.log('   • 💵 محفظة دفع - للشراء');
console.log('   • 💰 محفظة سحب - للأرباح');
console.log('👥 نظام الدعوة: 1💎 (إيداع) / 0.3💎 (لا إيداع)');
console.log('⚡ تسريع: شراء كريستال فوري بالدولار');
