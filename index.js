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
let starInvoicesCollection;

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
        starInvoicesCollection = db.collection('star_invoices');
        
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
                starRate: 0.1,
                withdrawRate: 0.08,
                totalCrystalSold: 0,
                totalStarsInvested: 0,
                totalWithdrawn: 0,
                totalWalletConnections: 0,
                botWalletAddress: process.env.BOT_WALLET_ADDRESS || "",
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
        
        await starInvoicesCollection.createIndex({ payload: 1 }, { unique: true });
        await starInvoicesCollection.createIndex({ userId: 1, createdAt: -1 });
        await starInvoicesCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        
        console.log('📦 قاعدة البيانات جاهزة');
        const config = await systemCollection.findOne({ _id: 'config' });
        console.log(`⭐ سعر الصرف: 10 نجوم = 1 💎`);
        console.log(`💸 سعر السحب: 1 💎 = 0.08$`);
        console.log(`🤖 نظام نجوم تليجرام: مفعل`);
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
            .project({ first_name: 1, balance: 1, user_id: 1, _id: 0 })
            .toArray();
    } catch (error) {
        console.error('خطأ في قراءة أفضل المستخدمين:', error);
        return [];
    }
}

async function getStarPurchaseStats() {
    try {
        const totalOrders = await starInvoicesCollection.countDocuments({ status: 'completed' });
        const totalStars = await starInvoicesCollection.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$starAmount' } } }
        ]).toArray();
        
        const totalCrystals = await starInvoicesCollection.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$crystalAmount' } } }
        ]).toArray();
        
        return {
            totalOrders: totalOrders || 0,
            totalStars: totalStars[0]?.total || 0,
            totalCrystals: totalCrystals[0]?.total || 0
        };
    } catch (error) {
        console.error('خطأ في قراءة إحصائيات شراء النجوم:', error);
        return { totalOrders: 0, totalStars: 0, totalCrystals: 0 };
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

const APP_URL = process.env.APP_URL || "https://clean-fredelia-bot199311-892fd8e8.koyeb.app";

console.log(`🔗 رابط الواجهة: ${APP_URL}`);
console.log(`⭐ نظام دفع نجوم تليجرام: مفعل`);

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
        '/api/star-stats',
        '/api/telegram-webhook',
        '/api/top',
        '/api/receipt'
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
        `⭐ *الشراء:* 10 نجوم = 1 💎\n` +
        `💰 *الدفع:* نجوم تليجرام - آمن وفوري\n` +
        `💸 *السحب:* 1 💎 = 0.08$ (USDT) - حد أدنى 5$\n\n` +
        `🔒 *الشفافية:*\n` +
        `• جميع مشترياتك مسجلة في قاعدة بيانات البوت\n` +
        `• يمكنك طلب شهادة دفع لأي عملية مكتملة\n` +
        `• معاملاتك موثقة بمعرف فريد من تليجرام\n\n` +
        `👥 *نظام الدعوة:*\n` +
        `• دعوة صديق = 1 💎 (إذا اشترى)\n` +
        `• دعوة صديق = 0.3 💎 (إذا لم يشتري)\n\n` +
        `✨ *ميزة جديدة:* شهادات الدفع الرقمية متاحة الآن!\n` +
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

bot.onText(/\/setupwebhook/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!ADMIN_IDS.includes(userId)) {
        await bot.sendMessage(chatId, '❌ غير مصرح');
        return;
    }
    
    const webhookUrl = `${APP_URL}/api/telegram-webhook`;
    
    try {
        const response = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    url: webhookUrl,
                    allowed_updates: ['pre_checkout_query', 'message']
                })
            }
        );
        
        const data = await response.json();
        if (data.ok) {
            await bot.sendMessage(chatId, `✅ تم تفعيل Webhook بنجاح!\n🔗 ${webhookUrl}`);
            await bot.deleteWebHook();
        } else {
            await bot.sendMessage(chatId, `❌ خطأ: ${data.description}`);
        }
    } catch (error) {
        await bot.sendMessage(chatId, `❌ فشل: ${error.message}`);
    }
});

bot.onText(/\/balance/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!ADMIN_IDS.includes(userId)) {
        await bot.sendMessage(chatId, '❌ غير مصرح');
        return;
    }
    
    try {
        const response = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/getStarBalance`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }
        );
        
        const data = await response.json();
        if (data.ok) {
            const starStats = await getStarPurchaseStats();
            await bot.sendMessage(chatId,
                `⭐ *رصيد البوت من النجوم*\n\n` +
                `💰 الرصيد الحالي: ${data.result.balance} ⭐\n` +
                `📊 إجمالي المبيعات: ${starStats.totalStars} ⭐\n` +
                `💎 كريستال مباع: ${starStats.totalCrystals.toFixed(1)} 💎\n` +
                `🔄 آخر تحديث: ${new Date().toLocaleString('ar-EG')}`,
                { parse_mode: 'Markdown' }
            );
        } else {
            await bot.sendMessage(chatId, `❌ فشل: ${data.description}`);
        }
    } catch (error) {
        await bot.sendMessage(chatId, `❌ خطأ: ${error.message}`);
    }
});

app.get('/api/receipt/:orderId', async (req, res) => {
    const orderId = req.params.orderId;
    
    try {
        const order = await starInvoicesCollection.findOne({ 
            payload: orderId,
            status: 'completed'
        });
        
        if (!order) {
            return res.json({ success: false, error: 'المعاملة غير موجودة' });
        }
        
        const user = await getUser(order.userId);
        
        const receipt = {
            transaction_id: order.payload,
            date: order.completedAt || order.createdAt,
            user_id: order.userId,
            user_name: user?.first_name || 'مستخدم',
            stars_paid: order.starAmount,
            crystals_received: order.crystalAmount,
            rate: '10 ⭐ = 1 💎',
            status: 'مكتمل',
            bot_name: 'كريستال التعدين',
            bot_username: bot.options.username,
            verified_by: 'Telegram Stars API',
            blockchain_verified: false,
            refund_policy: 'حسب سياسة تليجرام'
        };
        
        res.json({ success: true, receipt });
    } catch (error) {
        console.error('خطأ في جلب شهادة الدفع:', error);
        res.json({ success: false, error: 'فشل في جلب الشهادة' });
    }
});

app.post('/api/telegram-webhook', async (req, res) => {
    const update = req.body;
    
    if (update.pre_checkout_query) {
        const queryId = update.pre_checkout_query.id;
        const payload = update.pre_checkout_query.invoice_payload;
        
        try {
            await fetch(
                `https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        pre_checkout_query_id: queryId,
                        ok: true
                    })
                }
            );
            console.log(`✅ تأكيد دفع مبدئي: ${payload}`);
        } catch (error) {
            console.error('❌ خطأ في تأكيد الدفع:', error);
        }
        
        return res.json({ ok: true });
    }
    
    if (update.message?.successful_payment) {
        const payload = update.message.successful_payment.invoice_payload;
        const starAmount = update.message.successful_payment.total_amount;
        const currency = update.message.successful_payment.currency;
        const chatId = update.message.chat.id;
        
        console.log(`💰 دفع ناجح!`, { payload, starAmount, currency });
        
        try {
            const invoice = await starInvoicesCollection.findOne({ payload });
            
            if (invoice && invoice.status === 'pending') {
                const crystalAmount = invoice.crystalAmount;
                const userId = invoice.userId;
                
                await usersCollection.updateOne(
                    { user_id: userId },
                    { 
                        $inc: { 
                            balance: crystalAmount,
                            total_bought: crystalAmount 
                        } 
                    }
                );
                
                await starInvoicesCollection.updateOne(
                    { payload },
                    { 
                        $set: { 
                            status: 'completed',
                            completedAt: Date.now(),
                            chatId: chatId
                        } 
                    }
                );
                
                await updateSystemStats({ 
                    totalStarsInvested: starAmount,
                    totalCrystalSold: crystalAmount 
                });
                
                try {
                    await bot.sendMessage(
                        userId,
                        `✅ *تم شراء الكريستال بنجاح!*\n\n` +
                        `💎 الكمية: ${crystalAmount.toFixed(1)} كريستال\n` +
                        `⭐ الدفع: ${starAmount} نجوم\n` +
                        `📦 الحالة: مكتمل\n` +
                        `🔗 معرف المعاملة: \`${payload}\`\n\n` +
                        `📄 يمكنك طلب شهادة الدفع من صفحة "مشترياتي السابقة"\n\n` +
                        `شكراً لاستخدامك نجوم تليجرام! 🚀`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (e) {
                    console.error('❌ فشل إرسال رسالة التأكيد:', e);
                }
                
                if (user?.invited_by) {
                    const pendingReward = await inviteRewardsCollection.findOne({
                        inviterId: user.invited_by,
                        invitedId: userId,
                        status: 'pending'
                    });
                    
                    if (pendingReward) {
                        await usersCollection.updateOne(
                            { user_id: user.invited_by },
                            { $inc: { balance: 1 } }
                        );
                        
                        await inviteRewardsCollection.updateOne(
                            { _id: pendingReward._id },
                            { 
                                $set: { 
                                    status: 'completed',
                                    completedAt: Date.now(),
                                    rewardAmount: 1,
                                    depositAmount: starAmount
                                }
                            }
                        );
                        
                        try {
                            await bot.sendMessage(user.invited_by,
                                `💰 *مبروك! تم إيداع من قبل الشخص الذي دعوته!* 💰\n\n` +
                                `👤 المستخدم: ${user.first_name}\n` +
                                `⭐ مبلغ الإيداع: ${starAmount} نجوم\n` +
                                `🎁 *المكافأة: +1 💎*\n\n` +
                                `تم إضافتها إلى محفظتك!`,
                                { parse_mode: 'Markdown' }
                            );
                        } catch (e) {}
                    }
                }
                
                console.log(`✅ تم صرف ${crystalAmount} كريستال للمستخدم ${userId}`);
            }
        } catch (error) {
            console.error('❌ خطأ في معالجة الدفع الناجح:', error);
        }
        
        return res.json({ ok: true });
    }
    
    res.json({ ok: true });
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
                starRate: system.starRate || 0.1,
                withdrawRate: system.withdrawRate || 0.08,
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

app.post('/api/buy-with-stars', async (req, res) => {
    const userId = req.telegramUser.id.toString();
    const { starAmount } = req.body;
    
    const user = await getUser(userId);
    if (!user) {
        return res.json({ success: false, error: 'مستخدم غير موجود' });
    }
    
    if (!starAmount || starAmount < 5) {
        return res.json({ 
            success: false, 
            error: 'الحد الأدنى 5 نجوم' 
        });
    }
    
    if (starAmount > 2500) {
        return res.json({ 
            success: false, 
            error: 'الحد الأقصى 2500 نجوم' 
        });
    }
    
    const invoice = await createStarInvoice(
        userId, 
        starAmount, 
        `💎 شراء ${(starAmount * 0.1).toFixed(1)} كريستال`
    );
    
    if (invoice.success) {
        res.json({
            success: true,
            invoiceUrl: invoice.url,
            payload: invoice.payload,
            starAmount: starAmount,
            crystalAmount: invoice.crystalAmount.toFixed(1)
        });
    } else {
        res.json({
            success: false,
            error: invoice.error || 'فشل إنشاء الفاتورة'
        });
    }
});

async function createStarInvoice(userId, starAmount, description = "💎 شراء كريستال") {
    const user = await getUser(userId);
    const system = await getSystemStats();
    const starRate = system.starRate || 0.1;
    
    const payload = `${userId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const crystalAmount = starAmount * starRate;
    
    const params = {
        title: "💎 كريستال التعدين",
        description: description,
        payload: payload,
        provider_token: "",
        currency: "XTR",
        prices: [
            {
                label: `${starAmount} ⭐ = ${crystalAmount.toFixed(1)} 💎`,
                amount: starAmount
            }
        ],
        photo_url: "https://cdn.jsdelivr.net/gh/telegram-js/telegram-web-app@gh-pages/img/icon-192.png"
    };

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            }
        );

        const data = await response.json();
        if (data.ok) {
            await starInvoicesCollection.insertOne({
                payload: payload,
                userId: userId,
                userFirstName: user?.first_name || 'مستخدم',
                starAmount: starAmount,
                crystalAmount: crystalAmount,
                status: 'pending',
                createdAt: Date.now(),
                expiresAt: Date.now() + 24 * 60 * 60 * 1000
            });
            
            return { success: true, url: data.result, payload, crystalAmount };
        } else {
            return { success: false, error: data.description };
        }
    } catch (error) {
        console.error('خطأ في إنشاء فاتورة النجوم:', error);
        return { success: false, error: error.message };
    }
}

app.get('/api/star-stats', async (req, res) => {
    const stats = await getStarPurchaseStats();
    res.json({ success: true, stats });
});

app.get('/api/star-orders/:userId', async (req, res) => {
    const userId = req.params.userId;
    
    try {
        const orders = await starInvoicesCollection
            .find({ userId })
            .sort({ createdAt: -1 })
            .limit(20)
            .toArray();
        
        const cleanOrders = orders.map(({ _id, ...order }) => order);
        res.json({ success: true, orders: cleanOrders });
    } catch (error) {
        console.error('خطأ في قراءة طلبات النجوم:', error);
        res.json({ success: false, orders: [] });
    }
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
            message: '❌ يجب ربط محفظة USDT نشطة أولاً' 
        });
    }
    
    const system = await getSystemStats();
    const withdrawRate = system.withdrawRate || 0.08;
    
    const MIN_WITHDRAW_USD = 5;
    const MAX_WITHDRAW_PERCENT = 0.20;
    
    const totalDeposits = user.total_bought || 0;
    const totalDepositsUSD = totalDeposits * 0.1;
    
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
    
    const totalWithdrawnUSD = (user.total_sold || 0) * withdrawRate;
    const remainingDeposits = totalDepositsUSD - totalWithdrawnUSD;
    
    const orderData = {
        orderId,
        userId,
        userFirstName: user.first_name,
        crystalAmount,
        usdAmount,
        usdRate: withdrawRate,
        status: 'pending',
        createdAt: Date.now(),
        expiresAt: Date.now() + 60 * 60 * 1000,
        totalDeposits: totalDepositsUSD,
        maxDailyWithdraw: maxDailyWithdrawUSD,
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
    
    for (const adminId of ADMIN_IDS) {
        try {
            const keyboard = {
                inline_keyboard: [
                    [{ text: '✅ تأكيد سحب', callback_data: `confirm_withdraw_${orderId}` }],
                    [{ text: '❌ رفض', callback_data: `reject_withdraw_${orderId}` }]
                ]
            };
            
            await bot.sendMessage(adminId,
                `💰 *طلب سحب جديد - USDT*\n\n` +
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
                `⚠️ *يرجى تحويل المبلغ إلى عنوان المحفظة أعلاه ثم الضغط على تأكيد*`,
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
        newBalance: (user.balance - crystalAmount).toFixed(3),
        walletAddress: withdrawWallet.address
    });
});

app.get('/api/withdraw-info/:userId', async (req, res) => {
    const userId = req.params.userId;
    const user = await getUser(userId);
    
    if (!user) {
        return res.json({ success: false });
    }
    
    const system = await getSystemStats();
    const withdrawRate = system.withdrawRate || 0.08;
    
    const MIN_WITHDRAW_USD = 5;
    const MAX_WITHDRAW_PERCENT = 0.20;
    
    const totalDeposits = user.total_bought || 0;
    const totalDepositsUSD = totalDeposits * 0.1;
    
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

app.get('/api/wallets/:userId', async (req, res) => {
    const userId = req.params.userId;
    
    try {
        const withdrawWallet = await walletsCollection.findOne({
            userId: userId,
            type: 'withdraw',
            status: 'active'
        });
        
        const withdrawPending = await walletsCollection.findOne({
            userId: userId,
            type: 'withdraw',
            status: 'pending'
        });
        
        const history = await walletsCollection.find({ 
            userId: userId,
            type: 'withdraw'
        })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray();
        
        const cleanHistory = history.map(({ _id, ...item }) => item);
        
        res.json({ 
            success: true, 
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
    
    if (type !== 'withdraw') {
        return res.json({ success: false, error: 'نوع محفظة غير صالح' });
    }
    
    if (!address || address.length < 30) {
        return res.json({ success: false, error: 'عنوان محفظة غير صالح' });
    }
    
    try {
        await walletsCollection.updateMany(
            { userId: userId, type: 'withdraw', status: 'active' },
            { $set: { status: 'replaced', updatedAt: Date.now() } }
        );
        
        await walletsCollection.updateMany(
            { userId: userId, type: 'withdraw', status: 'pending' },
            { $set: { status: 'replaced', updatedAt: Date.now() } }
        );
        
        const walletData = {
            userId: userId,
            type: 'withdraw',
            address: address,
            wallet_name: walletName || 'محفظة سحب',
            network: network || 'TRC20',
            status: 'pending',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        
        await walletsCollection.insertOne(walletData);
        
        await updateSystemStats({ totalWalletConnections: 1 });
        
        const user = await getUser(userId);
        
        const connectionId = 'WALLET_' + Date.now().toString() + userId;
        pendingWalletConnections[connectionId] = {
            userId,
            address,
            walletName: walletData.wallet_name,
            network,
            userFirstName: user?.first_name || userId
        };
        
        setTimeout(() => {
            delete pendingWalletConnections[connectionId];
        }, 7 * 24 * 60 * 60 * 1000);
        
        for (const adminId of ADMIN_IDS) {
            try {
                const keyboard = {
                    inline_keyboard: [
                        [{ text: '✅ قبول المحفظة', callback_data: `approve_wallet_${connectionId}` }],
                        [{ text: '❌ رفض المحفظة', callback_data: `reject_wallet_${connectionId}` }]
                    ]
                };
                
                await bot.sendMessage(adminId,
                    `💳 *طلب ربط محفظة سحب USDT جديد*\n\n` +
                    `👤 المستخدم: ${user?.first_name || userId}\n` +
                    `🆔 ID: \`${userId}\`\n\n` +
                    `📱 *معلومات المحفظة:*\n` +
                    `• عنوان: \`${address}\`\n` +
                    `• الشبكة: ${network || 'TRC20'}\n` +
                    `• الاسم: ${walletData.wallet_name}\n\n` +
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
    
    try {
        await walletsCollection.updateMany(
            { userId: userId, type: 'withdraw', status: 'active' },
            { $set: { status: 'disconnected', updatedAt: Date.now() } }
        );
        
        await walletsCollection.updateMany(
            { userId: userId, type: 'withdraw', status: 'pending' },
            { $set: { status: 'disconnected', updatedAt: Date.now() } }
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في فصل المحفظة:', error);
        res.json({ success: false, error: 'فشل في فصل المحفظة' });
    }
});

app.get('/api/wallet-history/:userId', async (req, res) => {
    const userId = req.params.userId;
    
    try {
        const history = await walletsCollection.find({ 
            userId: userId,
            type: 'withdraw'
        })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray();
        
        const cleanHistory = history.map(({ _id, ...item }) => item);
        
        res.json({ success: true, history: cleanHistory });
    } catch (error) {
        console.error('خطأ في قراءة سجل المحافظ:', error);
        res.json({ success: false, history: [] });
    }
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

app.get('/api/withdraw-stats', async (req, res) => {
    const stats = await getWithdrawStats();
    res.json({ success: true, stats });
});

app.get('/api/user-withdraws/:userId', async (req, res) => {
    const userId = req.params.userId;
    const withdrawOrders = await getUserWithdrawOrders(userId);
    res.json({
        success: true,
        withdraws: withdrawOrders.map(o => ({ ...o, _id: undefined }))
    });
});

app.get('/api/top', async (req, res) => {
    const topUsers = await getTopUsers(10);
    res.json({ success: true, topUsers });
});

app.get('/api/shop-items', async (req, res) => {
    const items = await getShopItems();
    const system = await getSystemStats();
    const starStats = await getStarPurchaseStats();
    
    res.json({ 
        success: true, 
        items,
        starRate: system.starRate || 0.1,
        withdrawRate: system.withdrawRate || 0.08,
        starStats: {
            totalOrders: starStats.totalOrders,
            totalStars: starStats.totalStars,
            totalCrystals: starStats.totalCrystals
        }
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
                    type: 'withdraw',
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
                    type: 'withdraw', 
                    status: { $ne: 'active' } 
                },
                { $set: { status: 'replaced' } }
            );
            
            try {
                await bot.sendMessage(connection.userId,
                    `✅ *تمت الموافقة على محفظة السحب!* ✅\n\n` +
                    `📱 المحفظة: \`${connection.address.substring(0, 10)}...${connection.address.substring(connection.address.length - 8)}\`\n` +
                    `🌐 الشبكة: ${connection.network || 'TRC20'}\n\n` +
                    `💰 يمكنك الآن سحب أرباحك إلى هذه المحفظة`,
                    { parse_mode: 'Markdown' }
                );
            } catch (e) {}
            
            await bot.sendMessage(chatId, 
                `✅ تم قبول محفظة السحب للمستخدم ${connection.userFirstName || connection.userId}`
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
                        type: 'withdraw',
                        status: 'pending' 
                    },
                    { $set: { status: 'rejected', rejectedAt: Date.now(), rejectedBy: adminId } }
                );
                
                try {
                    await bot.sendMessage(connection.userId,
                        `❌ *تم رفض طلب ربط محفظة السحب*\n\n` +
                        `يرجى التأكد من صحة عنوان المحفظة والمحاولة مرة أخرى.`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (e) {}
                
                await bot.sendMessage(chatId, 
                    `✅ تم رفض محفظة السحب للمستخدم ${connection.userFirstName || connection.userId}`
                );
                
                delete pendingWalletConnections[connectionId];
            } catch (error) {
                await bot.sendMessage(chatId, '❌ فشل في رفض المحفظة');
            }
        } else {
            await bot.sendMessage(chatId, '❌ طلب ربط المحفظة غير موجود');
        }
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
        const starStats = await getStarPurchaseStats();
        
        await bot.sendMessage(chatId, 
            `✅ *تم تأكيد سحب الأرباح*\n\n` +
            `👤 المستخدم: ${order.userFirstName}\n` +
            `💎 الكمية: ${order.crystalAmount}\n` +
            `💵 المبلغ: ${order.usdAmount.toFixed(2)} USDT\n` +
            `💳 إلى محفظة: \`${order.withdrawWallet?.address || 'غير محدد'}\`\n\n` +
            `📊 *إحصائيات البوت:*\n` +
            `⭐ إجمالي نجوم المشتريات: ${starStats.totalStars}\n` +
            `💰 إجمالي المسحوبات: ${withdrawStats.totalUsd.toFixed(2)} USDT`,
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
    const pendingWithdraws = Object.keys(pendingWithdrawOrders).length;
    const pendingWallets = Object.keys(pendingWalletConnections).length;
    
    const withdrawWalletsActive = await walletsCollection.countDocuments({ type: 'withdraw', status: 'active' });
    const withdrawWalletsPending = await walletsCollection.countDocuments({ type: 'withdraw', status: 'pending' });
    
    const withdrawStats = await getWithdrawStats();
    const starStats = await getStarPurchaseStats();
    
    const totalInvites = await inviteRewardsCollection.countDocuments({ status: 'completed' });
    const totalInviteRewards = await inviteRewardsCollection.aggregate([
        { $match: { status: { $in: ['completed', 'partial'] } } },
        { $group: { _id: null, total: { $sum: '$rewardAmount' } } }
    ]).toArray();
    
    let starBalance = 'غير معروف';
    try {
        const response = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/getStarBalance`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }
        );
        const data = await response.json();
        if (data.ok) {
            starBalance = data.result.balance;
        }
    } catch (e) {}
    
    const message = 
        `👑 *لوحة تحكم الأدمن - مناجم الكريستال* 👑\n\n` +
        `📊 *إحصائيات عامة:*\n` +
        `• 👥 المستخدمون: ${totalUsers}\n` +
        `• ⭐ رصيد البوت من النجوم: ${starBalance} ⭐\n` +
        `• 💰 إجمالي مبيعات النجوم: ${starStats.totalStars} ⭐\n` +
        `• 💎 إجمالي الكريستال المباع: ${starStats.totalCrystals.toFixed(1)} 💎\n` +
        `• 💸 إجمالي المسحوبات USDT: ${withdrawStats.totalUsd.toFixed(2)} $\n` +
        `• 👥 مكافآت الدعوات: ${(totalInviteRewards[0]?.total || 0).toFixed(1)} 💎\n\n` +
        `💳 *إحصائيات محافظ السحب:*\n` +
        `• ✅ محافظ نشطة: ${withdrawWalletsActive}\n` +
        `• ⏳ في انتظار المراجعة: ${withdrawWalletsPending}\n\n` +
        `⏳ *طلبات معلقة:*\n` +
        `• 💰 سحب USDT: ${pendingWithdraws}\n` +
        `• 💳 ربط محافظ: ${pendingWallets}\n\n` +
        `💰 *سعر الصرف:*\n` +
        `• ⭐ شراء: 10 نجوم = 1 💎\n` +
        `• 💸 سحب: 1 💎 = ${system.withdrawRate || 0.08} USDT\n\n` +
        `🔧 *نظام التعدين:* 1 كريستال كل 24 ساعة (مع الكسور)\n` +
        `💸 *نظام السحب:* USDT - حد أدنى 5$ - 20% يومياً\n` +
        `⭐ *نظام الدفع:* نجوم تليجرام - فوري وآمن\n` +
        `📄 *شهادات الدفع:* متاحة للمستخدمين\n` +
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
    
    const starOrders = await starInvoicesCollection.countDocuments({ 
        userId: targetUser.user_id, 
        status: 'completed' 
    });
    
    const starAmount = await starInvoicesCollection.aggregate([
        { $match: { userId: targetUser.user_id, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$starAmount' } } }
    ]).toArray();
    
    const userWithdraws = await withdrawOrdersCollection.countDocuments({ 
        userId: targetUser.user_id, 
        status: 'completed' 
    });
    
    const totalDeposits = targetUser.total_bought || 0;
    const totalDepositsUSD = totalDeposits * 0.1;
    const totalWithdrawnUSD = (targetUser.total_sold || 0) * (system.withdrawRate || 0.08);
    const availableToWithdraw = totalDepositsUSD - totalWithdrawnUSD;
    const maxDailyWithdraw = totalDepositsUSD * 0.20;
    
    const withdrawWallet = await walletsCollection.findOne({ 
        userId: targetUser.user_id, 
        type: 'withdraw',
        status: 'active' 
    });
    
    const withdrawPending = await walletsCollection.findOne({ 
        userId: targetUser.user_id, 
        type: 'withdraw',
        status: 'pending' 
    });
    
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
        `• ⭐ مشتريات بالنجوم: ${starOrders} (${(starAmount[0]?.total || 0)} ⭐)\n` +
        `• 💵 رأس المال المستثمر: ${totalDepositsUSD.toFixed(2)}$\n` +
        `• 💰 مسحوب سابقاً USDT: ${totalWithdrawnUSD.toFixed(2)}$\n` +
        `• 💎 متبقي للسحب: ${availableToWithdraw.toFixed(2)}$\n` +
        `• 📈 الحد اليومي: ${maxDailyWithdraw.toFixed(2)}$ (20%)\n` +
        `• 💸 حالة السحب: ${withdrawStatus}\n\n` +
        `💳 *محفظة السحب USDT:*\n` +
        `• الحالة: ${withdrawWalletStatus}\n` +
        `${withdrawWalletAddress ? `• العنوان: \`${withdrawWalletAddress.substring(0, 10)}...${withdrawWalletAddress.substring(withdrawWalletAddress.length - 8)}\`\n` : ''}` +
        `\n🛒 الترقيات: ${upgradesList}\n` +
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
        console.log(`⭐ نظام دفع نجوم تليجرام: مفعل`);
        console.log(`📄 نظام شهادات الدفع: مفعل`);
        console.log(`⛏️ نظام التعدين: 1 كريستال كل 24 ساعة (مع الكسور)`);
        console.log(`💰 نظام الشراء: 10 نجوم = 1 💎`);
        console.log(`💸 نظام السحب: USDT - 1💎 = 0.08$`);
        console.log(`   • حد أدنى: 5$`);
        console.log(`   • حد أقصى يومي: 20% من رأس المال`);
        console.log(`   • مرة واحدة كل 24 ساعة`);
        console.log(`💳 نظام محافظ السحب: USDT - TRC20`);
        console.log(`👥 نظام الدعوة: 1💎 (إيداع) / 0.3💎 (لا إيداع)`);
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

console.log('🚀 بوت مناجم الكريستال - الإصدار 13.0');
console.log('📱 افتح تليجرام وأرسل /start');
console.log('👑 لوحة الأدمن: /admin');
console.log('⭐ نظام الدفع: نجوم تليجرام - 10 ⭐ = 1 💎');
console.log('📄 شهادات الدفع: متاحة لجميع المشتريات');
console.log('⛏️ تعدين: 1 كريستال كل 24 ساعة مع الكسور التراكمية');
console.log('💰 شراء: 10 نجوم = 1 كريستال');
console.log('💸 سحب: 1 💎 = 0.08$ USDT');
console.log('💳 نظام محافظ السحب: USDT (TRC20)');
console.log('👥 نظام الدعوة: 1💎 (إيداع) / 0.3💎 (لا إيداع)');
console.log('⚡ تسريع: شراء كريستال فوري بالنجوم');
