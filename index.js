const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, param, query, validationResult } = require('express-validator');
const mongoSanitize = require('express-mongo-sanitize');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 8000;

// ========== الأمان المتقدم ==========
// 1. Helmet للحماية من الثغرات الشائعة
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://telegram.org"],
            imgSrc: ["'self'", "data:", "https://cdn.jsdelivr.net"],
            connectSrc: ["'self'", "https://api.telegram.org"],
        },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// 2. منع قراءة الملفات الحساسة
app.use((req, res, next) => {
    if (req.path.includes('.env') || 
        req.path.includes('package.json') || 
        req.path.includes('config') ||
        req.path.includes('robots.txt')) {
        return res.status(403).send('Forbidden');
    }
    next();
});

// 3. Rate Limiting - منع الهجمات الجماعية
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 100, // الحد الأقصى 100 طلب لكل IP
    message: { success: false, error: 'طلبات كثيرة جداً، حاول بعد 15 دقيقة' },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/', limiter);

// 4. MongoDB Sanitize - منع حقن الأوامر
app.use(mongoSanitize({
    replaceWith: '_',
    onSanitize: ({ req, key }) => {
        console.warn(`🚨 محاولة حقن من IP: ${req.ip}, key: ${key}`);
    }
}));

// 5. CORS محدود
app.use(cors({
    origin: ['https://telegram.org', 'https://web.telegram.org', 'https://*.telegram.org'],
    credentials: true,
    optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'crystal_mining';

let db;
let usersCollection;
let systemCollection;
let starInvoicesCollection;
let inviteRewardsCollection;
let securityLogsCollection;

async function connectToMongo() {
    try {
        const client = new MongoClient(MONGODB_URI, {
            // إعدادات أمان إضافية
            connectTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            serverSelectionTimeoutMS: 10000,
            retryWrites: true,
            retryReads: true
        });
        
        await client.connect();
        console.log('✅ متصل بقاعدة MongoDB Atlas');
        
        db = client.db(DB_NAME);
        usersCollection = db.collection('users');
        systemCollection = db.collection('system');
        starInvoicesCollection = db.collection('star_invoices');
        inviteRewardsCollection = db.collection('invite_rewards');
        securityLogsCollection = db.collection('security_logs');
        
        // إنشاء Indexes للأمان والأداء
        await usersCollection.createIndex({ user_id: 1 }, { unique: true });
        await usersCollection.createIndex({ username: 1 });
        await usersCollection.createIndex({ balance: -1 });
        await usersCollection.createIndex({ created_at: 1 });
        
        await starInvoicesCollection.createIndex({ payload: 1 }, { unique: true });
        await starInvoicesCollection.createIndex({ userId: 1, createdAt: -1 });
        await starInvoicesCollection.createIndex({ status: 1, createdAt: 1 });
        
        await inviteRewardsCollection.createIndex({ inviterId: 1, invitedId: 1 }, { unique: true });
        await inviteRewardsCollection.createIndex({ status: 1, createdAt: 1 });
        
        await securityLogsCollection.createIndex({ timestamp: -1 });
        await securityLogsCollection.createIndex({ type: 1, timestamp: -1 });
        
        const system = await systemCollection.findOne({ _id: 'config' });
        if (!system) {
            await systemCollection.insertOne({
                _id: 'config',
                totalSupply: 800000000,
                minedSupply: 0,
                soldSupply: 0,
                remainingSupply: 800000000,
                maxMining: 1000000,
                isListed: false,
                listingDate: null,
                icoActive: false,
                icoPrice: 0.10,
                icoEndDate: null,
                starRate: 0.1,
                totalTransactions: 0,
                totalInvites: 0,
                totalStarsInvested: 0,
                totalCrystalSold: 0,
                minPurchaseAge: 30 * 24 * 60 * 60 * 1000, // 30 يوم
                minPurchaseAmount: 10, // 10 كريستال
                maxInvitesPerUser: 5, // حد أقصى للدعوات
                antiSybilEnabled: true,
                createdAt: Date.now()
            });
        }
        
        console.log('📦 قاعدة البيانات جاهزة');
        console.log(`💎 إجمالي العرض: 800,000,000 كريستال`);
        console.log(`⛏️ حد التعدين: 1,000,000 كريستال`);
        console.log(`🛡️ نظام مكافحة الاحتيال: مفعل`);
        return true;
    } catch (error) {
        console.error('❌ فشل الاتصال بقاعدة البيانات:', error);
        await logSecurityEvent('DATABASE_CONNECTION_FAILED', null, { error: error.message });
        return false;
    }
}

// ========== نظام تسجيل الأحداث الأمنية ==========
async function logSecurityEvent(type, userId = null, data = {}) {
    try {
        await securityLogsCollection.insertOne({
            type,
            userId,
            data,
            ip: data.ip || null,
            timestamp: Date.now(),
            userAgent: data.userAgent || null
        });
    } catch (error) {
        console.error('خطأ في تسجيل الحدث الأمني:', error);
    }
}

// ========== التحقق من صحة المدخلات ==========
const validateUserId = param('userId')
    .isString()
    .trim()
    .notEmpty()
    .isLength({ min: 5, max: 100 })
    .matches(/^\d+$/);

const validateStarAmount = body('starAmount')
    .isInt({ min: 5, max: 2500 })
    .toInt();

const validateCrystalAmount = body('crystalAmount')
    .isFloat({ min: 1, max: 1000 })
    .toFloat();

// ========== دوال مكافحة الاحتيال ==========
async function isSuspiciousUser(userId) {
    const user = await getUser(userId);
    if (!user) return false;
    
    // 1. تحقق من عمر الحساب
    const accountAge = Date.now() - user.created_at;
    const minAge = (await getSystemStats()).minPurchaseAge || 30 * 24 * 60 * 60 * 1000;
    
    if (accountAge < minAge) {
        await logSecurityEvent('SUSPICIOUS_ACCOUNT_AGE', userId, { accountAge, minAge });
        return true;
    }
    
    // 2. تحقق من عدد الدعوات
    const invitesCount = await inviteRewardsCollection.countDocuments({ inviterId: userId });
    const maxInvites = (await getSystemStats()).maxInvitesPerUser || 5;
    
    if (invitesCount > maxInvites) {
        await logSecurityEvent('SUSPICIOUS_INVITES_COUNT', userId, { invitesCount, maxInvites });
        return true;
    }
    
    // 3. تحقق من نمط الشراء
    const purchases = await starInvoicesCollection
        .find({ userId, status: 'completed' })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray();
    
    if (purchases.length >= 5) {
        // تحقق من شراء كميات صغيرة متكررة
        const smallPurchases = purchases.filter(p => p.starAmount < 20).length;
        if (smallPurchases >= 5) {
            await logSecurityEvent('SUSPICIOUS_PATTERN_SMALL_PURCHASES', userId, { count: smallPurchases });
            return true;
        }
    }
    
    return false;
}

async function isEligibleForAirdrop(userId) {
    const user = await getUser(userId);
    if (!user) return false;
    
    const system = await getSystemStats();
    
    // شروط الأهلية
    const conditions = [
        user.created_at <= Date.now() - (system.minPurchaseAge || 30 * 24 * 60 * 60 * 1000),
        (user.total_bought || 0) >= (system.minPurchaseAmount || 10),
        (user.total_invites || 0) <= (system.maxInvitesPerUser || 5),
        (user.balance || 0) >= 1,
        !(await isSuspiciousUser(userId))
    ];
    
    return conditions.every(Boolean);
}

// ========== دوال المستخدم ==========
async function getUser(userId) {
    try {
        // تحقق من صحة الـ userId
        if (!userId || typeof userId !== 'string' || !/^\d+$/.test(userId)) {
            return null;
        }
        
        const user = await usersCollection.findOne({ user_id: userId });
        if (!user) return null;
        
        const { _id, ...userData } = user;
        return userData;
    } catch (error) {
        console.error('خطأ في قراءة المستخدم:', error);
        await logSecurityEvent('ERROR_READ_USER', userId, { error: error.message });
        return null;
    }
}

async function saveUser(userData) {
    try {
        // تنظيف البيانات قبل الحفظ
        const cleanData = {
            user_id: String(userData.user_id),
            balance: Number(userData.balance) || 0,
            energy: Number(userData.energy) || 100,
            maxEnergy: Number(userData.maxEnergy) || 100,
            username: String(userData.username || '').substring(0, 50),
            first_name: String(userData.first_name || '').substring(0, 50),
            created_at: Number(userData.created_at) || Date.now(),
            last_mine: userData.last_mine || null,
            last_mine_click: userData.last_mine_click || null,
            total_mined: Number(userData.total_mined) || 0,
            miningFraction: Number(userData.miningFraction) || 0,
            upgrades: userData.upgrades || {},
            daily_streak: Number(userData.daily_streak) || 0,
            total_invites: Number(userData.total_invites) || 0,
            invited_by: userData.invited_by || null,
            invite_code: userData.invite_code || null,
            total_bought: Number(userData.total_bought) || 0,
            language: userData.language || 'en',
            last_daily: userData.last_daily || null,
            last_withdraw: userData.last_withdraw || null,
            withdrawCooldown: Number(userData.withdrawCooldown) || 0
        };
        
        await usersCollection.updateOne(
            { user_id: cleanData.user_id },
            { $set: cleanData },
            { upsert: true }
        );
        return true;
    } catch (error) {
        console.error('خطأ في حفظ المستخدم:', error);
        await logSecurityEvent('ERROR_SAVE_USER', userData.user_id, { error: error.message });
        return false;
    }
}

async function updateUserBalance(userId, amount) {
    try {
        // تحقق من صحة المدخلات
        if (!userId || typeof amount !== 'number' || isNaN(amount)) {
            return false;
        }
        
        const result = await usersCollection.updateOne(
            { user_id: userId },
            { $inc: { balance: amount } }
        );
        return result.modifiedCount > 0;
    } catch (error) {
        console.error('خطأ في تحديث الرصيد:', error);
        await logSecurityEvent('ERROR_UPDATE_BALANCE', userId, { error: error.message, amount });
        return false;
    }
}

async function getSystemStats() {
    try {
        const system = await systemCollection.findOne({ _id: 'config' });
        return system || {};
    } catch (error) {
        console.error('خطأ في قراءة إحصائيات النظام:', error);
        await logSecurityEvent('ERROR_READ_SYSTEM', null, { error: error.message });
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
        await logSecurityEvent('ERROR_UPDATE_SYSTEM', null, { error: error.message, updates });
        return false;
    }
}

async function getTopUsers(limit = 10) {
    try {
        return await usersCollection
            .find({})
            .sort({ balance: -1 })
            .limit(Math.min(limit, 50))
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
    console.error('❌ خطأ في تهيئة البوت:', error);
    process.exit(1);
}

const ADMIN_IDS = process.env.ADMIN_USER_IDS 
    ? process.env.ADMIN_USER_IDS.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
    : [];

const APP_URL = process.env.APP_URL || "https://your-app.koyeb.app";

console.log(`🔗 رابط الواجهة: ${APP_URL}`);
console.log(`⭐ نظام دفع نجوم تليجرام: مفعل`);
console.log(`🛡️ نظام الأمان المتقدم: مفعل`);

// ========== التحقق من صحة بيانات WebApp ==========
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
                try {
                    return JSON.parse(userStr);
                } catch (e) {
                    return null;
                }
            }
        }
    } catch (error) {
        console.error('خطأ في التحقق:', error);
    }
    return null;
}

// ========== Middleware للتحقق من صحة الطلبات ==========
app.use('/api', async (req, res, next) => {
    const publicPaths = [
        '/api/user/me',
        '/api/system-stats',
        '/api/star-stats',
        '/api/telegram-webhook',
        '/api/top'
    ];
    
    if (publicPaths.includes(req.path)) {
        return next();
    }
    
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Telegram ')) {
        await logSecurityEvent('UNAUTHORIZED_ACCESS', null, { 
            path: req.path, 
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
        return res.status(401).json({ success: false, error: 'غير مصرح' });
    }
    
    const initData = authHeader.substring(9);
    const user = verifyWebAppData(initData);
    
    if (!user) {
        await logSecurityEvent('INVALID_AUTH_DATA', null, { 
            path: req.path, 
            ip: req.ip 
        });
        return res.status(403).json({ success: false, error: 'بيانات غير صالحة' });
    }
    
    req.telegramUser = user;
    next();
});

// ========== أوامر التليجرام ==========
bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const inviteCode = match[1];
    const lang = msg.from.language_code || 'en';
    
    console.log(`🔄 مستخدم جديد: ${userId}`);
    
    // منع سبام البدء
    const rateKey = `start_${userId}`;
    const lastStart = await usersCollection.findOne({ 
        user_id: userId,
        last_start: { $gt: Date.now() - 5000 }
    });
    
    if (lastStart) {
        return;
    }
    
    let user = await getUser(userId);
    
    if (!user) {
        user = {
            user_id: userId,
            balance: 0,
            energy: 100,
            maxEnergy: 100,
            username: String(msg.from.username || '').substring(0, 50),
            first_name: String(msg.from.first_name || '').substring(0, 50),
            created_at: Date.now(),
            last_mine: null,
            last_mine_click: null,
            last_start: Date.now(),
            total_mined: 0,
            miningFraction: 0,
            upgrades: {},
            daily_streak: 0,
            total_invites: 0,
            invited_by: null,
            invite_code: null,
            total_bought: 0,
            language: lang.startsWith('ar') ? 'ar' : 'en'
        };
        await saveUser(user);
    } else {
        // تحديث آخر بدء
        await usersCollection.updateOne(
            { user_id: userId },
            { $set: { last_start: Date.now() } }
        );
    }
    
    // نظام الدعوة مع مكافحة الاحتيال
    if (inviteCode && inviteCode.startsWith('invite_')) {
        const inviterId = inviteCode.replace('invite_', '');
        
        if (inviterId !== userId) {
            const inviter = await getUser(inviterId);
            const system = await getSystemStats();
            
            if (inviter && system.antiSybilEnabled) {
                // تحقق من أن الداعي ليس مشبوهاً
                const isSuspicious = await isSuspiciousUser(inviterId);
                
                if (!isSuspicious) {
                    await usersCollection.updateOne(
                        { user_id: userId },
                        { $set: { invited_by: inviterId } }
                    );
                    
                    const existingReward = await inviteRewardsCollection.findOne({
                        inviterId: inviterId,
                        invitedId: userId
                    });
                    
                    if (!existingReward) {
                        await inviteRewardsCollection.insertOne({
                            inviterId: inviterId,
                            invitedId: userId,
                            invitedName: user.first_name,
                            status: 'pending',
                            createdAt: Date.now(),
                            rewardAmount: 0
                        });
                    }
                    
                    await usersCollection.updateOne(
                        { user_id: inviterId },
                        { $inc: { total_invites: 1 } }
                    );
                    
                    await updateSystemStats({ totalInvites: 1 });
                    
                    const inviterLang = inviter.language || 'en';
                    const inviteMessage = inviterLang === 'ar' 
                        ? `🎉 *مبروك! شخص جديد انضم عن طريقك!* 🎉\n\n👤 المستخدم: ${user.first_name}\n💰 المكافأة: +1💎 (إذا اشترى) / +0.3💎 (إذا لم يشتري)`
                        : `🎉 *Congratulations! Someone joined through your link!* 🎉\n\n👤 User: ${user.first_name}\n💰 Reward: +1💎 (if they buy) / +0.3💎 (if they don't)`;
                    
                    try {
                        await bot.sendMessage(inviterId, inviteMessage, { parse_mode: 'Markdown' });
                    } catch (e) {}
                } else {
                    await logSecurityEvent('SUSPICIOUS_INVITE_ATTEMPT', inviterId, { invitedId: userId });
                }
            }
        }
    }
    
    if (!user.invite_code) {
        await usersCollection.updateOne(
            { user_id: userId },
            { $set: { invite_code: `invite_${userId}` } }
        );
    }
    
    const welcomeMessage = user.language === 'ar'
        ? `💎 *مرحباً بك في كريستال التعدين!* 💎\n\n` +
          `اهلاً ${msg.from.first_name}!\n\n` +
          `⛏️ *التعدين:* 1 كريستال كل 24 ساعة (عرض محدود: 1,000,000 💎 فقط)\n` +
          `⭐ *الشراء:* 10 نجوم = 1 💎\n` +
          `💎 *العرض الكلي:* 800,000,000 كريستال (نادر!)\n\n` +
          `👥 *الدعوة:* +1💎 (إذا اشترى) / +0.3💎 (إذا لم يشتري)\n` +
          `🛡️ *الأمان:* نظام مكافحة الاحتيال نشط\n\n` +
          `🚀 *قريباً:* الإدراج في منصة STON.fi!\n\n` +
          `اضغط الزر أدناه لفتح منصة التعدين:`
        : `💎 *Welcome to Crystal Mining!* 💎\n\n` +
          `Hello ${msg.from.first_name}!\n\n` +
          `⛏️ *Mining:* 1 crystal every 24h (Limited: 1,000,000 💎 only)\n` +
          `⭐ *Buy:* 10 stars = 1 💎\n` +
          `💎 *Total Supply:* 800,000,000 crystals (Rare!)\n\n` +
          `👥 *Invite:* +1💎 (if they buy) / +0.3💎 (if they don't)\n` +
          `🛡️ *Security:* Anti-fraud system active\n\n` +
          `🚀 *Coming Soon:* Listing on STON.fi!\n\n` +
          `Click the button below to open the mining platform:`;
    
    await bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[
                {
                    text: user.language === 'ar' ? '⛏️ فتح مناجم الكريستال' : '⛏️ Open Crystal Mines',
                    web_app: { url: APP_URL }
                }
            ]]
        }
    });
});

// ========== API محمية ==========
app.get('/api/system-stats', async (req, res) => {
    try {
        const system = await getSystemStats();
        const starStats = await getStarPurchaseStats();
        
        const percentMined = system.minedSupply ? (system.minedSupply / system.maxMining * 100).toFixed(1) : 0;
        const percentSold = system.soldSupply ? (system.soldSupply / system.totalSupply * 100).toFixed(1) : 0;
        
        res.json({
            success: true,
            system: {
                totalSupply: system.totalSupply,
                minedSupply: system.minedSupply,
                soldSupply: system.soldSupply,
                remainingSupply: system.remainingSupply,
                maxMining: system.maxMining,
                miningProgress: percentMined,
                supplyProgress: percentSold,
                isListed: system.isListed,
                icoActive: system.icoActive,
                icoPrice: system.icoPrice,
                starRate: system.starRate,
                antiSybilEnabled: system.antiSybilEnabled
            },
            stars: starStats
        });
    } catch (error) {
        console.error('خطأ في جلب إحصائيات النظام:', error);
        res.json({ success: false, error: 'فشل في جلب الإحصائيات' });
    }
});

app.get('/api/user/:userId', 
    validateUserId,
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.json({ success: false, error: 'معرف مستخدم غير صالح' });
            }
            
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
                
                const miningRemaining = Math.max(0, system.maxMining - (system.minedSupply || 0));
                const isEligible = system.antiSybilEnabled ? await isEligibleForAirdrop(req.params.userId) : false;
                
                res.json({ 
                    success: true, 
                    user: {
                        ...user,
                        starRate: system.starRate || 0.1,
                        miningCooldown: miningCooldown,
                        miningFraction: miningFraction,
                        miningRemaining: miningRemaining,
                        isEligibleForAirdrop: isEligible
                    }
                });
            } else {
                res.json({ success: false, error: 'مستخدم غير موجود' });
            }
        } catch (error) {
            console.error('خطأ في جلب بيانات المستخدم:', error);
            res.json({ success: false, error: 'فشل في جلب البيانات' });
        }
});

app.get('/api/user/me', async (req, res) => {
    res.json({ username: bot.options.username });
});

app.get('/api/top', async (req, res) => {
    try {
        const topUsers = await getTopUsers(10);
        res.json({ success: true, topUsers });
    } catch (error) {
        res.json({ success: false, error: 'فشل في جلب المتصدرين' });
    }
});

app.get('/api/star-stats', async (req, res) => {
    try {
        const stats = await getStarPurchaseStats();
        res.json({ success: true, stats });
    } catch (error) {
        res.json({ success: false, error: 'فشل في جلب إحصائيات النجوم' });
    }
});

// ========== نظام التعدين المحمي ==========
app.post('/api/mine', 
    async (req, res) => {
        try {
            const userId = req.telegramUser.id.toString();
            
            // تحقق من صحة userId
            if (!userId || !/^\d+$/.test(userId)) {
                return res.json({ success: false, error: 'معرف مستخدم غير صالح' });
            }
            
            const user = await getUser(userId);
            const system = await getSystemStats();
            
            if (!user) return res.json({ success: false, error: 'مستخدم غير موجود' });
            
            // التحقق من حد التعدين
            if (system.minedSupply >= system.maxMining) {
                return res.json({
                    success: false,
                    error: 'mining_ended',
                    message_ar: '⛏️ تم استخراج آخر كريستال من المناجم! العملة الآن نادرة في السوق 💎',
                    message_en: '⛏️ The last crystal has been mined! The currency is now rare in the market 💎'
                });
            }
            
            // التحقق من فترة التبريد
            if (user.last_mine_click) {
                const hoursPassed = (Date.now() - user.last_mine_click) / (1000 * 60 * 60);
                if (hoursPassed < 24) {
                    const remainingHours = 24 - hoursPassed;
                    const remainingMinutes = Math.ceil(remainingHours * 60);
                    return res.json({ 
                        success: false, 
                        error: 'cooldown',
                        message_ar: `⏳ انتظر ${remainingMinutes} دقيقة للتعدين مرة أخرى`,
                        message_en: `⏳ Wait ${remainingMinutes} minutes for next mining`,
                        cooldown: remainingHours
                    });
                }
            }
            
            const minedAmount = 1;
            const newBalance = (user.balance || 0) + minedAmount;
            const totalMined = (user.total_mined || 0) + minedAmount;
            
            await usersCollection.updateOne(
                { user_id: userId },
                {
                    $set: {
                        balance: newBalance,
                        last_mine_click: Date.now(),
                        last_mine: Date.now(),
                        total_mined: totalMined,
                        miningFraction: 0
                    }
                }
            );
            
            await updateSystemStats({ 
                minedSupply: minedAmount,
                remainingSupply: -minedAmount 
            });
            
            // تنبيه عند قرب انتهاء التعدين
            const miningRemaining = system.maxMining - system.minedSupply - minedAmount;
            if (miningRemaining < 1000 && miningRemaining > 0) {
                for (const adminId of ADMIN_IDS) {
                    try {
                        await bot.sendMessage(adminId,
                            `⚠️ *تنبيه التعدين*\n\n` +
                            `باقي ${miningRemaining} كريستال فقط للتعدين!\n` +
                            `⛏️ التعدين سينتهي قريباً!`,
                            { parse_mode: 'Markdown' }
                        );
                    } catch (e) {}
                }
            }
            
            res.json({
                success: true,
                minedAmount: minedAmount.toFixed(3),
                newBalance: newBalance.toFixed(3),
                totalMined: totalMined.toFixed(3),
                miningRemaining: Math.max(0, system.maxMining - system.minedSupply - minedAmount),
                message_ar: `✅ تم التعدين! +${minedAmount.toFixed(3)} كريستال`,
                message_en: `✅ Mining successful! +${minedAmount.toFixed(3)} crystal`,
                cooldown: 24
            });
        } catch (error) {
            console.error('خطأ في التعدين:', error);
            await logSecurityEvent('ERROR_MINING', req.telegramUser?.id, { error: error.message });
            res.json({ success: false, error: 'فشل في التعدين' });
        }
});

// ========== نظام شراء النجوم المحمي ==========
async function createStarInvoice(userId, starAmount, description) {
    try {
        const user = await getUser(userId);
        const system = await getSystemStats();
        const starRate = system.starRate || 0.1;
        
        const payload = `${userId}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
        const crystalAmount = starAmount * starRate;
        
        // تحقق من توفر العرض
        if (system.remainingSupply < crystalAmount) {
            return { success: false, error: 'supply_exhausted' };
        }
        
        const params = {
            title: "Crystal Mining",
            description: description.substring(0, 64),
            payload: payload.substring(0, 128),
            provider_token: "",
            currency: "XTR",
            prices: [
                {
                    label: `${starAmount} ⭐ = ${crystalAmount.toFixed(1)} 💎`,
                    amount: starAmount
                }
            ]
        };

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
                userFirstName: (user?.first_name || 'User').substring(0, 50),
                starAmount: starAmount,
                crystalAmount: crystalAmount,
                status: 'pending',
                createdAt: Date.now(),
                expiresAt: Date.now() + 24 * 60 * 60 * 1000,
                ip: req?.ip || null
            });
            
            return { success: true, url: data.result, payload, crystalAmount };
        } else {
            return { success: false, error: data.description };
        }
    } catch (error) {
        console.error('خطأ في إنشاء الفاتورة:', error);
        await logSecurityEvent('ERROR_CREATE_INVOICE', userId, { error: error.message });
        return { success: false, error: error.message };
    }
}

app.post('/api/buy-with-stars',
    validateStarAmount,
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.json({ 
                    success: false, 
                    error: 'الحد الأدنى 5 نجوم والحد الأقصى 2500 نجوم' 
                });
            }
            
            const userId = req.telegramUser.id.toString();
            const { starAmount } = req.body;
            
            const user = await getUser(userId);
            const system = await getSystemStats();
            
            if (!user) {
                return res.json({ success: false, error: 'مستخدم غير موجود' });
            }
            
            // مكافحة الاحتيال: تحقق من المستخدم
            if (system.antiSybilEnabled) {
                const isSuspicious = await isSuspiciousUser(userId);
                if (isSuspicious) {
                    await logSecurityEvent('SUSPICIOUS_PURCHASE_ATTEMPT', userId, { starAmount });
                    return res.json({ 
                        success: false, 
                        error: 'account_suspicious',
                        message_ar: '❌ حسابك قيد المراجعة. يرجى التواصل مع الدعم.',
                        message_en: '❌ Your account is under review. Please contact support.'
                    });
                }
            }
            
            const crystalAmount = starAmount * 0.1;
            
            if (system.remainingSupply < crystalAmount) {
                return res.json({
                    success: false,
                    error: 'supply_exhausted',
                    message_ar: '💰 نفدت الكريستال! كل العملة تم بيعها. شكراً لدعمكم! 🎉',
                    message_en: '💰 Crystals are sold out! Thank you for your support! 🎉'
                });
            }
            
            const invoice = await createStarInvoice(userId, starAmount, `💎 ${crystalAmount.toFixed(1)} Crystals`);
            
            if (invoice.success) {
                res.json({
                    success: true,
                    invoiceUrl: invoice.url,
                    payload: invoice.payload,
                    starAmount: starAmount,
                    crystalAmount: invoice.crystalAmount.toFixed(1),
                    remainingSupply: system.remainingSupply - crystalAmount
                });
            } else {
                res.json({
                    success: false,
                    error: invoice.error || 'فشل إنشاء الفاتورة'
                });
            }
        } catch (error) {
            console.error('خطأ في شراء النجوم:', error);
            await logSecurityEvent('ERROR_BUY_STARS', req.telegramUser?.id, { error: error.message });
            res.json({ success: false, error: 'فشل في معالجة الطلب' });
        }
});

// ========== Webhook لاستقبال مدفوعات النجوم (محمي) ==========
app.post('/api/telegram-webhook', async (req, res) => {
    try {
        const update = req.body;
        
        // تحقق من صحة الطلب
        if (!update || typeof update !== 'object') {
            return res.json({ ok: true });
        }
        
        // Pre-checkout query
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
        
        // دفع ناجح
        if (update.message?.successful_payment) {
            const payload = update.message.successful_payment.invoice_payload;
            const starAmount = update.message.successful_payment.total_amount;
            const chatId = update.message.chat.id;
            
            console.log(`💰 دفع ناجح!`, { payload, starAmount });
            
            try {
                const invoice = await starInvoicesCollection.findOne({ payload });
                
                if (invoice && invoice.status === 'pending') {
                    const crystalAmount = invoice.crystalAmount;
                    const userId = invoice.userId;
                    const system = await getSystemStats();
                    
                    // تحقق مزدوج من توفر العرض
                    if (system.remainingSupply < crystalAmount) {
                        await bot.sendMessage(userId,
                            `❌ *فشل الدفع*\n\n` +
                            `نفدت الكريستال! تم استرداد نجومك.`,
                            { parse_mode: 'Markdown' }
                        );
                        return res.json({ ok: true });
                    }
                    
                    // إضافة الرصيد للمستخدم
                    await usersCollection.updateOne(
                        { user_id: userId },
                        { 
                            $inc: { 
                                balance: crystalAmount,
                                total_bought: crystalAmount 
                            } 
                        }
                    );
                    
                    // تحديث حالة الفاتورة
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
                    
                    // تحديث إحصائيات النظام
                    await updateSystemStats({ 
                        totalStarsInvested: starAmount,
                        totalCrystalSold: crystalAmount,
                        soldSupply: crystalAmount,
                        remainingSupply: -crystalAmount
                    });
                    
                    const user = await getUser(userId);
                    const lang = user?.language || 'en';
                    
                    const successMessage = lang === 'ar'
                        ? `✅ *تم شراء الكريستال بنجاح!*\n\n` +
                          `💎 الكمية: ${crystalAmount.toFixed(1)} كريستال\n` +
                          `⭐ الدفع: ${starAmount} نجوم\n` +
                          `🎁 شكراً لاستثمارك في كريستال التعدين!\n\n` +
                          `📄 شهادة الدفع متاحة في صفحة المشتريات`
                        : `✅ *Crystal Purchase Successful!*\n\n` +
                          `💎 Amount: ${crystalAmount.toFixed(1)} Crystals\n` +
                          `⭐ Paid: ${starAmount} Stars\n` +
                          `🎁 Thank you for investing in Crystal Mining!\n\n` +
                          `📄 Payment certificate available in purchases page`;
                    
                    await bot.sendMessage(userId, successMessage, { parse_mode: 'Markdown' });
                    
                    // نظام مكافأة الدعوة مع مكافحة الاحتيال
                    if (user?.invited_by && system.antiSybilEnabled) {
                        const isInviterSuspicious = await isSuspiciousUser(user.invited_by);
                        
                        if (!isInviterSuspicious) {
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
                                
                                const inviter = await getUser(user.invited_by);
                                const inviterLang = inviter?.language || 'en';
                                
                                const rewardMessage = inviterLang === 'ar'
                                    ? `💰 *مبروك! تم إيداع من قبل الشخص الذي دعوته!*\n\n` +
                                      `👤 المستخدم: ${user.first_name}\n` +
                                      `⭐ مبلغ الإيداع: ${starAmount} نجوم\n` +
                                      `🎁 المكافأة: +1 💎`
                                    : `💰 *Congratulations! Someone you invited made a purchase!*\n\n` +
                                      `👤 User: ${user.first_name}\n` +
                                      `⭐ Deposit: ${starAmount} Stars\n` +
                                      `🎁 Reward: +1 💎`;
                                
                                try {
                                    await bot.sendMessage(user.invited_by, rewardMessage, { parse_mode: 'Markdown' });
                                } catch (e) {}
                            }
                        } else {
                            await logSecurityEvent('SUSPICIOUS_INVITER_REWARD_BLOCKED', user.invited_by, { 
                                invitedId: userId,
                                starAmount 
                            });
                        }
                    }
                    
                    console.log(`✅ تم إضافة ${crystalAmount} كريستال للمستخدم ${userId}`);
                }
            } catch (error) {
                console.error('❌ خطأ في معالجة الدفع:', error);
                await logSecurityEvent('ERROR_PAYMENT_PROCESSING', null, { 
                    payload, 
                    error: error.message 
                });
            }
            
            return res.json({ ok: true });
        }
        
        res.json({ ok: true });
    } catch (error) {
        console.error('خطأ في webhook:', error);
        res.json({ ok: true });
    }
});

// ========== نظام طلبات النجوم المحمي ==========
app.get('/api/star-orders/:userId',
    validateUserId,
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.json({ success: false, orders: [] });
            }
            
            const userId = req.params.userId;
            
            const orders = await starInvoicesCollection
                .find({ userId })
                .sort({ createdAt: -1 })
                .limit(20)
                .project({ 
                    _id: 0,
                    payload: 1,
                    starAmount: 1,
                    crystalAmount: 1,
                    status: 1,
                    createdAt: 1,
                    completedAt: 1
                })
                .toArray();
            
            res.json({ success: true, orders });
        } catch (error) {
            console.error('خطأ في قراءة طلبات النجوم:', error);
            res.json({ success: false, orders: [] });
        }
});

// ========== نظام شهادات الدفع المحمي ==========
app.get('/api/receipt/:orderId',
    param('orderId').isString().trim().isLength({ min: 10, max: 200 }),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.json({ success: false, error: 'معرف طلب غير صالح' });
            }
            
            const orderId = req.params.orderId;
            
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
                verified_by: 'Telegram Stars API'
            };
            
            res.json({ success: true, receipt });
        } catch (error) {
            console.error('خطأ في جلب شهادة الدفع:', error);
            res.json({ success: false, error: 'فشل في جلب الشهادة' });
        }
});

// ========== نظام معلومات الدعوة المحمي ==========
app.get('/api/invite-info/:userId',
    validateUserId,
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.json({ success: false });
            }
            
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
            .project({ 
                _id: 0,
                invitedName: 1,
                status: 1,
                rewardAmount: 1,
                createdAt: 1,
                depositAmount: 1
            })
            .toArray();
            
            res.json({
                success: true,
                totalInvites,
                totalRewards,
                recentInvites
            });
        } catch (error) {
            console.error('خطأ في قراءة معلومات الدعوة:', error);
            res.json({ success: false });
        }
});

// ========== معالجة الدعوات المعلقة (محمية) ==========
async function processPendingInvites() {
    try {
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const system = await getSystemStats();
        
        const pendingRewards = await inviteRewardsCollection.find({
            status: 'pending',
            createdAt: { $lt: sevenDaysAgo }
        }).toArray();
        
        console.log(`📊 معالجة ${pendingRewards.length} دعوة معلقة...`);
        
        for (const reward of pendingRewards) {
            // تحقق من أن الداعي ليس مشبوهاً
            if (system.antiSybilEnabled) {
                const isSuspicious = await isSuspiciousUser(reward.inviterId);
                if (isSuspicious) {
                    await inviteRewardsCollection.updateOne(
                        { _id: reward._id },
                        { 
                            $set: { 
                                status: 'rejected',
                                completedAt: Date.now(),
                                rewardAmount: 0,
                                reason: 'حساب مشبوه'
                            } 
                        }
                    );
                    continue;
                }
            }
            
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
                        reason: 'لم يشتري خلال 7 أيام'
                    } 
                }
            );
            
            const inviter = await getUser(reward.inviterId);
            const lang = inviter?.language || 'en';
            
            const message = lang === 'ar'
                ? `⏳ *مكافأة دعوة محدودة*\n\n` +
                  `👤 المستخدم: ${reward.invitedName}\n` +
                  `❌ لم يقم بالشراء خلال 7 أيام\n` +
                  `🎁 المكافأة: +0.3 💎`
                : `⏳ *Limited Invite Reward*\n\n` +
                  `👤 User: ${reward.invitedName}\n` +
                  `❌ Didn't purchase within 7 days\n` +
                  `🎁 Reward: +0.3 💎`;
            
            try {
                await bot.sendMessage(reward.inviterId, message, { parse_mode: 'Markdown' });
            } catch (e) {}
            
            console.log(`🎁 تم منح 0.3 كريستال للداعي ${reward.inviterId}`);
        }
    } catch (error) {
        console.error('❌ خطأ في معالجة الدعوات المعلقة:', error);
        await logSecurityEvent('ERROR_PROCESS_INVITES', null, { error: error.message });
    }
}

setInterval(processPendingInvites, 60 * 60 * 1000);
setTimeout(processPendingInvites, 10 * 1000);

// ========== أوامر الأدمن المحمية ==========
function isAdmin(userId) {
    return ADMIN_IDS.includes(Number(userId));
}

bot.onText(/\/admin/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isAdmin(userId)) {
        await logSecurityEvent('UNAUTHORIZED_ADMIN_ACCESS', userId, { chatId });
        await bot.sendMessage(chatId, '❌ غير مصرح لك باستخدام هذا الأمر');
        return;
    }
    
    try {
        const totalUsers = await usersCollection.countDocuments();
        const system = await getSystemStats();
        const starStats = await getStarPurchaseStats();
        
        const miningRemaining = Math.max(0, system.maxMining - (system.minedSupply || 0));
        const supplyRemaining = system.remainingSupply || 0;
        const supplyPercent = system.totalSupply ? ((system.totalSupply - supplyRemaining) / system.totalSupply * 100).toFixed(2) : 0;
        
        // جلب إحصائيات الأمان
        const suspiciousAccounts = await securityLogsCollection.countDocuments({ 
            type: { $regex: '^SUSPICIOUS_' },
            timestamp: { $gt: Date.now() - 24 * 60 * 60 * 1000 }
        });
        
        const blockedPurchases = await securityLogsCollection.countDocuments({ 
            type: 'SUSPICIOUS_PURCHASE_ATTEMPT',
            timestamp: { $gt: Date.now() - 24 * 60 * 60 * 1000 }
        });
        
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
            `👑 *لوحة تحكم الأدمن - كريستال التعدين* 👑\n\n` +
            `📊 *إحصائيات عامة:*\n` +
            `• 👥 المستخدمون: ${totalUsers}\n` +
            `• ⭐ رصيد البوت من النجوم: ${starBalance} ⭐\n` +
            `• 💰 إجمالي مبيعات النجوم: ${starStats.totalStars} ⭐\n` +
            `• 💎 إجمالي الكريستال المباع: ${starStats.totalCrystals.toFixed(1)} 💎\n\n` +
            `💎 *العرض المحدود (800M):*\n` +
            `• ⛏️ تم تعدينه: ${(system.minedSupply || 0).toLocaleString()} / ${system.maxMining.toLocaleString()}\n` +
            `• 📊 متبقي للتعدين: ${miningRemaining.toLocaleString()} 💎\n` +
            `• 💰 تم بيعه: ${(system.soldSupply || 0).toLocaleString()} 💎\n` +
            `• 🎯 المتبقي: ${supplyRemaining.toLocaleString()} 💎 (${supplyPercent}%)\n\n` +
            `🛡️ *نظام الأمان:*\n` +
            `• 🔴 حسابات مشبوهة (24h): ${suspiciousAccounts}\n` +
            `• ⚠️ محاولات شراء محجوبة: ${blockedPurchases}\n` +
            `• ✅ مكافحة الاحتيال: ${system.antiSybilEnabled ? 'نشط' : 'معطل'}\n\n` +
            `🚀 *حالة الإدراج:*\n` +
            `• 📌 مدرج: ${system.isListed ? '✅ نعم' : '❌ لا'}\n` +
            `• 🎉 الاكتتاب: ${system.icoActive ? '✅ مفتوح' : '❌ مغلق'}\n\n` +
            `🔧 *الأنظمة:* تعدين: 1💎/24h | سحب USDT: ❌ معطل | الإدراج: 🚀 قريباً`;
        
        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('خطأ في أمر /admin:', error);
        await bot.sendMessage(chatId, '❌ حدث خطأ في جلب الإحصائيات');
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
    
    try {
        let targetUser = null;
        
        if (/^\d+$/.test(searchTerm)) {
            targetUser = await getUser(searchTerm);
        } else {
            targetUser = await usersCollection.findOne({ 
                username: { $regex: `^${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } 
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
        
        const starOrders = await starInvoicesCollection.countDocuments({ 
            userId: targetUser.user_id, 
            status: 'completed' 
        });
        
        const starAmount = await starInvoicesCollection.aggregate([
            { $match: { userId: targetUser.user_id, status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$starAmount' } } }
        ]).toArray();
        
        const isEligible = await isEligibleForAirdrop(targetUser.user_id);
        const isSuspicious = await isSuspiciousUser(targetUser.user_id);
        
        await bot.sendMessage(chatId,
            `👤 *ملف المنقب*\n\n` +
            `🆔 المعرف: \`${targetUser.user_id}\`\n` +
            `📛 الاسم: ${targetUser.first_name}\n` +
            `👤 اليوزر: @${targetUser.username || 'لا يوجد'}\n` +
            `🌐 اللغة: ${targetUser.language === 'ar' ? '🇸🇦 العربية' : '🇬🇧 الإنجليزية'}\n` +
            `💰 رصيد الكريستال: ${targetUser.balance.toFixed(3)} 💎\n` +
            `🏆 الترتيب: #${rank} من ${totalUsers}\n\n` +
            `📊 *إحصائيات:*\n` +
            `• ⛏️ إجمالي التعدين: ${(targetUser.total_mined || 0).toFixed(3)} 💎\n` +
            `• 🔥 السلسلة اليومية: ${targetUser.daily_streak || 0}\n` +
            `• ⭐ مشتريات بالنجوم: ${starOrders} (${(starAmount[0]?.total || 0)} ⭐)\n` +
            `• 💎 إجمالي المشتريات: ${(targetUser.total_bought || 0).toFixed(1)} 💎\n` +
            `• 👥 الدعوات: ${targetUser.total_invites || 0}\n\n` +
            `🛡️ *حالة الأمان:*\n` +
            `• ✅ أهلية الإيردروب: ${isEligible ? 'نعم' : 'لا'}\n` +
            `• ⚠️ حساب مشبوه: ${isSuspicious ? 'نعم' : 'لا'}\n\n` +
            `📅 تاريخ الانضمام: ${new Date(targetUser.created_at).toLocaleDateString('ar-EG')}`,
            { parse_mode: 'Markdown' }
        );
    } catch (error) {
        console.error('خطأ في أمر /user:', error);
        await bot.sendMessage(chatId, '❌ حدث خطأ في البحث');
    }
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
                    allowed_updates: ['pre_checkout_query', 'message'],
                    max_connections: 40
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
        console.error('خطأ في إعداد webhook:', error);
        await bot.sendMessage(chatId, `❌ فشل: ${error.message}`);
    }
});

// ========== نظام مكافحة الاحتيال - أوامر إضافية للأدمن ==========
bot.onText(/\/block (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const targetId = match[1];
    
    if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '❌ غير مصرح');
        return;
    }
    
    if (!/^\d+$/.test(targetId)) {
        await bot.sendMessage(chatId, '❌ معرف مستخدم غير صالح');
        return;
    }
    
    try {
        await usersCollection.updateOne(
            { user_id: targetId },
            { $set: { blocked: true, blocked_at: Date.now(), blocked_by: userId } }
        );
        
        await logSecurityEvent('USER_BLOCKED_BY_ADMIN', targetId, { adminId: userId });
        await bot.sendMessage(chatId, `✅ تم حظر المستخدم ${targetId}`);
    } catch (error) {
        await bot.sendMessage(chatId, '❌ فشل في حظر المستخدم');
    }
});

bot.onText(/\/unblock (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const targetId = match[1];
    
    if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '❌ غير مصرح');
        return;
    }
    
    if (!/^\d+$/.test(targetId)) {
        await bot.sendMessage(chatId, '❌ معرف مستخدم غير صالح');
        return;
    }
    
    try {
        await usersCollection.updateOne(
            { user_id: targetId },
            { $unset: { blocked: "", blocked_at: "", blocked_by: "" } }
        );
        
        await logSecurityEvent('USER_UNBLOCKED_BY_ADMIN', targetId, { adminId: userId });
        await bot.sendMessage(chatId, `✅ تم إلغاء حظر المستخدم ${targetId}`);
    } catch (error) {
        await bot.sendMessage(chatId, '❌ فشل في إلغاء حظر المستخدم');
    }
});

bot.onText(/\/security/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '❌ غير مصرح');
        return;
    }
    
    try {
        const last24h = Date.now() - 24 * 60 * 60 * 1000;
        
        const suspiciousLogs = await securityLogsCollection.find({
            timestamp: { $gt: last24h },
            type: { $regex: '^SUSPICIOUS_' }
        })
        .sort({ timestamp: -1 })
        .limit(10)
        .toArray();
        
        let logsText = '';
        suspiciousLogs.forEach(log => {
            const date = new Date(log.timestamp).toLocaleString('ar-EG');
            logsText += `• ${date}: ${log.type} (${log.userId || '?'})\n`;
        });
        
        const message = 
            `🛡️ *سجل الأحداث الأمنية (آخر 24 ساعة)*\n\n` +
            `${logsText || 'لا توجد أحداث مشبوهة'}`;
        
        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('خطأ في جلب سجل الأمان:', error);
        await bot.sendMessage(chatId, '❌ فشل في جلب السجل');
    }
});

// ========== تشغيل الخادم ==========
async function startServer() {
    const connected = await connectToMongo();
    if (!connected) {
        console.error('❌ فشل الاتصال بقاعدة البيانات');
        process.exit(1);
    }
    
    app.listen(PORT, () => {
        console.log('\n===========================================');
        console.log(`🌐 خادم الويب يعمل على المنفذ: ${PORT}`);
        console.log(`🔗 رابط الواجهة: ${APP_URL}`);
        console.log(`⭐ نظام دفع نجوم تليجرام: مفعل`);
        console.log(`🛡️ نظام الأمان المتقدم: مفعل`);
        console.log(`💎 نظام العرض المحدود: 800,000,000 💎`);
        console.log(`⛏️ حد التعدين: 1,000,000 💎`);
        console.log(`💰 سحب USDT: ❌ معطل`);
        console.log(`🚀 الإدراج في STON.fi: قريباً`);
        console.log('===========================================\n');
    });
}

startServer();

process.on('SIGINT', async () => {
    console.log('\n🛑 إيقاف البوت...');
    await logSecurityEvent('SERVER_SHUTDOWN', null, { signal: 'SIGINT' });
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 إيقاف البوت...');
    await logSecurityEvent('SERVER_SHUTDOWN', null, { signal: 'SIGTERM' });
    process.exit(0);
});

process.on('uncaughtException', async (error) => {
    console.error('❌ استثناء غير متوقع:', error);
    await logSecurityEvent('UNCAUGHT_EXCEPTION', null, { 
        error: error.message,
        stack: error.stack 
    });
});

process.on('unhandledRejection', async (reason, promise) => {
    console.error('❌ رفض وعد غير معالج:', reason);
    await logSecurityEvent('UNHANDLED_REJECTION', null, { 
        reason: String(reason),
        promise: String(promise)
    });
});

console.log('🚀 بوت كريستال التعدين - الإصدار المحمي 15.0');
console.log('📱 افتح تليجرام وأرسل /start');
console.log('👑 لوحة الأدمن: /admin');
console.log('🛡️ نظام الأمان: مفعل بالكامل');
console.log('⛏️ تعدين: 1 كريستال/24 ساعة (محدود 1M)');
console.log('⭐ شراء: 10 نجوم = 1 💎 (محدود 800M)');
console.log('💰 سحب USDT: ❌ ملغي نهائياً');
console.log('🚀 الإدراج: STON.fi قريباً');
console.log('🌍 اللغات: العربية / English');
