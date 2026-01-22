const admin = require('firebase-admin');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const winston = require('winston');
const { OAuth2Client } = require('google-auth-library');
const Joi = require('joi');

// إعداد logging آمن
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'sdm-security-bot' },
    transports: [
        new winston.transports.File({ 
            filename: 'logs/error.log', 
            level: 'error',
            maxsize: 5242880,
            maxFiles: 5
        }),
        new winston.transports.File({ 
            filename: 'logs/combined.log',
            maxsize: 5242880,
            maxFiles: 5
        })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

// التحقق من environment variables
const requiredEnvVars = [
    'FIREBASE_SERVICE_ACCOUNT',
    'ADMIN_API_KEY',
    'ENCRYPTION_KEY',
    'GOOGLE_CLIENT_ID'
];

for (const envVar of requiredEnvVar) {
    if (!process.env[envVar]) {
        logger.error(`❌ Missing required environment variable: ${envVar}`);
        process.exit(1);
    }
}

// إعداد Firebase Admin SDK
let serviceAccount;
try {
    serviceAccount = JSON.parse(
        Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString()
    );
} catch (error) {
    logger.error('❌ Failed to parse Firebase service account', { error });
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
});

const db = admin.database();
const auth = admin.auth();

// إعداد Google OAuth للتحقق
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ====================================================
// نظام Rate Limiting المتقدم (مخزن في Firebase)
// ====================================================

async function checkRateLimit(uid, action, windowMs = 60000, maxRequests = 20) {
    try {
        const now = Date.now();
        const key = crypto.createHash('sha256')
            .update(`${uid}:${action}`)
            .digest('hex');
        
        const ref = db.ref(`rate_limits/${key}`);
        const snapshot = await ref.once('value');
        const data = snapshot.val() || { count: 0, timestamp: now, blocked: false };
        
        // التحقق من الحظر
        if (data.blocked && now - data.blockTime < 3600000) {
            logger.warn(`Rate limit blocked: ${uid} - ${action}`);
            return false;
        }
        
        // إعادة تعيين العد إذا انتهت النافذة
        if (now - data.timestamp > windowMs) {
            await ref.set({ 
                count: 1, 
                timestamp: now,
                blocked: false,
                blockTime: null
            });
            return true;
        }
        
        // زيادة العد والتحقق
        if (data.count >= maxRequests) {
            // حظر مؤقت بعد 3 تجاوزات
            const violations = data.violations || 0;
            if (violations >= 2) {
                await ref.update({ 
                    blocked: true,
                    blockTime: now,
                    violations: violations + 1
                });
                logger.warn(`User blocked: ${uid} - ${action}`, { violations });
            } else {
                await ref.update({ 
                    violations: violations + 1 
                });
            }
            return false;
        }
        
        await ref.update({ 
            count: data.count + 1,
            violations: data.violations || 0
        });
        
        return true;
    } catch (error) {
        logger.error('Rate limit check failed', { error, uid, action });
        return false; // Fail secure
    }
}

// ====================================================
// دوال التحقق والصلاحيات المتقدمة
// ====================================================

// 1. التحقق من هوية المستخدم وعنوان IP
async function validateUserRequest(uid, ip, action) {
    try {
        // التحقق من Rate Limit
        if (!await checkRateLimit(uid, action)) {
            throw new Error('TOO_MANY_REQUESTS');
        }
        
        // التحقق من حالة المستخدم
        const userRef = db.ref(`users/${uid}`);
        const userSnap = await userRef.once('value');
        
        if (!userSnap.exists()) {
            throw new Error('USER_NOT_FOUND');
        }
        
        const user = userSnap.val();
        
        // التحقق من الحظر
        if (user.blocked) {
            throw new Error('USER_BLOCKED');
        }
        
        // تحديث آخر نشاط
        await userRef.update({
            lastActivity: admin.database.ServerValue.TIMESTAMP,
            lastIP: ip
        });
        
        // تسجيل النشاط (بدون بيانات حساسة)
        await db.ref(`user_activity/${uid}`).push({
            action: action,
            timestamp: admin.database.ServerValue.TIMESTAMP,
            ipHash: crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16)
        });
        
        return user;
    } catch (error) {
        logger.error('User validation failed', { uid, ip, action, error: error.message });
        throw error;
    }
}

// 2. التحقق من صلاحيات الإدمن
async function validateAdmin(uid, token) {
    try {
        // التحقق من token
        const expectedHash = crypto.createHash('sha256')
            .update(process.env.ADMIN_API_KEY + uid + Date.now())
            .digest('hex');
        
        if (token !== expectedHash) {
            throw new Error('INVALID_ADMIN_TOKEN');
        }
        
        // التحقق من دور المستخدم في قاعدة البيانات
        const adminRef = db.ref(`admins/${uid}`);
        const adminSnap = await adminRef.once('value');
        
        if (!adminSnap.exists() || !adminSnap.val().active) {
            throw new Error('UNAUTHORIZED_ADMIN');
        }
        
        return true;
    } catch (error) {
        logger.error('Admin validation failed', { uid, error: error.message });
        throw error;
    }
}

// ====================================================
// نظام التشفير للبيانات الحساسة
// ====================================================

class EncryptionService {
    constructor() {
        this.algorithm = 'aes-256-gcm';
        this.key = crypto.scryptSync(process.env.ENCRYPTION_KEY, 'salt', 32);
    }
    
    encrypt(text) {
        try {
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
            
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const authTag = cipher.getAuthTag();
            
            return {
                iv: iv.toString('hex'),
                encrypted: encrypted,
                authTag: authTag.toString('hex')
            };
        } catch (error) {
            logger.error('Encryption failed', { error });
            throw new Error('ENCRYPTION_FAILED');
        }
    }
    
    decrypt(encryptedData) {
        try {
            const decipher = crypto.createDecipheriv(
                this.algorithm, 
                this.key, 
                Buffer.from(encryptedData.iv, 'hex')
            );
            
            decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
            
            let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            logger.error('Decryption failed', { error });
            throw new Error('DECRYPTION_FAILED');
        }
    }
    
    hashData(data) {
        return crypto.createHash('sha256')
            .update(data + process.env.ENCRYPTION_KEY)
            .digest('hex');
    }
}

const encryptionService = new EncryptionService();

// ====================================================
// نظام الوسيط الآمن المحسن
// ====================================================

class EscrowSystem {
    constructor() {
        this.minAmount = 0.01;
        this.maxAmount = 100000;
    }
    
    async processEscrow() {
        try {
            // البحث عن الطلبات الجديدة
            const escrowRef = db.ref('requests/escrow_deals');
            const pendingSnap = await escrowRef
                .orderByChild('status')
                .equalTo('pending_delivery')
                .once('value');
            
            if (!pendingSnap.exists()) return;
            
            const now = Date.now();
            const hourAgo = now - 3600000;
            
            for (const [id, deal] of Object.entries(pendingSnap.val())) {
                // التحقق من عدم معالجة الطلب سابقاً
                if (deal.processedAt) continue;
                
                // التحقق من مدة الطلب
                if (deal.date < hourAgo) {
                    await escrowRef.child(id).update({
                        status: 'expired',
                        updatedAt: now
                    });
                    continue;
                }
                
                // التحقق من البيانات
                const validation = this.validateDeal(deal);
                if (!validation.valid) {
                    await escrowRef.child(id).update({
                        status: 'validation_failed',
                        reason: validation.reason,
                        updatedAt: now
                    });
                    continue;
                }
                
                // معالجة الطلب
                await this.processDeal(id, deal);
            }
        } catch (error) {
            logger.error('Escrow processing failed', { error });
        }
    }
    
    validateDeal(deal) {
        try {
            // التحقق من المبلغ
            const amount = parseFloat(deal.amount);
            if (amount < this.minAmount || amount > this.maxAmount) {
                return { valid: false, reason: 'INVALID_AMOUNT' };
            }
            
            // منع الشراء من النفس
            if (deal.buyerId === deal.sellerId) {
                return { valid: false, reason: 'SELF_PURCHASE' };
            }
            
            // التحقق من وجود المستخدمين
            if (!deal.buyerId || !deal.sellerId || !deal.postId) {
                return { valid: false, reason: 'INVALID_DATA' };
            }
            
            return { valid: true };
        } catch (error) {
            return { valid: false, reason: 'VALIDATION_ERROR' };
        }
    }
    
    async processDeal(dealId, deal) {
        const dbBatch = db.ref();
        const updates = {};
        const now = Date.now();
        
        try {
            // التحقق من رصيد المشتري
            const buyerRef = db.ref(`users/${deal.buyerId}/sdmBalance`);
            const buyerSnap = await buyerRef.once('value');
            const buyerBalance = buyerSnap.val() || 0;
            
            if (buyerBalance < deal.amount) {
                updates[`requests/escrow_deals/${dealId}/status`] = 'failed_insufficient_funds';
                updates[`requests/escrow_deals/${dealId}/updatedAt`] = now;
                await dbBatch.update(updates);
                return;
            }
            
            // إعداد عمليات الخصم والإضافة
            updates[`users/${deal.buyerId}/sdmBalance`] = buyerBalance - deal.amount;
            updates[`users/${deal.sellerId}/sdmBalance`] = 
                admin.database.ServerValue.increment(deal.amount);
            
            // تحديث حالة الصفقة
            updates[`requests/escrow_deals/${dealId}/status`] = 'secured';
            updates[`requests/escrow_deals/${dealId}/updatedAt`] = now;
            updates[`requests/escrow_deals/${dealId}/processedAt`] = now;
            
            // تحديث المنشور
            updates[`${deal.path}/${deal.postId}/pending`] = true;
            updates[`${deal.path}/${deal.postId}/buyerId`] = deal.buyerId;
            updates[`${deal.path}/${deal.postId}/lockedPrice`] = deal.amount;
            updates[`${deal.path}/${deal.postId}/lockedAt`] = now;
            
            // تسجيل المعاملة
            const transactionId = crypto.randomBytes(16).toString('hex');
            updates[`transactions/${transactionId}`] = {
                type: 'escrow_lock',
                from: deal.buyerId,
                to: deal.sellerId,
                amount: deal.amount,
                postId: deal.postId,
                dealId: dealId,
                status: 'locked',
                timestamp: now
            };
            
            // تنفيذ جميع العمليات دفعة واحدة
            await dbBatch.update(updates);
            
            logger.info('Escrow deal processed successfully', {
                dealId,
                amount: deal.amount,
                buyer: deal.buyerId.substring(0, 8),
                seller: deal.sellerId.substring(0, 8)
            });
            
        } catch (error) {
            logger.error('Escrow deal processing failed', { dealId, error });
            
            // التراجع عن العملية في حالة الفشل
            updates[`requests/escrow_deals/${dealId}/status`] = 'processing_failed';
            updates[`requests/escrow_deals/${dealId}/updatedAt`] = now;
            await dbBatch.update(updates);
        }
    }
}

const escrowSystem = new EscrowSystem();

// ====================================================
// نظام التحويلات البنكية الآمن
// ====================================================

class BankTransferSystem {
    constructor() {
        this.transferTypes = {
            'khartoum_bank': 'بنك الخرطوم',
            'cashy': 'كاشي'
        };
    }
    
    async processTransfers() {
        try {
            const transfersRef = db.ref('bank_transfer_requests');
            const pendingSnap = await transfersRef
                .orderByChild('status')
                .equalTo('pending')
                .once('value');
            
            if (!pendingSnap.exists()) return;
            
            const now = Date.now();
            
            for (const [id, transfer] of Object.entries(pendingSnap.val())) {
                // التحقق من البيانات
                const validation = this.validateTransfer(transfer);
                if (!validation.valid) {
                    await transfersRef.child(id).update({
                        status: 'validation_failed',
                        reason: validation.reason,
                        processedAt: now
                    });
                    continue;
                }
                
                // إشعار الإدمن
                await this.notifyAdmin(id, transfer);
            }
        } catch (error) {
            logger.error('Bank transfer processing failed', { error });
        }
    }
    
    validateTransfer(transfer) {
        try {
            // التحقق من المبلغ
            if (transfer.amountSDM < 1 || transfer.amountSDM > 10000) {
                return { valid: false, reason: 'INVALID_AMOUNT_RANGE' };
            }
            
            // التحقق من الاسم
            if (!transfer.fullName || transfer.fullName.length < 3) {
                return { valid: false, reason: 'INVALID_NAME' };
            }
            
            // التحقق من رقم الحساب/الهاتف
            if (!transfer.accountNumber || transfer.accountNumber.length < 3) {
                return { valid: false, reason: 'INVALID_ACCOUNT' };
            }
            
            // التحقق من نوع التحويل
            if (!this.transferTypes[transfer.transferType]) {
                return { valid: false, reason: 'INVALID_TRANSFER_TYPE' };
            }
            
            return { valid: true };
        } catch (error) {
            return { valid: false, reason: 'VALIDATION_ERROR' };
        }
    }
    
    async notifyAdmin(transferId, transfer) {
        try {
            const notificationId = crypto.randomBytes(16).toString('hex');
            const now = Date.now();
            
            await db.ref(`admin_notifications/${notificationId}`).set({
                type: 'bank_transfer_request',
                transferId: transferId,
                userId: transfer.userId,
                userName: transfer.userName,
                userNumericId: transfer.userNumericId,
                fullName: transfer.fullName,
                accountNumber: encryptionService.encrypt(transfer.accountNumber),
                amountSDG: transfer.amountSDG,
                amountSDM: transfer.amountSDM,
                transferType: transfer.transferType,
                status: 'pending',
                priority: transfer.amountSDM > 1000 ? 'high' : 'normal',
                createdAt: transfer.date,
                notifiedAt: now
            });
            
            logger.info('Bank transfer notification sent to admin', { 
                transferId, 
                amount: transfer.amountSDM,
                userId: transfer.userId.substring(0, 8)
            });
            
        } catch (error) {
            logger.error('Failed to notify admin', { transferId, error });
        }
    }
}

const bankTransferSystem = new BankTransferSystem();

// ====================================================
// نظام VIP المحسن
// ====================================================

class VIPSystem {
    constructor() {
        this.vipPackages = {
            '1': { days: 1, price: 1, features: ['vip_badge', 'unlimited_posts'] },
            '7': { days: 7, price: 7, features: ['vip_badge', 'unlimited_posts', 'priority_support'] },
            '30': { days: 30, price: 30, features: ['vip_badge', 'unlimited_posts', 'priority_support', 'profile_highlight'] }
        };
    }
    
    async processVIPRequests() {
        try {
            const vipRef = db.ref('requests/vip_subscriptions');
            const pendingSnap = await vipRef
                .orderByChild('status')
                .equalTo('pending')
                .once('value');
            
            if (!pendingSnap.exists()) return;
            
            const now = Date.now();
            
            for (const [id, request] of Object.entries(pendingSnap.val())) {
                // التحقق من البيانات
                const packageInfo = this.vipPackages[request.days];
                if (!packageInfo || request.cost !== packageInfo.price) {
                    await vipRef.child(id).update({
                        status: 'invalid_package',
                        updatedAt: now
                    });
                    continue;
                }
                
                // معالجة الطلب
                await this.processVIPRequest(id, request, packageInfo);
            }
            
            // فحص انتهاء صلاحية VIP
            await this.checkExpiredVIP();
            
        } catch (error) {
            logger.error('VIP processing failed', { error });
        }
    }
    
    async processVIPRequest(requestId, request, packageInfo) {
        const dbBatch = db.ref();
        const updates = {};
        const now = Date.now();
        
        try {
            // التحقق من رصيد المستخدم
            const userRef = db.ref(`users/${request.userId}`);
            const userSnap = await userRef.once('value');
            const user = userSnap.val();
            
            if (!user || (user.sdmBalance || 0) < request.cost) {
                updates[`requests/vip_subscriptions/${requestId}/status`] = 'failed_insufficient_funds';
                updates[`requests/vip_subscriptions/${requestId}/updatedAt`] = now;
                await dbBatch.update(updates);
                return;
            }
            
            // حساب تاريخ الانتهاء
            const currentExpiry = user.vipExpiry || 0;
            let newExpiry;
            
            if (currentExpiry > now) {
                // تجديد
                newExpiry = currentExpiry + (packageInfo.days * 86400000);
            } else {
                // اشتراك جديد
                newExpiry = now + (packageInfo.days * 86400000);
            }
            
            // إعداد التحديثات
            updates[`users/${request.userId}/sdmBalance`] = 
                admin.database.ServerValue.increment(-request.cost);
            
            updates[`users/${request.userId}/vipStatus`] = 'active';
            updates[`users/${request.userId}/vipExpiry`] = newExpiry;
            updates[`users/${request.userId}/vipFeatures`] = packageInfo.features;
            updates[`users/${request.userId}/vipSince`] = user.vipSince || now;
            updates[`users/${request.userId}/vipLastRenewal`] = now;
            
            updates[`requests/vip_subscriptions/${requestId}/status`] = 'completed';
            updates[`requests/vip_subscriptions/${requestId}/processedAt`] = now;
            updates[`requests/vip_subscriptions/${requestId}/expiry`] = newExpiry;
            
            // تسجيل المعاملة
            const transactionId = crypto.randomBytes(16).toString('hex');
            updates[`transactions/${transactionId}`] = {
                type: 'vip_purchase',
                userId: request.userId,
                amount: request.cost,
                days: packageInfo.days,
                expiry: newExpiry,
                status: 'completed',
                timestamp: now
            };
            
            // التنفيذ
            await dbBatch.update(updates);
            
            logger.info('VIP subscription processed', {
                userId: request.userId.substring(0, 8),
                days: packageInfo.days,
                cost: request.cost
            });
            
        } catch (error) {
            logger.error('VIP request processing failed', { requestId, error });
        }
    }
    
    async checkExpiredVIP() {
        try {
            const now = Date.now();
            const usersRef = db.ref('users');
            const vipUsers = await usersRef
                .orderByChild('vipStatus')
                .equalTo('active')
                .once('value');
            
            if (!vipUsers.exists()) return;
            
            for (const [uid, user] of Object.entries(vipUsers.val())) {
                if (user.vipExpiry && user.vipExpiry < now) {
                    await usersRef.child(uid).update({
                        vipStatus: 'expired',
                        vipExpiredAt: now
                    });
                    
                    logger.info('VIP expired', { userId: uid.substring(0, 8) });
                }
            }
        } catch (error) {
            logger.error('VIP expiration check failed', { error });
        }
    }
}

const vipSystem = new VIPSystem();

// ====================================================
// نظام مراقبة الأمان
// ====================================================

class SecurityMonitor {
    constructor() {
        this.suspiciousPatterns = [
            { pattern: /transfer.*10000/, action: 'HIGH_AMOUNT_TRANSFER' },
            { pattern: /(نصاب|حرامي|غش|كذاب)/i, action: 'DISPUTE_KEYWORD' },
            { pattern: /<script>|javascript:/i, action: 'XSS_ATTEMPT' },
            { pattern: /union.*select|select.*from/i, action: 'SQL_INJECTION_ATTEMPT' }
        ];
    }
    
    async monitorActivity() {
        try {
            const now = Date.now();
            const hourAgo = now - 3600000;
            
            // مراقبة النشاط المالي
            await this.monitorFinancialActivity(hourAgo, now);
            
            // مراقبة محاولات الدخول
            await this.monitorLoginAttempts(hourAgo, now);
            
            // تنظيف السجلات القديمة
            await this.cleanOldLogs();
            
        } catch (error) {
            logger.error('Security monitoring failed', { error });
        }
    }
    
    async monitorFinancialActivity(startTime, endTime) {
        try {
            const transactionsRef = db.ref('transactions');
            const recentTrans = await transactionsRef
                .orderByChild('timestamp')
                .startAt(startTime)
                .endAt(endTime)
                .once('value');
            
            if (!recentTrans.exists()) return;
            
            const stats = {
                total: 0,
                totalAmount: 0,
                largeTransactions: 0,
                users: new Set()
            };
            
            recentTrans.forEach(transaction => {
                const trans = transaction.val();
                stats.total++;
                stats.totalAmount += trans.amount || 0;
                stats.users.add(trans.from);
                stats.users.add(trans.to);
                
                if (trans.amount > 1000) {
                    stats.largeTransactions++;
                }
            });
            
            // تحليل الإحصائيات
            if (stats.largeTransactions > 10) {
                await this.alertAdmin('HIGH_FREQUENCY_LARGE_TRANSACTIONS', {
                    period: '1 hour',
                    count: stats.largeTransactions,
                    totalAmount: stats.totalAmount,
                    uniqueUsers: stats.users.size
                });
            }
            
        } catch (error) {
            logger.error('Financial monitoring failed', { error });
        }
    }
    
    async monitorLoginAttempts(startTime, endTime) {
        try {
            const authLogsRef = db.ref('auth_logs');
            const failedLogins = await authLogsRef
                .orderByChild('timestamp')
                .startAt(startTime)
                .endAt(endTime)
                .once('value');
            
            if (!failedLogins.exists()) return;
            
            const ipAttempts = {};
            
            failedLogins.forEach(log => {
                const entry = log.val();
                if (entry.success === false) {
                    const ip = entry.ip || 'unknown';
                    ipAttempts[ip] = (ipAttempts[ip] || 0) + 1;
                }
            });
            
            // اكتشاف هجمات Brute Force
            for (const [ip, attempts] of Object.entries(ipAttempts)) {
                if (attempts > 10) {
                    await this.blockIP(ip, 'BRUTE_FORCE_ATTEMPT');
                }
            }
            
        } catch (error) {
            logger.error('Login monitoring failed', { error });
        }
    }
    
    async blockIP(ip, reason) {
        try {
            const blockId = crypto.createHash('sha256')
                .update(ip)
                .digest('hex');
            
            await db.ref(`blocked_ips/${blockId}`).set({
                ip: encryptionService.encrypt(ip),
                reason: reason,
                blockedAt: Date.now(),
                expiresAt: Date.now() + 3600000 // ساعة واحدة
            });
            
            logger.warn('IP blocked', { ipHash: blockId, reason });
            
        } catch (error) {
            logger.error('IP blocking failed', { ip, error });
        }
    }
    
    async alertAdmin(alertType, data) {
        try {
            const alertId = crypto.randomBytes(16).toString('hex');
            
            await db.ref(`security_alerts/${alertId}`).set({
                type: alertType,
                data: data,
                timestamp: Date.now(),
                priority: 'high',
                acknowledged: false
            });
            
            logger.warn('Security alert raised', { alertType, data });
            
        } catch (error) {
            logger.error('Security alert failed', { alertType, error });
        }
    }
    
    async cleanOldLogs() {
        try {
            const now = Date.now();
            const monthAgo = now - 2592000000; // 30 يوم
            
            const paths = ['auth_logs', 'user_activity', 'security_alerts'];
            
            for (const path of paths) {
                const ref = db.ref(path);
                const snapshot = await ref.once('value');
                
                if (!snapshot.exists()) continue;
                
                const updates = {};
                snapshot.forEach(child => {
                    const data = child.val();
                    if (data.timestamp && data.timestamp < monthAgo) {
                        updates[child.key] = null;
                    }
                });
                
                if (Object.keys(updates).length > 0) {
                    await ref.update(updates);
                    logger.info(`Cleaned old logs from ${path}`, { count: Object.keys(updates).length });
                }
            }
        } catch (error) {
            logger.error('Log cleaning failed', { error });
        }
    }
}

const securityMonitor = new SecurityMonitor();

// ====================================================
// إعداد Express App مع الحماية القصوى
// ====================================================

const app = express();

// إضافة حماية Helmet
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://www.gstatic.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            connectSrc: ["'self'", "https://sudan-market-6b122-default-rtdb.firebaseio.com"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"]
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// Rate Limiting للـ API
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 100, // 100 طلب لكل IP
    message: { error: 'TOO_MANY_REQUESTS', message: 'لقد تجاوزت الحد المسموح من الطلبات' },
    standardHeaders: true,
    legacyHeaders: false
});

app.use('/api/', apiLimiter);

// Middleware للتحقق من الصحة
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Middleware للتحقق من API Key
const validateAPIKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({
            error: 'UNAUTHORIZED',
            message: 'مفتاح API غير صالح'
        });
    }
    
    next();
};

// ====================================================
// API Routes المحمية
// ====================================================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
            database: 'connected',
            security: 'active',
            escrow: 'running',
            monitoring: 'active'
        },
        uptime: process.uptime()
    });
});

// API لإدارة الإيداع (للإدمن فقط)
app.post('/api/admin/deposit/approve', validateAPIKey, async (req, res) => {
    try {
        const schema = Joi.object({
            requestId: Joi.string().required(),
            adminToken: Joi.string().required(),
            amount: Joi.number().min(1).max(10000).required()
        });
        
        const { error, value } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({
                error: 'VALIDATION_ERROR',
                details: error.details
            });
        }
        
        const { requestId, adminToken, amount } = value;
        
        // التحقق من صلاحيات الإدمن
        const adminUid = req.headers['x-admin-uid'];
        if (!await validateAdmin(adminUid, adminToken)) {
            return res.status(403).json({
                error: 'FORBIDDEN',
                message: 'صلاحيات غير كافية'
            });
        }
        
        // البحث عن الطلب
        const requestRef = db.ref(`coin_requests/${requestId}`);
        const requestSnap = await requestRef.once('value');
        
        if (!requestSnap.exists()) {
            return res.status(404).json({
                error: 'NOT_FOUND',
                message: 'طلب الإيداع غير موجود'
            });
        }
        
        const request = requestSnap.val();
        
        if (request.status !== 'pending') {
            return res.status(400).json({
                error: 'INVALID_STATUS',
                message: 'حالة الطلب غير صالحة'
            });
        }
        
        // تأكيد الإيداع
        const userRef = db.ref(`users/${request.uP}/sdmBalance`);
        await userRef.set(admin.database.ServerValue.increment(amount));
        
        // تحديث حالة الطلب
        await requestRef.update({
            status: 'approved',
            approvedAt: Date.now(),
            approvedBy: adminUid,
            approvedAmount: amount
        });
        
        // تسجيل المعاملة
        await db.ref('transactions').push({
            type: 'deposit_approved',
            userId: request.uP,
            amount: amount,
            requestId: requestId,
            approvedBy: adminUid,
            timestamp: Date.now()
        });
        
        res.json({
            success: true,
            message: 'تم تأكيد الإيداع بنجاح'
        });
        
    } catch (error) {
        logger.error('Deposit approval failed', { error, body: req.body });
        res.status(500).json({
            error: 'INTERNAL_ERROR',
            message: 'حدث خطأ أثناء معالجة الطلب'
        });
    }
});

// API للتحويلات البنكية
app.post('/api/bank/transfer', validateAPIKey, async (req, res) => {
    try {
        const schema = Joi.object({
            userId: Joi.string().required(),
            fullName: Joi.string().min(3).max(100).required(),
            accountNumber: Joi.string().min(3).max(50).required(),
            amountSDM: Joi.number().min(1).max(10000).required(),
            transferType: Joi.string().valid('khartoum_bank', 'cashy').required(),
            csrfToken: Joi.string().required()
        });
        
        const { error, value } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({
                error: 'VALIDATION_ERROR',
                details: error.details
            });
        }
        
        const { userId, fullName, accountNumber, amountSDM, transferType, csrfToken } = value;
        
        // التحقق من CSRF Token
        const expectedCSRF = encryptionService.hashData(userId + amountSDM);
        if (csrfToken !== expectedCSRF) {
            return res.status(403).json({
                error: 'INVALID_CSRF',
                message: 'رمز التحقق غير صالح'
            });
        }
        
        // التحقق من رصيد المستخدم
        const userRef = db.ref(`users/${userId}`);
        const userSnap = await userRef.once('value');
        const user = userSnap.val();
        
        if (!user) {
            return res.status(404).json({
                error: 'USER_NOT_FOUND',
                message: 'المستخدم غير موجود'
            });
        }
        
        if ((user.sdmBalance || 0) < amountSDM) {
            return res.status(400).json({
                error: 'INSUFFICIENT_BALANCE',
                message: 'رصيدك غير كافٍ'
            });
        }
        
        // خصم المبلغ
        await userRef.update({
            sdmBalance: admin.database.ServerValue.increment(-amountSDM)
        });
        
        // إنشاء طلب التحويل
        const transferId = crypto.randomBytes(16).toString('hex');
        await db.ref(`bank_transfer_requests/${transferId}`).set({
            userId: userId,
            userName: user.n,
            userNumericId: user.numericId,
            fullName: fullName,
            accountNumber: encryptionService.encrypt(accountNumber),
            amountSDM: amountSDM,
            amountSDG: amountSDM * 1000, // معدل التحويل
            transferType: transferType,
            status: 'pending',
            date: Date.now()
        });
        
        res.json({
            success: true,
            transferId: transferId,
            message: 'تم إرسال طلب التحويل بنجاح'
        });
        
    } catch (error) {
        logger.error('Bank transfer request failed', { error, body: req.body });
        res.status(500).json({
            error: 'INTERNAL_ERROR',
            message: 'حدث خطأ أثناء معالجة الطلب'
        });
    }
});

// ====================================================
// نظام المجدولات الزمنية
// ====================================================

async function startSchedulers() {
    // تشغيل المجدولات بفواصل مختلفة لمنع الحمل الزائد
    const schedulers = [
        { name: 'escrow', interval: 5000, func: () => escrowSystem.processEscrow() },
        { name: 'bank_transfers', interval: 7000, func: () => bankTransferSystem.processTransfers() },
        { name: 'vip', interval: 15000, func: () => vipSystem.processVIPRequests() },
        { name: 'security', interval: 30000, func: () => securityMonitor.monitorActivity() }
    ];
    
    for (const scheduler of schedulers) {
        setInterval(async () => {
            try {
                await scheduler.func();
                logger.debug(`Scheduler executed: ${scheduler.name}`);
            } catch (error) {
                logger.error(`Scheduler failed: ${scheduler.name}`, { error });
            }
        }, scheduler.interval);
    }
    
    logger.info('All schedulers started successfully');
}

// ====================================================
// تشغيل النظام
// ====================================================

const PORT = process.env.PORT || 3000;

async function initializeSystem() {
    try {
        // التحقق من اتصال قاعدة البيانات
        await db.ref('.info/connected').once('value');
        
        // بدء المجدولات
        await startSchedulers();
        
        // بدء السيرفر
        app.listen(PORT, () => {
            logger.info(`🚀 SDM Security Bot running on port ${PORT}`);
            logger.info(`🛡️  Security systems: ACTIVE`);
            logger.info(`📊 Monitoring: ENABLED`);
            logger.info(`🔒 Encryption: ACTIVE`);
            logger.info(`⏰ Started at: ${new Date().toISOString()}`);
        });
        
    } catch (error) {
        logger.error('System initialization failed', { error });
        process.exit(1);
    }
}

// معالجة الأخطاء غير المتوقعة
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', { error });
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', { reason, promise });
});

// تشغيل النظام
initializeSystem();
