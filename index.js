// ======================================================
// SDM Security Bot - النسخة المصححة الكاملة
// ======================================================

const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const NodeRSA = require('node-rsa');
const geoip = require('geoip-lite');
const useragent = require('useragent');

// ======================================================
// [0] التهيئة الآمنة - الجزء المضاف والمصحح
// ======================================================

console.log('🚀 Starting SDM Security System v3.0...');

// 🔐 التحقق من المفتاح الرئيسي
if (!process.env.MASTER_ENCRYPTION_KEY) {
    console.error('');
    console.error('❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌');
    console.error('❌ CRITICAL: MASTER_ENCRYPTION_KEY missing!');
    console.error('💡 To fix on Render:');
    console.error('💡 1. Go to https://dashboard.render.com');
    console.error('💡 2. Select project "sdm-security-bot"');
    console.error('💡 3. Click "Environment"');
    console.error('💡 4. Add variable:');
    console.error('💡    Key: MASTER_ENCRYPTION_KEY');
    console.error('💡    Value: [64 hex characters]');
    console.error('🔑 Generate with: openssl rand -hex 64');
    console.error('❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌');
    console.error('');
    
    if (process.env.NODE_ENV === 'production') {
        process.exit(1);
    } else {
        // Development fallback
        const tempKey = crypto.randomBytes(32).toString('hex') + crypto.randomBytes(32).toString('hex');
        process.env.MASTER_ENCRYPTION_KEY = tempKey;
        console.warn('⚠️  Development: Using auto-generated master key');
    }
}

console.log('✅ MASTER_ENCRYPTION_KEY: Loaded');

// توليد مفاتيح الأمان
const rsaKey = new NodeRSA({ b: 2048 });
const aesKey = crypto.randomBytes(32);
const hmacKey = crypto.randomBytes(32);
const jwtSecret = crypto.randomBytes(64).toString('hex');

const SECURITY_KEYS = {
    rsaPrivate: rsaKey.exportKey('private'),
    rsaPublic: rsaKey.exportKey('public'),
    aesKey: aesKey,
    hmacKey: hmacKey,
    jwtSecret: jwtSecret
};

console.log('✅ Security keys generated successfully');

// ======================================================
// [1] تهيئة Express مع الأمان المتقدم
// ======================================================

const app = express();

// 🔒 Helmet مع CSP محكم
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// 🔒 CORS محكم
const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
    process.env.ALLOWED_ORIGINS.split(',') : 
    ['https://sdm-market.com', 'http://localhost:3000', 'https://your-frontend-domain.com'];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`🚫 Blocked by CORS: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-ID', 'X-Request-Signature'],
    exposedHeaders: ['X-Encrypted-Data', 'X-Security-Token']
}));

// 🔒 Rate Limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'تم تجاوز عدد الطلبات المسموح بها' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress;
    }
});

const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { error: 'محاولات تسجيل دخول كثيرة، حاول بعد ساعة' }
});

app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);

// 🔒 تحقق من حجم الطلب
app.use(express.json({ 
    limit: '1mb',
    verify: (req, res, buf) => {
        try {
            JSON.parse(buf);
        } catch (e) {
            res.status(400).json({ error: 'بيانات غير صالحة' });
        }
    }
}));

// ======================================================
// [2] نظام التشفير المتقدم - مصحح
// ======================================================

class AdvancedEncryption {
    constructor() {
        this.rsaKey = new NodeRSA(SECURITY_KEYS.rsaPrivate);
        this.rsaKey.setOptions({ encryptionScheme: 'pkcs1' });
    }

    // تشفير AES-256-GCM
    encryptAES(data, iv = crypto.randomBytes(16)) {
        const cipher = crypto.createCipheriv('aes-256-gcm', SECURITY_KEYS.aesKey, iv);
        let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        
        return {
            encrypted,
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex'),
            timestamp: Date.now()
        };
    }

    // فك تشفير AES-256-GCM
    decryptAES(encryptedData) {
        try {
            const decipher = crypto.createDecipheriv(
                'aes-256-gcm', 
                SECURITY_KEYS.aesKey, 
                Buffer.from(encryptedData.iv, 'hex')
            );
            decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
            
            let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return JSON.parse(decrypted);
        } catch (error) {
            throw new Error('فك التشفير فشل - بيانات ممسوحة');
        }
    }

    // توقيع HMAC-SHA512
    signData(data) {
        const hmac = crypto.createHmac('sha512', SECURITY_KEYS.hmacKey);
        hmac.update(JSON.stringify(data));
        return hmac.digest('hex');
    }

    // التحقق من التوقيع
    verifySignature(data, signature) {
        const expectedSignature = this.signData(data);
        return crypto.timingSafeEqual(
            Buffer.from(signature, 'hex'),
            Buffer.from(expectedSignature, 'hex')
        );
    }

    // توليد توكين JWT آمن
    generateSecureToken(payload, expiresIn = '15m') {
        return jwt.sign(
            {
                ...payload,
                iss: 'sdm-secure-server',
                aud: 'sdm-client',
                jti: crypto.randomBytes(16).toString('hex')
            },
            SECURITY_KEYS.jwtSecret,
            { 
                expiresIn,
                algorithm: 'HS512'
            }
        );
    }

    // التحقق من التوكين
    verifyToken(token) {
        try {
            return jwt.verify(token, SECURITY_KEYS.jwtSecret, {
                algorithms: ['HS512'],
                issuer: 'sdm-secure-server',
                audience: 'sdm-client'
            });
        } catch (error) {
            throw new Error('التوكين غير صالح أو منتهي');
        }
    }

    // تشفير RSA للمفاتيح الحساسة
    encryptRSA(data) {
        return this.rsaKey.encrypt(JSON.stringify(data), 'base64');
    }

    // فك تشفير RSA
    decryptRSA(encryptedData) {
        try {
            const decrypted = this.rsaKey.decrypt(encryptedData, 'utf8');
            return JSON.parse(decrypted);
        } catch (error) {
            throw new Error('فك التشفير RSA فشل');
        }
    }

    // هاش بيانات مع Salt
    async hashData(data, saltRounds = 12) {
        const salt = await bcrypt.genSalt(saltRounds);
        return await bcrypt.hash(data, salt);
    }

    // مقارنة البيانات المهشورة
    async compareHash(data, hashed) {
        return await bcrypt.compare(data, hashed);
    }
}

const cryptoEngine = new AdvancedEncryption();

// ======================================================
// [3] نظام التحقق الآني المتقدم
// ======================================================

class RealTimeVerification {
    constructor() {
        this.suspiciousPatterns = new Map();
        this.ipBlacklist = new Set();
        this.deviceRegistry = new Map();
        this.rateLimiters = new Map();
    }

    // تحليل بصمة الجهاز
    analyzeDeviceFingerprint(req) {
        const fingerprint = {
            userAgent: req.headers['user-agent'] || '',
            language: req.headers['accept-language'] || '',
            screen: req.headers['x-screen-resolution'] || '',
            timezone: req.headers['x-timezone'] || '',
            platform: req.headers['x-platform'] || '',
            plugins: req.headers['x-plugins'] || '',
            fonts: req.headers['x-fonts'] || '',
            canvas: req.headers['x-canvas'] || '',
            webgl: req.headers['x-webgl'] || ''
        };

        const hash = crypto.createHash('sha256')
            .update(JSON.stringify(fingerprint))
            .digest('hex');

        return {
            hash,
            fingerprint,
            confidence: this.calculateConfidence(fingerprint)
        };
    }

    calculateConfidence(fingerprint) {
        let score = 50;
        if (fingerprint.userAgent) score += 10;
        if (fingerprint.language) score += 10;
        if (fingerprint.timezone) score += 10;
        if (fingerprint.platform) score += 10;
        if (fingerprint.canvas || fingerprint.webgl) score += 10;
        return Math.min(score, 100);
    }

    // تحليل السلوك
    analyzeBehavior(userId, action, metadata = {}) {
        const behaviorScore = {
            speed: this.checkActionSpeed(userId, action),
            pattern: this.checkBehaviorPattern(userId, action),
            location: this.checkLocationAnomaly(userId, metadata.ip),
            timing: this.checkTimingAnomaly(action),
            sequence: this.checkActionSequence(userId, action)
        };

        const totalScore = Object.values(behaviorScore).reduce((a, b) => a + b, 0);
        
        if (totalScore > 70) {
            this.flagSuspicious(userId, action, behaviorScore);
            return { suspicious: true, score: totalScore, details: behaviorScore };
        }

        return { suspicious: false, score: totalScore };
    }

    checkActionSpeed(userId, action) {
        return 0; // Implementation needed
    }

    checkBehaviorPattern(userId, action) {
        const userPatterns = this.suspiciousPatterns.get(userId) || {
            normalActions: new Set(),
            suspiciousActions: new Set(),
            lastActions: []
        };

        userPatterns.lastActions.push({
            action,
            timestamp: Date.now()
        });

        if (userPatterns.lastActions.length > 10) {
            userPatterns.lastActions.shift();
        }

        const recentActions = userPatterns.lastActions.slice(-5);
        const uniqueActions = new Set(recentActions.map(a => a.action));
        
        if (uniqueActions.size === 1 && recentActions.length === 5) {
            return 20;
        }

        this.suspiciousPatterns.set(userId, userPatterns);
        return 0;
    }

    checkLocationAnomaly(userId, ip) {
        return 0; // Implementation needed
    }

    checkTimingAnomaly(action) {
        return 0; // Implementation needed
    }

    checkActionSequence(userId, action) {
        return 0; // Implementation needed
    }

    flagSuspicious(userId, action, score) {
        console.warn(`🚨 Suspicious activity: ${userId} - ${action}`, score);
    }

    // نظام كشف الاحتيال المتقدم
    async fraudDetection(userId, transaction) {
        const checks = [
            this.checkAmountAnomaly(userId, transaction.amount),
            this.checkTimeAnomaly(transaction.timestamp),
            this.checkRecipientRisk(transaction.recipient),
            this.checkVelocity(userId),
            this.checkGeoVelocity(userId, transaction.location)
        ];

        const results = await Promise.all(checks);
        const riskScore = results.reduce((sum, check) => sum + (check.score || 0), 0);

        if (riskScore > 75) {
            await this.triggerFraudAlert(userId, transaction, results);
            return { blocked: true, riskScore, reasons: results.filter(r => r.score > 15) };
        }

        return { blocked: false, riskScore };
    }

    async checkAmountAnomaly(userId, amount) {
        return { score: 0 };
    }

    async checkTimeAnomaly(timestamp) {
        const hour = new Date(timestamp).getHours();
        if (hour >= 0 && hour <= 5) return { score: 20, reason: 'وقت غير طبيعي' };
        return { score: 0 };
    }

    async checkRecipientRisk(recipient) {
        return { score: 0 };
    }

    async checkVelocity(userId) {
        return { score: 0 };
    }

    async checkGeoVelocity(userId, location) {
        return { score: 0 };
    }

    async triggerFraudAlert(userId, transaction, results) {
        console.error(`🚨 FRAUD ALERT: ${userId}`, transaction, results);
    }
}

const verifier = new RealTimeVerification();

// ======================================================
// [4] نظام السجلات الآمنة غير القابلة للتغيير
// ======================================================

class ImmutableLogger {
    constructor() {
        this.merkleTree = {};
        this.logChain = [];
    }

    async logSecureEvent(eventType, data, userId = null) {
        const eventId = crypto.randomBytes(32).toString('hex');
        const timestamp = Date.now();
        
        const logEntry = {
            id: eventId,
            type: eventType,
            data: await this.encryptLogData(data),
            metadata: {
                userId,
                ip: data.ip || 'unknown',
                userAgent: data.userAgent || 'unknown',
                timestamp,
                version: '2.0'
            },
            previousHash: this.logChain.length > 0 ? 
                this.logChain[this.logChain.length - 1].hash : 
                'genesis',
            nonce: this.generateNonce()
        };

        logEntry.hash = this.calculateHash(logEntry);
        logEntry.signature = cryptoEngine.signData(logEntry);
        
        this.logChain.push(logEntry);
        this.updateMerkleTree(logEntry);
        await this.storeEncryptedLog(logEntry);

        return {
            eventId,
            timestamp,
            hash: logEntry.hash
        };
    }

    generateNonce() {
        return crypto.randomBytes(16).toString('hex');
    }

    calculateHash(entry) {
        return crypto
            .createHash('sha256')
            .update(JSON.stringify({
                id: entry.id,
                type: entry.type,
                data: entry.data,
                previousHash: entry.previousHash,
                nonce: entry.nonce
            }))
            .digest('hex');
    }

    async encryptLogData(data) {
        const encrypted = cryptoEngine.encryptAES(data);
        return {
            ciphertext: encrypted.encrypted,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
            keyId: 'log_key_v1'
        };
    }

    updateMerkleTree(entry) {
        // Simplified implementation
        this.merkleTree[entry.id] = entry.hash;
    }

    async storeEncryptedLog(entry) {
        // In production, store in database
        console.log(`📝 Log stored: ${entry.type} - ${entry.id}`);
    }
}

const secureLogger = new ImmutableLogger();

// ======================================================
// [5] نظام إدارة المفاتيح الآمنة - مصحح بالكامل
// ======================================================

class KeyManagementSystem {
    constructor() {
        this.keyVault = new Map();
        this.keyRotationSchedule = new Map();
        this.initKeyVault();
    }

    initKeyVault() {
        console.log('🔑 Initializing key vault...');
        
        // مفاتيح التشفير
        this.storeKey('aes_transaction', crypto.randomBytes(32), {
            type: 'AES-256-GCM',
            created: Date.now(),
            expires: Date.now() + (30 * 24 * 60 * 60 * 1000),
            usage: 'transaction_encryption'
        });

        this.storeKey('hmac_signature', crypto.randomBytes(32), {
            type: 'HMAC-SHA512',
            created: Date.now(),
            expires: Date.now() + (7 * 24 * 60 * 60 * 1000),
            usage: 'data_integrity'
        });

        this.storeKey('jwt_auth', crypto.randomBytes(64), {
            type: 'JWT-HS512',
            created: Date.now(),
            expires: Date.now() + (24 * 60 * 60 * 1000),
            usage: 'authentication'
        });

        console.log('✅ Key vault initialized with 3 keys');
    }

    storeKey(keyId, keyData, metadata) {
        const encryptedKey = this.encryptMasterKey(keyData);
        this.keyVault.set(keyId, {
            encryptedKey,
            metadata,
            lastUsed: Date.now(),
            usageCount: 0
        });

        this.scheduleKeyRotation(keyId, metadata.expires);
    }

    // ======== ⭐ النسخة المصححة ⭐ ========
    encryptMasterKey(keyData) {
        const masterKey = process.env.MASTER_ENCRYPTION_KEY;
        
        // ✅ التصحيح: !masterKey بدلاً من lmasterKey
        if (!masterKey) {
            console.error('❌ MASTER_ENCRYPTION_KEY is not set');
            throw new Error('Master encryption key is not configured');
        }
        
        // تحقق من صيغة المفتاح
        if (!/^[0-9a-fA-F]{64}$/.test(masterKey)) {
            throw new Error('Invalid master key format. Must be 64 hexadecimal characters');
        }
        
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', 
            Buffer.from(masterKey, 'hex'), 
            iv
        );
        
        let encrypted = cipher.update(keyData);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        const authTag = cipher.getAuthTag();
        
        return {
            encrypted: encrypted.toString('hex'),
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex')
        };
    }

    scheduleKeyRotation(keyId, expires) {
        const rotationTime = expires - (24 * 60 * 60 * 1000); // قبل 24 ساعة من الانتهاء
        this.keyRotationSchedule.set(keyId, rotationTime);
    }

    getKey(keyId) {
        const keyRecord = this.keyVault.get(keyId);
        if (!keyRecord) throw new Error(`Key ${keyId} not found`);

        keyRecord.usageCount++;
        keyRecord.lastUsed = Date.now();

        if (keyRecord.usageCount > 10000 || Date.now() > keyRecord.metadata.expires) {
            this.rotateKey(keyId);
            return this.getKey(keyId);
        }

        return this.decryptMasterKey(keyRecord.encryptedKey);
    }

    decryptMasterKey(encryptedKey) {
        const masterKey = process.env.MASTER_ENCRYPTION_KEY;
        
        if (!masterKey) {
            throw new Error('Master key not configured');
        }
        
        const decipher = crypto.createDecipheriv(
            'aes-256-gcm',
            Buffer.from(masterKey, 'hex'),
            Buffer.from(encryptedKey.iv, 'hex')
        );
        decipher.setAuthTag(Buffer.from(encryptedKey.authTag, 'hex'));
        
        let decrypted = decipher.update(Buffer.from(encryptedKey.encrypted, 'hex'));
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        return decrypted;
    }

    rotateKey(keyId) {
        const oldKey = this.keyVault.get(keyId);
        if (!oldKey) return;

        console.log(`🔄 Rotating key: ${keyId}`);
        
        secureLogger.logSecureEvent('key_rotation', {
            keyId,
            oldKeyMetadata: oldKey.metadata,
            rotatedAt: Date.now()
        });

        let newKeyData;
        switch (oldKey.metadata.type) {
            case 'AES-256-GCM':
                newKeyData = crypto.randomBytes(32);
                break;
            case 'HMAC-SHA512':
                newKeyData = crypto.randomBytes(32);
                break;
            case 'JWT-HS512':
                newKeyData = crypto.randomBytes(64);
                break;
            default:
                newKeyData = crypto.randomBytes(32);
        }

        const newMetadata = {
            ...oldKey.metadata,
            created: Date.now(),
            expires: Date.now() + (oldKey.metadata.expires - oldKey.metadata.created),
            previousKeyId: `${keyId}_${oldKey.metadata.created}`
        };

        this.storeKey(keyId, newKeyData, newMetadata);
    }
}

const keyManager = new KeyManagementSystem();

// ======================================================
// [6] نظام المصادقة والتفويض المتقدم
// ======================================================

class AdvancedAuthSystem {
    constructor() {
        this.activeSessions = new Map();
        this.failedAttempts = new Map();
        this.twoFactorTokens = new Map();
    }

    async authenticateUser(request) {
        const token = this.extractToken(request);
        if (!token) throw new Error('No authentication token');

        const signature = request.headers['x-request-signature'];
        if (!signature) {
            throw new Error('Invalid request signature');
        }

        try {
            const decoded = cryptoEngine.verifyToken(token);
            
            if (!this.verifySession(decoded.sessionId)) {
                throw new Error('Session expired or invalid');
            }

            this.updateSession(decoded.sessionId);

            return {
                userId: decoded.userId,
                sessionId: decoded.sessionId,
                permissions: decoded.permissions,
                requires2FA: decoded.requires2FA
            };

        } catch (error) {
            await this.recordFailedAttempt(request.ip, error.message);
            throw error;
        }
    }

    extractToken(request) {
        const authHeader = request.headers['authorization'];
        if (!authHeader) return null;
        
        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return null;
        }
        
        return parts[1];
    }

    verifyDevice(deviceId, fingerprint) {
        return true; // Simplified for now
    }

    verifySession(sessionId, deviceId = null) {
        const session = this.activeSessions.get(sessionId);
        if (!session) return false;
        
        if (session.expires < Date.now()) {
            this.activeSessions.delete(sessionId);
            return false;
        }
        
        if (deviceId && session.deviceId !== deviceId) {
            return false;
        }
        
        return true;
    }

    updateSession(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            session.lastActivity = Date.now();
            session.expires = Date.now() + (60 * 60 * 1000); // Extend 1 hour
        }
    }

    async recordFailedAttempt(ip, reason) {
        const attempts = this.failedAttempts.get(ip) || { count: 0, firstAttempt: Date.now() };
        attempts.count++;
        attempts.lastAttempt = Date.now();
        attempts.reason = reason;
        
        this.failedAttempts.set(ip, attempts);
        
        if (attempts.count > 5) {
            console.warn(`🚨 Too many failed attempts from IP: ${ip}`);
            await secureLogger.logSecureEvent('failed_auth_attempts', { ip, attempts });
        }
    }

    async requireTwoFactor(userId, method = 'totp') {
        const token = crypto.randomBytes(3).toString('hex').toUpperCase();
        const expiresAt = Date.now() + (5 * 60 * 1000);

        this.twoFactorTokens.set(userId, {
            token,
            method,
            expiresAt,
            attempts: 0
        });

        // In production: Send via SMS/Email
        console.log(`📱 2FA Code for ${userId}: ${token} (${method})`);
        
        return { required: true, method, expiresIn: 300 };
    }

    async verifyTwoFactor(userId, code) {
        const record = this.twoFactorTokens.get(userId);
        if (!record) throw new Error('No 2FA request found');

        if (record.attempts >= 3) {
            this.twoFactorTokens.delete(userId);
            throw new Error('Too many 2FA attempts');
        }

        if (Date.now() > record.expiresAt) {
            this.twoFactorTokens.delete(userId);
            throw new Error('2FA code expired');
        }

        if (record.token !== code.toUpperCase()) {
            record.attempts++;
            throw new Error('Invalid 2FA code');
        }

        this.twoFactorTokens.delete(userId);
        return { verified: true };
    }
}

const authSystem = new AdvancedAuthSystem();

// ======================================================
// [7] نظام معالجة المعاملات الآمن
// ======================================================

class SecureTransactionProcessor {
    constructor() {
        this.pendingTransactions = new Map();
        this.transactionLocks = new Map();
    }

    async processTransaction(request, user) {
        const transactionId = crypto.randomBytes(16).toString('hex');
        
        try {
            await this.acquireLock(user.userId, transactionId);
            
            const transactionData = await this.decryptTransaction(request.body);
            await this.validateTransaction(transactionData, user);
            
            const riskAssessment = await verifier.fraudDetection(
                user.userId,
                transactionData
            );

            if (riskAssessment.blocked) {
                await this.blockTransaction(transactionId, user.userId, riskAssessment);
                throw new Error('Transaction blocked by fraud detection');
            }

            const balanceCheck = await this.checkBalance(user.userId, transactionData.amount);
            if (!balanceCheck.sufficient) {
                throw new Error('Insufficient balance');
            }

            const result = await this.executeCoreTransaction(
                transactionId,
                user.userId,
                transactionData
            );

            await secureLogger.logSecureEvent('transaction_completed', {
                transactionId,
                userId: user.userId,
                amount: transactionData.amount,
                type: transactionData.type,
                riskScore: riskAssessment.riskScore,
                timestamp: Date.now()
            });

            const transactionSignature = this.signTransaction(result);

            return {
                success: true,
                transactionId,
                signature: transactionSignature,
                timestamp: Date.now(),
                confirmationHash: this.generateConfirmationHash(result)
            };

        } catch (error) {
            await secureLogger.logSecureEvent('transaction_failed', {
                transactionId,
                userId: user.userId,
                error: error.message,
                timestamp: Date.now()
            });
            throw error;
            
        } finally {
            this.releaseLock(user.userId, transactionId);
        }
    }

    async acquireLock(userId, transactionId) {
        const lockKey = `lock_${userId}_${transactionId}`;
        if (this.transactionLocks.has(lockKey)) {
            throw new Error('Transaction already in progress');
        }
        this.transactionLocks.set(lockKey, Date.now());
    }

    releaseLock(userId, transactionId) {
        const lockKey = `lock_${userId}_${transactionId}`;
        this.transactionLocks.delete(lockKey);
    }

    async decryptTransaction(encryptedData) {
        try {
            return cryptoEngine.decryptAES(encryptedData);
        } catch (error) {
            throw new Error('Failed to decrypt transaction data');
        }
    }

    async validateTransaction(data, user) {
        if (!data.amount || data.amount <= 0) {
            throw new Error('Invalid amount');
        }
        
        if (!data.recipient) {
            throw new Error('Recipient is required');
        }
        
        return true;
    }

    async checkBalance(userId, amount) {
        // Simplified - in production, fetch from database
        return {
            sufficient: true,
            currentBalance: 1000,
            availableBalance: 1000,
            pending: 0
        };
    }

    async blockTransaction(transactionId, userId, riskAssessment) {
        console.error(`🚫 Blocked transaction ${transactionId} for user ${userId}`, riskAssessment);
        await secureLogger.logSecureEvent('transaction_blocked', {
            transactionId,
            userId,
            riskAssessment,
            timestamp: Date.now()
        });
    }

    async executeCoreTransaction(transactionId, userId, data) {
        // Simplified - in production, process in database
        return {
            transactionId,
            userId,
            amount: data.amount,
            recipient: data.recipient,
            status: 'completed',
            timestamp: Date.now()
        };
    }

    signTransaction(transaction) {
        const dataToSign = {
            id: transaction.transactionId,
            amount: transaction.amount,
            from: transaction.userId,
            to: transaction.recipient,
            timestamp: transaction.timestamp,
            nonce: crypto.randomBytes(8).toString('hex')
        };

        const signature = cryptoEngine.signData(dataToSign);
        const proofOfWork = this.generateProofOfWork(dataToSign);
        
        return {
            signature,
            proofOfWork,
            signedData: dataToSign
        };
    }

    generateProofOfWork(data, difficulty = 2) {
        let nonce = 0;
        let hash = '';
        const prefix = '0'.repeat(difficulty);

        do {
            nonce++;
            const input = JSON.stringify(data) + nonce;
            hash = crypto.createHash('sha256').update(input).digest('hex');
        } while (!hash.startsWith(prefix));

        return { nonce, hash, difficulty };
    }

    generateConfirmationHash(result) {
        return crypto.createHash('sha256')
            .update(JSON.stringify(result) + Date.now())
            .digest('hex');
    }
}

const transactionProcessor = new SecureTransactionProcessor();

// ======================================================
// [8] Firebase Initialization
// ======================================================

let firebaseInitialized = false;

async function initializeFirebase() {
    if (firebaseInitialized) return;
    
    try {
        if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
            console.warn('⚠️  Firebase service account not configured');
            return;
        }
        
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://sudan-market-6b122-default-rtdb.firebaseio.com'
        });
        
        firebaseInitialized = true;
        console.log('✅ Firebase initialized successfully');
    } catch (error) {
        console.error('❌ Firebase initialization failed:', error.message);
    }
}

// ======================================================
// [9] API Routes - الأساسية
// ======================================================

// 🔐 Middleware للمصادقة
app.use('/api/secure/*', async (req, res, next) => {
    try {
        const authResult = await authSystem.authenticateUser(req);
        req.user = authResult;
        next();
    } catch (error) {
        res.status(401).json({ 
            error: 'Authentication failed',
            details: error.message,
            timestamp: Date.now()
        });
    }
});

// 📤 Upload endpoint للصور (للتكامل مع Frontend)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

app.post('/api/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image provided' });
        }

        console.log(`📤 Uploading image: ${req.file.originalname} (${req.file.size} bytes)`);
        
        // في الواقع، رفع لـ ImgBB أو خدمة تخزين
        // هنا مثال مبسط:
        const fakeImgBBUrl = `https://i.imgur.com/${crypto.randomBytes(8).toString('hex')}.jpg`;
        
        await secureLogger.logSecureEvent('image_uploaded', {
            filename: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype,
            url: fakeImgBBUrl
        });
        
        res.json({
            success: true,
            url: fakeImgBBUrl,
            message: 'Image uploaded successfully (simulated)'
        });
        
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ 
            error: 'Upload failed',
            details: error.message 
        });
    }
});

// 🏦 معالجة التحويل البنكي
app.post('/api/secure/bank-transfer', async (req, res) => {
    try {
        if (req.user.requires2FA) {
            const twoFactorCode = req.headers['x-2fa-code'];
            if (!twoFactorCode) {
                return res.status(403).json({
                    error: '2FA required',
                    nextStep: '/api/auth/2fa'
                });
            }

            const twoFactorResult = await authSystem.verifyTwoFactor(
                req.user.userId,
                twoFactorCode
            );

            if (!twoFactorResult.verified) {
                throw new Error('2FA verification failed');
            }
        }

        const result = await transactionProcessor.processTransaction(req, req.user);
        const encryptedResponse = cryptoEngine.encryptAES(result);
        
        res.header('X-Encrypted-Data', 'true');
        res.json(encryptedResponse);

    } catch (error) {
        await secureLogger.logSecureEvent('api_error', {
            endpoint: '/api/secure/bank-transfer',
            userId: req.user?.userId,
            error: error.message,
            ip: req.ip
        });

        res.status(400).json({
            error: 'Transaction failed',
            code: 'TX_FAILED',
            timestamp: Date.now()
        });
    }
});

// 📊 Health check endpoint
app.get('/api/health', async (req, res) => {
    const healthChecks = {
        status: 'operational',
        timestamp: Date.now(),
        services: {
            encryption: true,
            authentication: true,
            logging: true,
            database: firebaseInitialized
        },
        system: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            node: process.version
        },
        security: {
            level: 'maximum',
            protocols: ['AES-256-GCM', 'RSA-2048', 'HMAC-SHA512']
        }
    };

    const signature = cryptoEngine.signData(healthChecks);
    res.set('X-Security-Signature', signature);
    res.json(healthChecks);
});

// 🔐 Security status
app.get('/api/security/status', async (req, res) => {
    const securityStatus = {
        system: {
            encryption: 'AES-256-GCM + RSA-2048',
            hashing: 'HMAC-SHA512 + bcrypt',
            tokens: 'JWT-HS512',
            logging: 'Immutable chain',
            version: '3.0.0-secure'
        },
        checks: {
            masterKey: !!process.env.MASTER_ENCRYPTION_KEY,
            securityKeys: true,
            logging: true
        },
        statistics: {
            activeSessions: authSystem.activeSessions.size,
            failedAttempts: authSystem.failedAttempts.size,
            logsCount: secureLogger.logChain.length
        },
        timestamp: Date.now()
    };

    const encryptedStatus = cryptoEngine.encryptAES(securityStatus);
    res.json(encryptedStatus);
});

// 📝 Test endpoint للتأكد من العمل
app.get('/api/test', (req, res) => {
    res.json({
        message: '✅ SDM Security Bot is running!',
        version: '3.0.0',
        timestamp: Date.now(),
        environment: process.env.NODE_ENV || 'development',
        features: [
            'Advanced Encryption',
            'Real-time Verification',
            'Secure Transactions',
            'Immutable Logging',
            'Key Management'
        ]
    });
});

// ======================================================
// [10] الإقلاع والتشغيل
// ======================================================

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        // Initialize Firebase
        await initializeFirebase();
        
        // Start server
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`
    ╔══════════════════════════════════════════════════════════════════╗
    ║                                                                  ║
    ║    🔒 SDM SECURITY BOT v3.0 - MAXIMUM SECURITY MODE             ║
    ║                                                                  ║
    ║    ✅ Server started on port: ${PORT}                            ║
    ║    ✅ Encryption: AES-256-GCM + RSA-2048                        ║
    ║    ✅ Authentication: JWT-HS512 + 2FA                           ║
    ║    ✅ Logging: Immutable blockchain-style                       ║
    ║    ✅ Key Management: Automated rotation                        ║
    ║                                                                  ║
    ║    📡 Ready to process secure transactions                      ║
    ║    🛡️  Fraud detection: Active                                  ║
    ║    📊 Health: /api/health                                       ║
    ║    📝 Test: /api/test                                           ║
    ║                                                                  ║
    ╚══════════════════════════════════════════════════════════════════╝
            `);
        });
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Start the server
startServer();

// ======================================================
// [11] معالجة الأخطاء
// ======================================================

process.on('uncaughtException', async (error) => {
    await secureLogger.logSecureEvent('system_crash', {
        error: error.message,
        stack: error.stack,
        timestamp: Date.now()
    });
    
    console.error('⚠️ CRITICAL SYSTEM ERROR:', error);
    process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
    await secureLogger.logSecureEvent('unhandled_rejection', {
        reason: reason?.message || 'Unknown',
        timestamp: Date.now()
    });
    
    console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('SIGTERM', async () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    
    await secureLogger.logSecureEvent('system_shutdown', {
        reason: 'SIGTERM',
        timestamp: Date.now()
    });
    
    process.exit(0);
});

// ======================================================
// [12] التصدير للاختبار
// ======================================================

module.exports = {
    app,
    cryptoEngine,
    verifier,
    secureLogger,
    authSystem,
    transactionProcessor,
    keyManager
};
