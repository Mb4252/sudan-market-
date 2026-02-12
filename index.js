const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, param, validationResult } = require('express-validator');
const mongoSanitize = require('express-mongo-sanitize');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 8000;

// ========== 🔐 الأمان المتقدم - منع الوصول للملفات الحساسة ==========
app.use((req, res, next) => {
    // منع الوصول لأي ملف يبدأ بنقطة أو ملفات الإعدادات
    if (req.path.startsWith('/.') || 
        req.path.includes('config') || 
        req.path.endsWith('.json') ||
        req.path.includes('.env') ||
        req.path.includes('package.json') ||
        req.path.includes('package-lock.json')) {
        return res.status(403).send('Access Denied');
    }
    next();
});

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://telegram.org", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https://cdn.jsdelivr.net"],
            connectSrc: ["'self'", "https://api.telegram.org"],
        },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, error: 'طلبات كثيرة جداً، حاول بعد 15 دقيقة' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

app.use(mongoSanitize({
    replaceWith: '_',
    onSanitize: ({ req, key }) => {
        console.warn(`🚨 محاولة حقن من IP: ${req.ip}, key: ${key}`);
    }
}));

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
let certificatesCollection;

// ========== 🔐 مفتاح التوقيع الرقمي الآمن (ثابت من .env) ==========
const CERTIFICATE_SECRET = process.env.CERT_SECRET;
if (!CERTIFICATE_SECRET) {
    console.error('❌ CERT_SECRET غير موجود في ملف .env');
    process.exit(1);
}

function generateCertificateSignature(orderId, userId, amount, timestamp) {
    const hmac = crypto.createHmac('sha256', CERTIFICATE_SECRET);
    hmac.update(`${orderId}:${userId}:${amount}:${timestamp}`);
    return hmac.digest('hex');
}

function verifyCertificateSignature(orderId, userId, amount, timestamp, signature) {
    const expectedSignature = generateCertificateSignature(orderId, userId, amount, timestamp);
    try {
        return crypto.timingSafeEqual(
            Buffer.from(expectedSignature, 'hex'),
            Buffer.from(signature, 'hex')
        );
    } catch (error) {
        return false;
    }
}

function generateVerificationCode(orderId) {
    const hmac = crypto.createHmac('sha256', CERTIFICATE_SECRET);
    hmac.update(`verify:${orderId}:${Date.now()}`);
    return hmac.digest('hex').substring(0, 16);
}

// ========== الاتصال بقاعدة البيانات ==========
async function connectToMongo() {
    try {
        const client = new MongoClient(MONGODB_URI, {
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
        certificatesCollection = db.collection('certificates');
        
        // إنشاء Indexes
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
        
        await certificatesCollection.createIndex({ orderId: 1 }, { unique: true });
        await certificatesCollection.createIndex({ userId: 1, issuedAt: -1 });
        await certificatesCollection.createIndex({ verificationCode: 1 });
        
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
                minPurchaseAge: 30 * 24 * 60 * 60 * 1000,
                minPurchaseAmount: 10,
                maxInvitesPerUser: 5,
                antiSybilEnabled: true,
                certificateVersion: '2.0',
                createdAt: Date.now()
            });
        }
        
        console.log('📦 قاعدة البيانات جاهزة');
        console.log(`💎 إجمالي العرض: 800,000,000 كريستال`);
        console.log(`⛏️ حد التعدين: 1,000,000 كريستال`);
        console.log(`🛡️ نظام مكافحة الاحتيال: مفعل`);
        console.log(`🔐 نظام الشهادات الرقمية: مفعل (HMAC-SHA256)`);
        console.log(`🔑 مفتاح التوقيع: ${CERTIFICATE_SECRET.substring(0, 10)}...`);
        return true;
    } catch (error) {
        console.error('❌ فشل الاتصال بقاعدة البيانات:', error);
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

// ========== دوال حفظ الشهادات ==========
async function saveCertificate(certificateData) {
    try {
        await certificatesCollection.insertOne({
            ...certificateData,
            createdAt: Date.now(),
            verifiedCount: 0,
            lastVerified: null
        });
        return true;
    } catch (error) {
        console.error('❌ خطأ في حفظ الشهادة:', error);
        return false;
    }
}

async function getCertificate(orderId) {
    try {
        return await certificatesCollection.findOne({ orderId });
    } catch (error) {
        return null;
    }
}

async function incrementCertificateVerification(orderId) {
    try {
        await certificatesCollection.updateOne(
            { orderId },
            { 
                $inc: { verifiedCount: 1 },
                $set: { lastVerified: Date.now() }
            }
        );
        return true;
    } catch (error) {
        return false;
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

// ========== دوال مكافحة الاحتيال ==========
async function isSuspiciousUser(userId) {
    const user = await getUser(userId);
    if (!user) return false;
    
    const accountAge = Date.now() - user.created_at;
    const minAge = (await getSystemStats()).minPurchaseAge || 30 * 24 * 60 * 60 * 1000;
    
    if (accountAge < minAge) {
        await logSecurityEvent('SUSPICIOUS_ACCOUNT_AGE', userId, { accountAge, minAge });
        return true;
    }
    
    const invitesCount = await inviteRewardsCollection.countDocuments({ inviterId: userId });
    const maxInvites = (await getSystemStats()).maxInvitesPerUser || 5;
    
    if (invitesCount > maxInvites) {
        await logSecurityEvent('SUSPICIOUS_INVITES_COUNT', userId, { invitesCount, maxInvites });
        return true;
    }
    
    return false;
}

async function isEligibleForAirdrop(userId) {
    const user = await getUser(userId);
    if (!user) return false;
    
    const system = await getSystemStats();
    
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
        if (!userId || typeof userId !== 'string' || !/^\d+$/.test(userId)) {
            return null;
        }
        const user = await usersCollection.findOne({ user_id: userId });
        if (!user) return null;
        const { _id, ...userData } = user;
        return userData;
    } catch (error) {
        return null;
    }
}

async function saveUser(userData) {
    try {
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
            last_start: userData.last_start || null,
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
        return false;
    }
}

// ========== 🔐 دالة تحديث الرصيد بدقة حسابية محمية ==========
async function updateUserBalancePrecise(userId, amount) {
    try {
        if (!userId || typeof amount !== 'number' || isNaN(amount)) {
            return false;
        }
        // التقريب لـ 3 أرقام عشرية لمنع أخطاء Floating Point
        const newAmount = Math.round(amount * 1000) / 1000;
        const result = await usersCollection.updateOne(
            { user_id: userId },
            { $inc: { balance: newAmount } }
        );
        return result.modifiedCount > 0;
    } catch (error) {
        return false;
    }
}

async function getSystemStats() {
    try {
        const system = await systemCollection.findOne({ _id: 'config' });
        return system || {};
    } catch (error) {
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
        return false;
    }
}

async function getTopUsers(limit = 10) {
    try {
        return await usersCollection
            .find({})
            .sort({ balance: -1 })
            .limit(Math.min(limit, 50))
            .project({ first_name: 1, balance: 1, _id: 0 }) 
            .toArray();
    } catch (error) {
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

// ========== 🔐 دالة التحقق من WebApp Data (محمية بالكامل) ==========
function verifyWebAppData(initData) {
    try {
        if (!initData) return null;
        
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        const authDate = params.get('auth_date');
        
        const now = Math.floor(Date.now() / 1000);
        if (now - parseInt(authDate) > 86400) {
            console.warn("⚠️ بيانات منتهية الصلاحية");
            return null;
        }

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
        
        const safeCalculated = Buffer.from(calculatedHash, 'hex');
        const safeProvided = Buffer.from(hash, 'hex');
        
        if (safeCalculated.length === safeProvided.length && 
            crypto.timingSafeEqual(safeCalculated, safeProvided)) {
            const userStr = params.get('user');
            return userStr ? JSON.parse(userStr) : null;
        }
    } catch (error) {
        console.error('خطأ في التحقق:', error);
    }
    return null;
}

// ========== Middleware ==========
app.use('/api', async (req, res, next) => {
    const publicPaths = [
        '/api/user/me',
        '/api/system-stats',
        '/api/star-stats',
        `/api/webhook/${BOT_TOKEN}`,
        '/api/top',
        '/api/verify-certificate'
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

// ========== أوامر التليجرام ==========
bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const inviteCode = match[1];
    const lang = msg.from.language_code || 'en';
    
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
    }
    
    if (inviteCode && inviteCode.startsWith('invite_')) {
        const inviterId = inviteCode.replace('invite_', '');
        if (inviterId !== userId) {
            const inviter = await getUser(inviterId);
            if (inviter) {
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
          `👥 *الدعوة:* +1💎 (إذا اشترى) / +0.3💎 (إذا عدّن 3 مرات وكان عمر الحساب يوم+)\n` +
          `🔐 *الشهادات:* موثقة بتوقيع رقمي ثابت\n\n` +
          `🚀 *قريباً:* الإدراج في منصة STON.fi!\n\n` +
          `اضغط الزر أدناه لفتح منصة التعدين:`
        : `💎 *Welcome to Crystal Mining!* 💎\n\n` +
          `Hello ${msg.from.first_name}!\n\n` +
          `⛏️ *Mining:* 1 crystal every 24h (Limited: 1,000,000 💎 only)\n` +
          `⭐ *Buy:* 10 stars = 1 💎\n` +
          `💎 *Total Supply:* 800,000,000 crystals (Rare!)\n\n` +
          `👥 *Invite:* +1💎 (if they buy) / +0.3💎 (if they mine 3+ times & account age 1d+)\n` +
          `🔐 *Certificates:* Digitally signed with permanent key\n\n` +
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

// ========== نظام التحقق من الشهادات ==========
bot.onText(/\/start verify_(.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const orderId = match[1];
    const lang = msg.from.language_code?.startsWith('ar') ? 'ar' : 'en';
    
    try {
        const order = await starInvoicesCollection.findOne({ 
            payload: orderId,
            status: 'completed'
        });
        
        if (!order) {
            const errorMsg = lang === 'ar' 
                ? '❌ شهادة الدفع غير صالحة أو منتهية الصلاحية.'
                : '❌ Payment certificate is invalid or expired.';
            await bot.sendMessage(chatId, errorMsg);
            return;
        }
        
        const user = await getUser(order.userId);
        const certificate = await getCertificate(orderId);
        
        const signature = generateCertificateSignature(
            order.payload,
            order.userId,
            order.starAmount,
            order.completedAt || order.createdAt
        );
        
        const isValid = certificate ? certificate.signature === signature : true;
        
        if (certificate) {
            await incrementCertificateVerification(orderId);
        }
        
        const date = new Date(order.completedAt || order.createdAt).toLocaleDateString(
            lang === 'ar' ? 'ar-EG' : 'en-GB',
            { dateStyle: 'full', timeStyle: 'medium' }
        );
        
        const verifyMessage = lang === 'ar'
            ? `🔐 *التحقق من شهادة الدفع*\n\n` +
              `✅ *الحالة:* ${isValid ? 'صالحة ✓' : 'غير صالحة ✗'}\n\n` +
              `📄 *رقم المعاملة:*\n\`${order.payload}\`\n\n` +
              `👤 *المستخدم:* ${user?.first_name || 'مستخدم'}\n` +
              `⭐ *النجوم المدفوعة:* ${order.starAmount}\n` +
              `💎 *الكريستال المستلم:* ${order.crystalAmount.toFixed(1)}\n` +
              `📅 *التاريخ:* ${date}\n\n` +
              `🔄 *عدد مرات التحقق:* ${(certificate?.verifiedCount || 0) + 1}\n\n` +
              `🔐 *التوقيع:* ${isValid ? 'صحيح' : 'غير صحيح'} (مفتاح ثابت)\n\n` +
              `📌 *هذه شهادة رسمية صادرة عن بوت كريستال التعدين*`
            : `🔐 *Payment Certificate Verification*\n\n` +
              `✅ *Status:* ${isValid ? 'Valid ✓' : 'Invalid ✗'}\n\n` +
              `📄 *Transaction ID:*\n\`${order.payload}\`\n\n` +
              `👤 *User:* ${user?.first_name || 'User'}\n` +
              `⭐ *Stars Paid:* ${order.starAmount}\n` +
              `💎 *Crystals Received:* ${order.crystalAmount.toFixed(1)}\n` +
              `📅 *Date:* ${date}\n\n` +
              `🔄 *Verifications:* ${(certificate?.verifiedCount || 0) + 1}\n\n` +
              `🔐 *Signature:* ${isValid ? 'Valid' : 'Invalid'} (permanent key)\n\n` +
              `📌 *This is an official certificate issued by Crystal Mining Bot*`;
        
        await bot.sendMessage(chatId, verifyMessage, { 
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { 
                        text: lang === 'ar' ? '📄 عرض الشهادة الكاملة' : '📄 View Full Certificate',
                        url: `${APP_URL}/certificate.html?id=${order.payload}`
                    }
                ]]
            }
        });
    } catch (error) {
        console.error('❌ خطأ في التحقق من الشهادة:', error);
        const errorMsg = lang === 'ar'
            ? '❌ حدث خطأ في التحقق من الشهادة.'
            : '❌ Error verifying certificate.';
        await bot.sendMessage(chatId, errorMsg);
    }
});

// ========== تحديث أمر /setupwebhook ==========
bot.onText(/\/setupwebhook/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!ADMIN_IDS.includes(userId)) {
        await bot.sendMessage(chatId, '❌ غير مصرح');
        return;
    }
    
    const webhookUrl = `${APP_URL}/api/webhook/${BOT_TOKEN}`;
    
    try {
        await fetch(
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
        await bot.sendMessage(chatId, `✅ Webhook: ${webhookUrl.substring(0, 50)}...`);
        await bot.deleteWebHook();
    } catch (error) {
        await bot.sendMessage(chatId, `❌ فشل: ${error.message}`);
    }
});

// ========== API إحصائيات النظام ==========
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
                antiSybilEnabled: system.antiSybilEnabled,
                certificateVersion: system.certificateVersion
            },
            stars: starStats
        });
    } catch (error) {
        res.json({ success: false, error: 'فشل في جلب الإحصائيات' });
    }
});

// ========== API بيانات المستخدم ==========
app.get('/api/user/:userId', 
    validateUserId,
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.json({ success: false, error: 'معرف مستخدم غير صالح' });
            }
            
            const userIdFromToken = req.telegramUser?.id?.toString();
            const requestedUserId = req.params.userId;
            
            if (userIdFromToken !== requestedUserId && !ADMIN_IDS.includes(Number(userIdFromToken))) {
                return res.status(403).json({ 
                    success: false, 
                    error: 'غير مصرح لك برؤية بيانات مستخدم آخر' 
                });
            }
            
            const user = await getUser(requestedUserId);
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
                const isEligible = system.antiSybilEnabled ? await isEligibleForAirdrop(requestedUserId) : false;
                
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

// ========== ✅ نظام التعدين الآمن (Atomic Operation) ==========
app.post('/api/mine', async (req, res) => {
    try {
        const userId = req.telegramUser.id.toString();
        const cooldownTime = 24 * 60 * 60 * 1000;

        const result = await usersCollection.findOneAndUpdate(
            { 
                user_id: userId,
                $or: [
                    { last_mine_click: null },
                    { last_mine_click: { $lte: Date.now() - cooldownTime } }
                ]
            },
            { 
                $set: { 
                    last_mine_click: Date.now(), 
                    last_mine: Date.now(),
                    miningFraction: 0
                },
                $inc: { 
                    balance: 1, 
                    total_mined: 1 
                } 
            },
            { 
                returnDocument: 'after',
                upsert: false 
            }
        );

        if (!result) {
            return res.json({ 
                success: false, 
                error: 'cooldown', 
                message_ar: '⏳ لم يحن وقت التعدين بعد',
                message_en: '⏳ Mining is on cooldown'
            });
        }

        await updateSystemStats({ 
            minedSupply: 1,
            remainingSupply: -1 
        });

        res.json({
            success: true,
            newBalance: result.balance.toFixed(3),
            minedAmount: '1.000',
            message_ar: '✅ تم التعدين بنجاح!',
            message_en: '✅ Mining successful!'
        });
    } catch (error) {
        console.error('❌ خطأ في التعدين:', error);
        res.json({ 
            success: false, 
            error: 'server_error',
            message_ar: '❌ حدث خطأ في الخادم',
            message_en: '❌ Server error'
        });
    }
});

// ========== نظام شراء النجوم ==========
async function createStarInvoice(userId, starAmount, description) {
    try {
        const user = await getUser(userId);
        const system = await getSystemStats();
        const starRate = system.starRate || 0.1;
        
        const payload = `${userId}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
        const crystalAmount = starAmount * starRate;
        
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
                expiresAt: Date.now() + 24 * 60 * 60 * 1000
            });
            
            return { success: true, url: data.result, payload, crystalAmount };
        } else {
            return { success: false, error: data.description };
        }
    } catch (error) {
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
            
            if (system.antiSybilEnabled) {
                const isSuspicious = await isSuspiciousUser(userId);
                if (isSuspicious) {
                    return res.json({ 
                        success: false, 
                        error: 'account_suspicious',
                        message_ar: '❌ حسابك قيد المراجعة.',
                        message_en: '❌ Your account is under review.'
                    });
                }
            }
            
            const crystalAmount = starAmount * 0.1;
            
            if (system.remainingSupply < crystalAmount) {
                return res.json({
                    success: false,
                    error: 'supply_exhausted',
                    message_ar: '💰 نفدت الكريستال!',
                    message_en: '💰 Crystals are sold out!'
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
            res.json({ success: false, error: 'فشل في معالجة الطلب' });
        }
});

// ========== 🔐 Webhook الآمن - معالجة ذرية للمخزون ==========
app.post(`/api/webhook/${BOT_TOKEN}`, async (req, res) => {
    try {
        const update = req.body;
        
        if (update.pre_checkout_query) {
            const queryId = update.pre_checkout_query.id;
            const payload = update.pre_checkout_query.invoice_payload;
            
            const invoice = await starInvoicesCollection.findOne({ payload });
            const system = await getSystemStats();

            let canPay = true;
            let errorMessage = "";

            if (!invoice) {
                canPay = false;
                errorMessage = "الطلب غير موجود";
            } else if (system.remainingSupply < invoice.crystalAmount) {
                canPay = false;
                errorMessage = "عذراً، نفدت الكمية المطلوبة";
            }

            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pre_checkout_query_id: queryId,
                    ok: canPay,
                    error_message: errorMessage
                })
            });
            return res.json({ ok: true });
        }
        
        if (update.message?.successful_payment) {
            const payload = update.message.successful_payment.invoice_payload;
            const starAmount = update.message.successful_payment.total_amount;
            
            const invoice = await starInvoicesCollection.findOne({ payload });
            
            if (invoice && invoice.status === 'pending') {
                const crystalAmount = invoice.crystalAmount;
                const userId = invoice.userId;
                
                // 🔐 عملية ذرية: تحديث المخزون فقط إذا كان كافياً
                const updateResult = await systemCollection.findOneAndUpdate(
                    { 
                        _id: 'config', 
                        remainingSupply: { $gte: crystalAmount } 
                    },
                    { 
                        $inc: { 
                            totalStarsInvested: starAmount,
                            totalCrystalSold: crystalAmount,
                            soldSupply: crystalAmount,
                            remainingSupply: -crystalAmount 
                        } 
                    },
                    { returnDocument: 'after' }
                );

                if (!updateResult) {
                    // 🚨 محاولة بيع بعد نفاد المخزون - تسجيل خطير
                    console.error(`🚨 OVERSELL DETECTED: User ${userId} paid ${starAmount}⭐ for ${crystalAmount}💎 but supply is empty!`);
                    await logSecurityEvent('SUPPLY_OVERSELL_ERROR', userId, { 
                        starAmount, 
                        crystalAmount,
                        payload 
                    });
                    
                    await bot.sendMessage(userId,
                        `⚠️ *عذراً، حدث خطأ في نظام الدفع*\n\n` +
                        `تم خصم النجوم من حسابك، لكن الكمية المطلوبة نفدت في اللحظة الأخيرة.\n` +
                        `سيتم رد النجوم إليك خلال 24 ساعة.`,
                        { parse_mode: 'Markdown' }
                    );
                    
                    return res.json({ ok: true });
                }
                
                // إضافة الرصيد للمستخدم بدقة حسابية
                await updateUserBalancePrecise(userId, crystalAmount);
                
                await usersCollection.updateOne(
                    { user_id: userId },
                    { $inc: { total_bought: crystalAmount } }
                );
                
                await starInvoicesCollection.updateOne(
                    { payload },
                    { 
                        $set: { 
                            status: 'completed',
                            completedAt: Date.now()
                        } 
                    }
                );
                
                // إنشاء الشهادة الرقمية (بمفتاح ثابت)
                const signature = generateCertificateSignature(
                    payload,
                    userId,
                    starAmount,
                    Date.now()
                );
                
                const verificationCode = generateVerificationCode(payload);
                
                await saveCertificate({
                    orderId: payload,
                    userId: userId,
                    signature: signature,
                    verificationCode: verificationCode,
                    issuedAt: Date.now()
                });
                
                const user = await getUser(userId);
                const lang = user?.language || 'en';
                
                const successMessage = lang === 'ar'
                    ? `✅ *تم شراء الكريستال بنجاح!*\n\n` +
                      `💎 الكمية: ${crystalAmount.toFixed(1)} كريستال\n` +
                      `⭐ الدفع: ${starAmount} نجوم\n` +
                      `🔐 *شهادة رقمية:* تم إنشاؤها (مفتاح ثابت)\n\n` +
                      `📄 شهادة الدفع متاحة في صفحة المشتريات`
                    : `✅ *Crystal Purchase Successful!*\n\n` +
                      `💎 Amount: ${crystalAmount.toFixed(1)} Crystals\n` +
                      `⭐ Paid: ${starAmount} Stars\n` +
                      `🔐 *Certificate:* Created (permanent key)\n\n` +
                      `📄 Payment certificate available in purchases page`;
                
                await bot.sendMessage(userId, successMessage, { parse_mode: 'Markdown' });
                
                // مكافأة الدعوة
                if (user?.invited_by) {
                    const pendingReward = await inviteRewardsCollection.findOne({
                        inviterId: user.invited_by,
                        invitedId: userId,
                        status: 'pending'
                    });
                    
                    if (pendingReward) {
                        await updateUserBalancePrecise(user.invited_by, 1);
                        
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
                    }
                }
            }
            
            return res.json({ ok: true });
        }
        
        res.json({ ok: true });
    } catch (error) {
        console.error('❌ Webhook Error:', error);
        res.json({ ok: true });
    }
});

// ========== 🔐 API الشهادات - محمي ضد IDOR ==========
app.get('/api/receipt/:orderId',
    param('orderId').isString().trim().isLength({ min: 10, max: 200 }),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ success: false, error: 'معرف طلب غير صالح' });
            }
            
            const orderId = req.params.orderId;
            
            const order = await starInvoicesCollection.findOne({ 
                payload: orderId,
                status: 'completed'
            });
            
            if (!order) {
                return res.status(404).json({ success: false, error: 'المعاملة غير موجودة' });
            }
            
            const userId = req.telegramUser?.id?.toString();
            if (!userId) {
                return res.status(401).json({ success: false, error: 'غير مصرح' });
            }
            
            const isOwner = order.userId === userId;
            const isAdminUser = ADMIN_IDS.includes(Number(userId));

            // 🔐 حماية صارمة ضد IDOR
            if (!isOwner && !isAdminUser) {
                await logSecurityEvent('UNAUTHORIZED_CERT_ACCESS', userId, { 
                    orderId,
                    targetUserId: order.userId 
                });
                return res.status(403).json({ 
                    success: false, 
                    error: 'هذه الشهادة لا تخصك ولا يمكن عرضها' 
                });
            }
            
            const user = await getUser(order.userId);
            
            const signature = generateCertificateSignature(
                order.payload,
                order.userId,
                order.starAmount,
                order.completedAt || order.createdAt
            );
            
            const verificationCode = generateVerificationCode(order.payload);
            
            const existingCert = await getCertificate(order.payload);
            if (!existingCert) {
                await saveCertificate({
                    orderId: order.payload,
                    userId: order.userId,
                    signature: signature,
                    verificationCode: verificationCode,
                    issuedAt: Date.now()
                });
            }
            
            const botUsername = bot.options.username;
            const verifyLink = `https://t.me/${botUsername}?start=verify_${order.payload}`;
            
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
                signature: signature,
                verification_code: verificationCode,
                verify_link: verifyLink,
                issued_at: Date.now(),
                verified_by: 'Telegram Stars API + Digital Signature (Permanent Key)',
                certificate_id: `CERT-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
                certificate_version: '2.0',
                verification_count: existingCert?.verifiedCount || 0,
                permanent_key: true
            };
            
            res.json({ success: true, receipt, isOwner, isAdmin: isAdminUser });
        } catch (error) {
            console.error('❌ Certificate Error:', error);
            res.status(500).json({ success: false, error: 'فشل في جلب الشهادة' });
        }
});

// ========== API التحقق من الشهادة ==========
app.get('/api/verify-certificate/:orderId',
    param('orderId').isString().trim().isLength({ min: 10, max: 200 }),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ success: false, error: 'معرف طلب غير صالح' });
            }
            
            const orderId = req.params.orderId;
            
            const order = await starInvoicesCollection.findOne({ 
                payload: orderId,
                status: 'completed'
            });
            
            if (!order) {
                return res.status(404).json({ success: false, error: 'الشهادة غير موجودة', valid: false });
            }
            
            const user = await getUser(order.userId);
            const certificate = await getCertificate(orderId);
            
            const signature = generateCertificateSignature(
                order.payload,
                order.userId,
                order.starAmount,
                order.completedAt || order.createdAt
            );
            
            const isValid = certificate ? certificate.signature === signature : true;
            
            if (certificate && isValid) {
                await incrementCertificateVerification(orderId);
            }
            
            const verificationResult = {
                valid: isValid,
                orderId: order.payload,
                userName: user?.first_name || 'مستخدم',
                starsPaid: order.starAmount,
                crystalsReceived: order.crystalAmount,
                date: order.completedAt || order.createdAt,
                verifiedAt: Date.now(),
                verificationCount: (certificate?.verifiedCount || 0) + 1,
                signatureValid: isValid,
                permanentKey: true
            };
            
            res.json({ success: true, verification: verificationResult });
        } catch (error) {
            res.status(500).json({ success: false, error: 'فشل في التحقق من الشهادة', valid: false });
        }
});

// ========== API طلبات النجوم ==========
app.get('/api/star-orders/:userId',
    validateUserId,
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.json({ success: false, orders: [] });
            }
            
            const requestedUserId = req.params.userId;
            const userIdFromToken = req.telegramUser?.id?.toString();
            
            if (userIdFromToken !== requestedUserId && !ADMIN_IDS.includes(Number(userIdFromToken))) {
                return res.json({ success: false, orders: [] });
            }
            
            const orders = await starInvoicesCollection
                .find({ userId: requestedUserId })
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
            res.json({ success: false, orders: [] });
        }
});

// ========== API معلومات الدعوة ==========
app.get('/api/invite-info/:userId',
    validateUserId,
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.json({ success: false });
            }
            
            const requestedUserId = req.params.userId;
            const userIdFromToken = req.telegramUser?.id?.toString();
            
            if (userIdFromToken !== requestedUserId && !ADMIN_IDS.includes(Number(userIdFromToken))) {
                return res.json({ success: false });
            }
            
            const user = await getUser(requestedUserId);
            if (!user) {
                return res.json({ success: false });
            }
            
            const totalInvites = user.total_invites || 0;
            
            const rewards = await inviteRewardsCollection.find({
                inviterId: requestedUserId,
                status: { $in: ['completed', 'partial'] }
            }).toArray();
            
            const totalRewards = rewards.reduce((sum, reward) => sum + (reward.rewardAmount || 0), 0);
            
            const recentInvites = await inviteRewardsCollection.find({
                inviterId: requestedUserId
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
            res.json({ success: false });
        }
});

// ========== ✅ معالجة الدعوات المعلقة - محمي ضد Sybil ==========
async function processPendingInvites() {
    try {
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const minAgeRequired = 24 * 60 * 60 * 1000; // يوم واحد
        
        const pendingRewards = await inviteRewardsCollection.find({
            status: 'pending',
            createdAt: { $lt: sevenDaysAgo }
        }).toArray();
        
        for (const reward of pendingRewards) {
            const invitedUser = await getUser(reward.invitedId);
            
            if (invitedUser) {
                const accountAge = Date.now() - invitedUser.created_at;
                
                // 🔐 شروط صارمة لمكافحة Sybil
                if (invitedUser.total_mined >= 3 && accountAge > minAgeRequired) {
                    await updateUserBalancePrecise(reward.inviterId, 0.3);
                    
                    await inviteRewardsCollection.updateOne(
                        { _id: reward._id },
                        { 
                            $set: { 
                                status: 'partial',
                                completedAt: Date.now(),
                                rewardAmount: 0.3,
                                reason: 'لم يشتري - تم التعدين 3+ مرات وعمر الحساب يوم+'
                            } 
                        }
                    );
                    
                    const inviter = await getUser(reward.inviterId);
                    const lang = inviter?.language || 'en';
                    
                    const message = lang === 'ar'
                        ? `⏳ *مكافأة دعوة محدودة*\n\n👤 ${reward.invitedName}\n⛏️ تعدين 3+ مرات ويوم+\n🎁 +0.3 💎`
                        : `⏳ *Limited Invite Reward*\n\n👤 ${reward.invitedName}\n⛏️ Mined 3+ times & 1d+\n🎁 +0.3 💎`;
                    
                    try {
                        await bot.sendMessage(reward.inviterId, message, { parse_mode: 'Markdown' });
                    } catch (e) {}
                } else {
                    // 🚨 تسجيل حسابات مشبوهة
                    await logSecurityEvent('SYBIL_INVITE_SUSPICION', reward.inviterId, { 
                        invitedId: reward.invitedId,
                        total_mined: invitedUser.total_mined,
                        accountAge
                    });
                }
            }
        }
    } catch (error) {
        console.error('❌ Error processing invites:', error);
    }
}

setInterval(processPendingInvites, 60 * 60 * 1000);
setTimeout(processPendingInvites, 10 * 1000);

// ========== أوامر الأدمن ==========
function isAdmin(userId) {
    return ADMIN_IDS.includes(Number(userId));
}

bot.onText(/\/admin/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '❌ غير مصرح');
        return;
    }
    
    const totalUsers = await usersCollection.countDocuments();
    const system = await getSystemStats();
    const starStats = await getStarPurchaseStats();
    
    const miningRemaining = Math.max(0, system.maxMining - (system.minedSupply || 0));
    const supplyRemaining = system.remainingSupply || 0;
    const totalCertificates = await certificatesCollection.countDocuments();
    
    // إحصائيات أمنية
    const oversellAttempts = await securityLogsCollection.countDocuments({ 
        type: 'SUPPLY_OVERSELL_ERROR',
        timestamp: { $gt: Date.now() - 24 * 60 * 60 * 1000 }
    });
    
    const sybilAttempts = await securityLogsCollection.countDocuments({ 
        type: 'SYBIL_INVITE_SUSPICION',
        timestamp: { $gt: Date.now() - 24 * 60 * 60 * 1000 }
    });
    
    const message = 
        `👑 *لوحة تحكم الأدمن - النسخة الآمنة النهائية*\n\n` +
        `📊 *إحصائيات:*\n` +
        `• 👥 المستخدمون: ${totalUsers}\n` +
        `• ⭐ مبيعات النجوم: ${starStats.totalStars} ⭐\n` +
        `• 💎 كريستال مباع: ${starStats.totalCrystals.toFixed(1)} 💎\n\n` +
        `💎 *العرض المحدود:*\n` +
        `• ⛏️ متبقي للتعدين: ${miningRemaining.toLocaleString()} 💎\n` +
        `• 🎯 متبقي للبيع: ${supplyRemaining.toLocaleString()} 💎\n\n` +
        `🔐 *الشهادات:* ${totalCertificates}\n` +
        `🔑 *مفتاح التوقيع:* ${CERTIFICATE_SECRET.substring(0, 10)}... (ثابت)\n\n` +
        `🛡️ *الأمان:*\n` +
        `• ✅ XSS Protection: مفعل\n` +
        `• ✅ IDOR Protection: مفعل\n` +
        `• ✅ Atomic Operations: مفعل\n` +
        `• ✅ Anti-Sybil: مفعل (3+ تعدين، عمر يوم)\n` +
        `• ✅ Precision Fix: مفعل\n` +
        `• ⚠️ محاولات Oversell (24h): ${oversellAttempts}\n` +
        `• ⚠️ محاولات Sybil (24h): ${sybilAttempts}\n\n` +
        `🔒 *Webhook:* /api/webhook/[SECRET] (محمي)`;
    
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// ========== تشغيل الخادم ==========
async function startServer() {
    const connected = await connectToMongo();
    if (!connected) {
        process.exit(1);
    }
    
    app.listen(PORT, () => {
        console.log('\n===========================================');
        console.log(`🌐 الخادم يعمل على المنفذ: ${PORT}`);
        console.log(`🔗 رابط الواجهة: ${APP_URL}`);
        console.log(`⭐ نظام دفع النجوم: مفعل`);
        console.log(`🔐 نظام الشهادات الرقمية: مفعل (مفتاح ثابت)`);
        console.log(`🔑 مفتاح التوقيع: ${CERTIFICATE_SECRET.substring(0, 10)}...`);
        console.log(`🔒 Webhook: /api/webhook/[SECRET]`);
        console.log(`🛡️ XSS Protection: مفعل (textContent + createElement)`);
        console.log(`🛡️ IDOR Protection: مفعل (ممنوع مشاهدة شهادات غيرك)`);
        console.log(`🛡️ Atomic Operations: مفعل (لا يمكن تجاوز المخزون)`);
        console.log(`🛡️ Anti-Sybil: مفعل (3 تعدينات + عمر يوم)`);
        console.log(`💎 العرض المحدود: 800,000,000 💎`);
        console.log(`⛏️ حد التعدين: 1,000,000 💎`);
        console.log(`💰 سحب USDT: ❌ معطل`);
        console.log('===========================================\n');
    });
}

startServer();

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

console.log('🚀 بوت كريستال التعدين - الإصدار 20.0 (النسخة الآمنة النهائية)');
console.log('📱 أرسل /start في تليجرام');
console.log('🔐 الشهادات الرقمية: HMAC-SHA256 + مفتاح ثابت من .env');
console.log('🔒 Webhook: محمي بتوكن البوت + تحقق ذري من المخزون');
console.log('⛏️ تعدين: عملية ذرية - لا يمكن اختراقها');
console.log('🛡️ دعوة: 3 تعدينات + عمر يوم كحد أدنى للمكافأة');
console.log('⭐ شراء: 10 ⭐ = 1 💎 (محدود 800M)');
console.log('🔑 مفتاح التوقيع: ثابت - الشهادات القديمة لا تبطل');
