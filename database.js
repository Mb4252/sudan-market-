const mongoose = require('mongoose');
const crypto = require('crypto');
const { ethers } = require('ethers');
const { Connection, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { AptosAccount } = require('aptos');
const CryptoJS = require('crypto-js');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { User, Wallet, KycRequest, P2pOffer, Trade, DepositRequest, WithdrawRequest, Review, DailyStats, AuditLog, Report, Blacklist } = require('./models');

class Database {
    constructor() {
        this.connected = false;
        this.encryptionKey = process.env.ENCRYPTION_KEY || 'default_key_32_bytes_long';
        this.platformFee = (parseFloat(process.env.PLATFORM_FEE_PERCENT) / 100) || 0.005;
        this.referralCommissionRate = 10;
        
        // إعدادات 2FA للتحرير
        this.release2FAThreshold = 100; // أي مبلغ فوق 100 دولار يحتاج 2FA
        this.release2FAForAll = true;   // تفعيل 2FA لجميع عمليات التحرير
        
        this.commissionWallets = {
            bnb: process.env.COMMISSION_WALLET_BNB || '0x2a2548117C7113eB807298D74A44d451E330AC95',
            polygon: process.env.COMMISSION_WALLET_POLYGON || '0x2a2548117C7113eB807298D74A44d451E330AC95',
            solana: process.env.COMMISSION_WALLET_SOLANA || 'HFMJRRqC76YdBE4fXDnyicYDq6ujFhkFJctBfQonStL',
            aptos: process.env.COMMISSION_WALLET_APTOS || '0xf0713a00655788d44218e42b71343be9f18d96533d322c28ce9830dcf9022468'
        };
        
        this.supportedCurrencies = process.env.SUPPORTED_CURRENCIES 
            ? process.env.SUPPORTED_CURRENCIES.split(',') 
            : ['USD', 'EUR', 'GBP', 'SAR', 'AED', 'EGP', 'SDG', 'IQD', 'JOD', 'KWD', 'QAR', 'BHD', 'OMR', 'TRY', 'INR', 'PKR'];
        
        this.paymentMethods = process.env.PAYMENT_METHODS 
            ? process.env.PAYMENT_METHODS.split(',') 
            : ['bank_transfer', 'paypal', 'visa', 'mastercard', 'fawry', 'instapay', 'vodafone_cash', 'orange_cash'];
        
        this.sudanBanks = process.env.SUDAN_BANKS 
            ? process.env.SUDAN_BANKS.split(',') 
            : [
                'Bank of Khartoum', 'Blue Nile Mashreq Bank', 'Al Salam Bank', 'Agricultural Bank',
                'Al Baraka Bank', 'Al Nilein Bank', 'Al Shamal Islamic Bank', 'Animal Resources Bank',
                'Bank of Sudan', 'Byblos Bank', 'Egyptian Sudanese Bank', 'Industrial Development Bank',
                'National Bank of Abu Dhabi', 'National Bank of Egypt', 'National Bank of Sudan',
                'Omdurman National Bank', 'Qatar National Bank', 'Saudi Sudanese Bank',
                'Sudanese French Bank', 'United Capital Bank'
            ];
    }

    generateSignature(data) {
        return crypto.createHash('sha256').update(`${data}-${Date.now()}-${Math.random()}`).digest('hex');
    }

    encryptPrivateKey(privateKey) {
        return CryptoJS.AES.encrypt(privateKey, this.encryptionKey).toString();
    }

    decryptPrivateKey(encryptedKey) {
        const bytes = CryptoJS.AES.decrypt(encryptedKey, this.encryptionKey);
        return bytes.toString(CryptoJS.enc.Utf8);
    }

    async connect() {
        if (this.connected) return;
        try {
            await mongoose.connect(process.env.MONGODB_URI, {
                dbName: process.env.MONGODB_DB_NAME || 'p2p_exchange',
                serverSelectionTimeoutMS: 30000,
                socketTimeoutMS: 45000,
                connectTimeoutMS: 30000,
                family: 4
            });
            this.connected = true;
            console.log('✅ MongoDB connected');
        } catch (error) {
            console.error('❌ MongoDB error:', error);
            throw error;
        }
    }

    // ========== سجل التدقيق (Audit Log) ==========
    async addAuditLog(userId, action, details = {}, ip = '', userAgent = '') {
        try {
            await AuditLog.create({
                userId, action, details, ip, userAgent, timestamp: new Date()
            });
        } catch (e) { console.error('Audit log error:', e); }
    }

    // ========== آخر ظهور للمستخدم ==========
    async updateLastSeen(userId) {
        await User.updateOne({ userId }, { 
            lastSeen: new Date(),
            isOnline: true
        });
        
        // بعد 5 دقائق من عدم النشاط، يعتبر غير متصل
        setTimeout(async () => {
            const user = await User.findOne({ userId });
            if (user) {
                const timeSinceLastSeen = Date.now() - new Date(user.lastSeen).getTime();
                if (timeSinceLastSeen > 5 * 60 * 1000) {
                    await User.updateOne({ userId }, { isOnline: false });
                }
            }
        }, 5 * 60 * 1000);
    }

    async getUserOnlineStatus(userId) {
        const user = await User.findOne({ userId });
        if (!user) return { isOnline: false, lastSeen: null, statusText: 'غير معروف' };
        
        const timeSinceLastSeen = Date.now() - new Date(user.lastSeen).getTime();
        const isOnline = user.isOnline && timeSinceLastSeen < 5 * 60 * 1000;
        
        let statusText = '';
        if (isOnline) {
            statusText = '🟢 متصل الآن';
        } else if (timeSinceLastSeen < 60 * 60 * 1000) {
            const minutes = Math.floor(timeSinceLastSeen / 60000);
            statusText = `🟡 آخر ظهور منذ ${minutes} دقيقة`;
        } else if (timeSinceLastSeen < 24 * 60 * 60 * 1000) {
            const hours = Math.floor(timeSinceLastSeen / (60 * 60 * 1000));
            statusText = `🟠 آخر ظهور منذ ${hours} ساعة`;
        } else {
            const days = Math.floor(timeSinceLastSeen / (24 * 60 * 60 * 1000));
            statusText = `⚫ آخر ظهور منذ ${days} يوم`;
        }
        
        return { isOnline, lastSeen: user.lastSeen, statusText };
    }

    // ========== التحقق من حالة المستخدم (محظور/مقفل) ==========
    async isUserBannedOrLocked(userId) {
        const user = await User.findOne({ userId });
        if (!user) return { banned: false, locked: false };
        
        if (user.isBanned) {
            return { banned: true, reason: user.banReason || 'تم حظر حسابك نهائياً' };
        }
        if (user.isLocked) {
            return { locked: true, reason: 'حسابك مقفل مؤقتاً. تواصل مع الدعم.' };
        }
        if (user.banExpires && user.banExpires > new Date()) {
            return { banned: true, reason: `محظور حتى ${user.banExpires.toLocaleString()}` };
        }
        return { banned: false, locked: false };
    }

    // ========== تتبع السلوك المشبوه ==========
    async trackSuspiciousBehavior(userId, action, details, ip = '') {
        const user = await User.findOne({ userId });
        if (!user) return { warning: false };
        
        const suspiciousActions = user.suspiciousActions || [];
        suspiciousActions.push({ action, details, timestamp: new Date(), ip });
        
        while (suspiciousActions.length > 50) suspiciousActions.shift();
        
        const warningCount = (user.warningCount || 0) + 1;
        await User.updateOne({ userId }, { 
            $set: { suspiciousActions, warningCount }
        });
        
        await this.addAuditLog(userId, `suspicious_${action}`, details, ip);
        
        if (warningCount >= 5) {
            await User.updateOne({ userId }, { 
                isLocked: true, 
                lockReason: 'نشاط مشبوه متكرر - تم القفل التلقائي'
            });
            return { locked: true, message: '⛔ تم قفل حسابك بسبب نشاط مشبوه. تواصل مع الدعم.' };
        }
        
        return { warning: true, remaining: 5 - warningCount };
    }

    // ========== تتبع تأخير التاجر ==========
    async trackSellerDelay(sellerId, tradeId, delayMinutes) {
        await User.updateOne({ userId: sellerId }, {
            $inc: { 
                totalDelays: 1,
                totalDelayMinutes: delayMinutes 
            }
        });
        
        const seller = await User.findOne({ userId: sellerId });
        
        // إذا تأخر التاجر أكثر من 5 مرات
        if (seller.totalDelays >= 5) {
            const newRating = Math.max(1, (seller.rating || 5) - 0.5);
            await User.updateOne({ userId: sellerId }, { 
                rating: newRating,
                isFlagged: true,
                flagReason: 'تأخير متكرر في تحرير العملة'
            });
            
            return { flagged: true, newRating };
        }
        
        return { flagged: false };
    }

    // ========== التحقق من حدود المستخدم ==========
    async checkUserLimits(userId, tradeAmount) {
        const user = await User.findOne({ userId });
        if (!user) return { allowed: false, reason: 'المستخدم غير موجود' };
        
        const today = new Date().toISOString().split('T')[0];
        const dailyTrades = user.dailyTrades || [];
        const todayTrades = dailyTrades.filter(t => t.date === today);
        
        if ((user.completedTrades || 0) < 5) {
            if (tradeAmount > 500) {
                return { allowed: false, reason: '⚠️ المستخدمون الجدد لا يمكنهم تداول أكثر من 500 دولار حتى إتمام 5 صفقات' };
            }
            if (todayTrades.length >= 2) {
                return { allowed: false, reason: '⚠️ حد أقصى صفقتين يومياً للمستخدمين الجدد' };
            }
        }
        
        if (!user.isVerified) {
            if (tradeAmount > 100) {
                return { allowed: false, reason: '⚠️ الحسابات غير الموثقة حدها الأقصى 100 دولار. يرجى توثيق حسابك.' };
            }
        }
        
        await User.updateOne(
            { userId },
            { $push: { dailyTrades: { date: today, amount: tradeAmount, timestamp: new Date() } } }
        );
        
        return { allowed: true };
    }

    // ========== التحقق من حاجة عملية التحرير إلى 2FA ==========
    checkIfNeeds2FA(seller, amount) {
        // إذا كان التاجر يطلب 2FA لجميع عمليات التحرير
        if (seller.require2FAForRelease === true) {
            return true;
        }
        
        // إذا كان المبلغ أكبر من الحد الأدنى
        const threshold = seller.release2FAThreshold || this.release2FAThreshold;
        if (amount >= threshold) {
            return true;
        }
        
        // للتجار الجدد (أقل من 10 صفقات)
        if ((seller.completedTrades || 0) < 10) {
            return true;
        }
        
        // للتجار الذين تم وضع علامة عليهم
        if (seller.isFlagged) {
            return true;
        }
        
        return false;
    }

    // ========== نظام التحقق بخطوتين (2FA) ==========
    async generate2FASecret(userId) {
        try {
            const user = await User.findOne({ userId }).maxTimeMS(5000);
            if (!user) return { success: false, message: 'المستخدم غير موجود' };
            
            const secret = speakeasy.generateSecret({ length: 20 });
            const encryptedSecret = this.encryptPrivateKey(secret.base32);
            
            const backupCodes = [];
            for (let i = 0; i < 5; i++) {
                const code = crypto.randomBytes(4).toString('hex').toUpperCase();
                backupCodes.push(this.encryptPrivateKey(code));
            }
            
            await User.updateOne({ userId }, { 
                twoFASecret: encryptedSecret,
                twoFABackupCodes: backupCodes 
            }).maxTimeMS(5000);
            
            const otpauthURL = speakeasy.otpauthURL({
                secret: secret.ascii,
                label: `P2P Exchange (${userId})`,
                issuer: 'P2P Exchange'
            });
            
            const qrCode = await qrcode.toDataURL(otpauthURL);
            const decryptedBackupCodes = backupCodes.map(code => this.decryptPrivateKey(code));
            
            return { success: true, qrCode, backupCodes: decryptedBackupCodes, secret: secret.base32 };
        } catch (error) {
            console.error('2FA generate error:', error);
            return { success: false, message: 'خطأ في الخادم، حاول مرة أخرى' };
        }
    }

    async enable2FA(userId, code) {
        try {
            const user = await User.findOne({ userId }).maxTimeMS(5000);
            if (!user) return { success: false, message: 'المستخدم غير موجود' };
            
            if (!user.twoFASecret) {
                return { success: false, message: 'لم يتم إنشاء رمز 2FA بعد، حاول مرة أخرى' };
            }
            
            const decryptedSecret = this.decryptPrivateKey(user.twoFASecret);
            const verified = speakeasy.totp.verify({
                secret: decryptedSecret,
                encoding: 'base32',
                token: code,
                window: 2
            });
            
            if (!verified) {
                return { success: false, message: '❌ رمز التحقق غير صحيح' };
            }
            
            await User.updateOne({ userId }, { twoFAEnabled: true }).maxTimeMS(5000);
            return { success: true, message: '✅ تم تفعيل التحقق بخطوتين بنجاح' };
        } catch (error) {
            console.error('2FA enable error:', error);
            return { success: false, message: 'خطأ في الخادم، حاول مرة أخرى' };
        }
    }

    async disable2FA(userId, code) {
        try {
            const user = await User.findOne({ userId }).maxTimeMS(5000);
            if (!user) return { success: false, message: 'المستخدم غير موجود' };
            
            if (user.twoFAEnabled && user.twoFASecret) {
                const decryptedSecret = this.decryptPrivateKey(user.twoFASecret);
                const verified = speakeasy.totp.verify({
                    secret: decryptedSecret,
                    encoding: 'base32',
                    token: code,
                    window: 2
                });
                
                if (!verified) {
                    return { success: false, message: '❌ رمز التحقق غير صحيح' };
                }
            }
            
            await User.updateOne({ userId }, { 
                twoFAEnabled: false, 
                twoFASecret: '', 
                twoFABackupCodes: [] 
            }).maxTimeMS(5000);
            
            return { success: true, message: '✅ تم تعطيل التحقق بخطوتين' };
        } catch (error) {
            console.error('2FA disable error:', error);
            return { success: false, message: 'خطأ في الخادم، حاول مرة أخرى' };
        }
    }

    async verify2FACode(userId, code) {
        const user = await User.findOne({ userId });
        if (!user || !user.twoFAEnabled) return false;
        
        const decryptedSecret = this.decryptPrivateKey(user.twoFASecret);
        const verified = speakeasy.totp.verify({
            secret: decryptedSecret,
            encoding: 'base32',
            token: code,
            window: 2
        });
        
        if (verified) return true;
        
        for (let i = 0; i < (user.twoFABackupCodes || []).length; i++) {
            const decryptedCode = this.decryptPrivateKey(user.twoFABackupCodes[i]);
            if (decryptedCode === code) {
                const newBackupCodes = [...user.twoFABackupCodes];
                newBackupCodes.splice(i, 1);
                await User.updateOne({ userId }, { twoFABackupCodes: newBackupCodes });
                return true;
            }
        }
        
        return false;
    }

    // ========== إنشاء المحافظ ==========
    async createBnbWallet() {
        const wallet = ethers.Wallet.createRandom();
        return { address: wallet.address, encryptedPrivateKey: this.encryptPrivateKey(wallet.privateKey) };
    }
    
    async createPolygonWallet() {
        const wallet = ethers.Wallet.createRandom();
        return { address: wallet.address, encryptedPrivateKey: this.encryptPrivateKey(wallet.privateKey) };
    }
    
    async createSolanaWallet() {
        const keypair = Keypair.generate();
        return { address: keypair.publicKey.toString(), encryptedPrivateKey: this.encryptPrivateKey(JSON.stringify(Array.from(keypair.secretKey))) };
    }
    
    async createAptosWallet() {
        const account = new AptosAccount();
        return { address: account.address().hex(), encryptedPrivateKey: this.encryptPrivateKey(account.toPrivateKeyObject().privateKeyHex) };
    }

    async getUserWallet(userId) {
        let wallet = await Wallet.findOne({ userId });
        if (!wallet) {
            const [bnb, polygon, solana, aptos] = await Promise.all([
                this.createBnbWallet(), this.createPolygonWallet(), this.createSolanaWallet(), this.createAptosWallet()
            ]);
            wallet = await Wallet.create({
                userId,
                bnbAddress: bnb.address,
                bnbEncryptedPrivateKey: bnb.encryptedPrivateKey,
                polygonAddress: polygon.address,
                polygonEncryptedPrivateKey: polygon.encryptedPrivateKey,
                solanaAddress: solana.address,
                solanaEncryptedPrivateKey: solana.encryptedPrivateKey,
                aptosAddress: aptos.address,
                aptosEncryptedPrivateKey: aptos.encryptedPrivateKey,
                usdBalance: 0,
                walletSignature: this.generateSignature(`wallet-${userId}`)
            });
        }
        return wallet;
    }

    // ========== تسجيل المستخدم مع الإحالات ==========
    async registerUser(userId, username, firstName, lastName, phone, email, country, city, referrerId = null, language = 'ar', ip = '', userAgent = '') {
        await this.connect();
        
        let user = await User.findOne({ userId });
        if (!user) {
            const wallet = await this.getUserWallet(userId);
            
            let validReferrer = null;
            if (referrerId && referrerId !== userId) {
                validReferrer = await User.findOne({ userId: referrerId });
                if (validReferrer && !validReferrer.isBanned && !validReferrer.isLocked) {
                    await User.updateOne(
                        { userId: referrerId },
                        { 
                            $inc: { referralCount: 1 },
                            $push: { 
                                referrals: { 
                                    userId: userId, 
                                    joinedAt: new Date(),
                                    totalCommission: 0,
                                    earned: 0
                                } 
                            }
                        }
                    );
                } else {
                    validReferrer = null;
                }
            }
            
            user = await User.create({
                userId, 
                username: username || '', 
                firstName: firstName || '', 
                lastName: lastName || '',
                phoneNumber: phone || '', 
                email: email || '', 
                country: country || 'SD', 
                city: city || '',
                language, 
                walletId: wallet._id,
                referrerId: validReferrer ? referrerId : null,
                isVerified: false,
                lastSeen: new Date(),
                isOnline: true,
                lastLoginIp: ip,
                loginAttempts: 0,
                twoFAEnabled: false,
                twoFASecret: '',
                twoFABackupCodes: [],
                require2FAForRelease: true,
                release2FAThreshold: 100,
                dailyTrades: [],
                suspiciousActions: [],
                warningCount: 0,
                totalDelays: 0,
                totalDelayMinutes: 0,
                isFlagged: false,
                flagReason: ''
            });
            
            await this.updateDailyStats('totalUsers', 'newUsers');
            await this.addAuditLog(userId, 'register', { referrer: referrerId }, ip, userAgent);
            
            return { success: true, isNew: true, referrer: validReferrer };
        }
        
        await User.updateOne({ userId }, { lastSeen: new Date(), isOnline: true, lastLoginIp: ip });
        await this.addAuditLog(userId, 'login', {}, ip, userAgent);
        
        return { success: true, isNew: false };
    }

    async getUser(userId) { 
        return await User.findOne({ userId }); 
    }
    
    async getUserStats(userId) {
        const user = await this.getUser(userId);
        if (!user) return null;
        const wallet = await this.getUserWallet(userId);
        const activeOffers = await P2pOffer.countDocuments({ userId, status: 'active' });
        const pendingTrades = await Trade.countDocuments({ 
            $or: [{ buyerId: userId }, { sellerId: userId }], 
            status: { $in: ['pending', 'paid'] } 
        });
        
        const completedTrades = user.completedTrades || 0;
        const failedTrades = user.failedTrades || 0;
        const successRate = completedTrades + failedTrades > 0 
            ? (completedTrades / (completedTrades + failedTrades)) * 100 
            : 100;
        
        const onlineStatus = await this.getUserOnlineStatus(userId);
        
        return {
            ...user.toObject(),
            usdBalance: wallet.usdBalance,
            walletAddresses: {
                bnb: wallet.bnbAddress,
                polygon: wallet.polygonAddress,
                solana: wallet.solanaAddress,
                aptos: wallet.aptosAddress
            },
            walletSignature: wallet.walletSignature,
            activeOffers,
            pendingTrades,
            successRate: successRate.toFixed(1),
            referralEarnings: user.referralEarnings || 0,
            referralCount: user.referralCount || 0,
            onlineStatus: onlineStatus.statusText,
            isOnline: onlineStatus.isOnline,
            totalDelays: user.totalDelays || 0,
            isFlagged: user.isFlagged || false
        };
    }

    async addUsdBalance(userId, amount, reason) {
        await Wallet.updateOne({ userId }, { $inc: { usdBalance: amount } });
        await this.addAuditLog(userId, 'add_balance', { amount, reason }, '', '');
        return true;
    }

    async deductUsdBalance(userId, amount, reason) {
        const wallet = await this.getUserWallet(userId);
        if (wallet.usdBalance < amount) return false;
        await Wallet.updateOne({ userId }, { $inc: { usdBalance: -amount } });
        await this.addAuditLog(userId, 'deduct_balance', { amount, reason }, '', '');
        return true;
    }

    // ========== نظام الإحالات - إضافة عمولة للمُحيل ==========
    async addReferralCommission(referrerId, userId, tradeAmount, platformFee) {
        const referrer = await User.findOne({ userId: referrerId });
        if (!referrer || referrer.isBanned) return;
        
        const commission = platformFee * (this.referralCommissionRate / 100);
        if (commission <= 0) return;
        
        await Wallet.updateOne({ userId: referrerId }, { $inc: { usdBalance: commission } });
        await User.updateOne({ userId: referrerId }, { $inc: { referralEarnings: commission } });
        
        await User.updateOne(
            { userId: referrerId, 'referrals.userId': userId },
            { $inc: { 'referrals.$.earned': commission } }
        );
        
        await this.addAuditLog(referrerId, 'referral_commission', { amount: commission, fromUser: userId, tradeAmount }, '', '');
        await this.updateDailyStats('totalReferralCommissions', commission);
        
        return commission;
    }

    // ========== نظام التوثيق ==========
    async createKycRequest(userId, fullName, passportNumber, nationalId, phoneNumber, email, country, city, passportPhotoFileId, personalPhotoFileId, bankName, bankAccountNumber, bankAccountName) {
        await this.connect();
        
        const existing = await KycRequest.findOne({ userId });
        if (existing && existing.status === 'pending') {
            return { success: false, message: '⚠️ لديك طلب توثيق قيد المراجعة بالفعل' };
        }
        if (existing && existing.status === 'approved') {
            return { success: false, message: '✅ حسابك موثق بالفعل' };
        }
        
        const kycRequest = await KycRequest.create({
            userId, fullName, passportNumber, nationalId, phoneNumber, email, country, city,
            passportPhotoFileId, personalPhotoFileId, bankName, bankAccountNumber, bankAccountName,
            status: 'pending'
        });
        
        await this.updateDailyStats('pendingKyc', 1);
        await this.addAuditLog(userId, 'kyc_submit', { requestId: kycRequest._id }, '', '');
        
        return {
            success: true,
            requestId: kycRequest._id,
            request: {
                _id: kycRequest._id,
                passportPhotoFileId: passportPhotoFileId,
                personalPhotoFileId: personalPhotoFileId,
                fullName: fullName,
                phoneNumber: phoneNumber,
                email: email,
                bankName: bankName,
                bankAccountNumber: bankAccountNumber,
                bankAccountName: bankAccountName,
                passportNumber: passportNumber,
                nationalId: nationalId
            },
            message: `✅ *تم إرسال طلب التوثيق!*\n\n🆔 *رقم الطلب:* ${kycRequest._id.toString().slice(-6)}\n👤 *الاسم الكامل:* ${fullName}\n📞 *رقم الهاتف:* ${phoneNumber}\n📧 *البريد الإلكتروني:* ${email}\n\n⏳ *سيتم مراجعة طلبك من قبل الإدارة خلال 24 ساعة*`
        };
    }

    async getPendingKycRequests() {
        await this.connect();
        return await KycRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).lean();
    }

    async approveKyc(requestId, adminId) {
        await this.connect();
        
        const request = await KycRequest.findOne({ _id: requestId, status: 'pending' });
        if (!request) return { success: false, message: 'الطلب غير موجود' };
        
        await KycRequest.updateOne({ _id: requestId }, {
            status: 'approved', approvedBy: adminId, approvedAt: new Date(), updatedAt: new Date()
        });
        
        await User.updateOne({ userId: request.userId }, {
            firstName: request.fullName.split(' ')[0],
            lastName: request.fullName.split(' ').slice(1).join(' '),
            phoneNumber: request.phoneNumber,
            email: request.email,
            country: request.country,
            city: request.city,
            bankName: request.bankName,
            bankAccountNumber: request.bankAccountNumber,
            bankAccountName: request.bankAccountName,
            isVerified: true
        });
        
        await this.updateDailyStats('verifiedUsers', 1);
        await this.updateDailyStats('pendingKyc', -1);
        await this.addAuditLog(adminId, 'kyc_approve', { userId: request.userId }, '', '');
        
        return {
            success: true,
            userId: request.userId,
            message: `✅ *تم توثيق الحساب بنجاح!*\n\n👤 *المستخدم:* ${request.fullName}\n🆔 *رقم الطلب:* ${requestId.toString().slice(-6)}\n\n🎉 *يمكنك الآن البدء في التداول على المنصة*`
        };
    }

    async rejectKyc(requestId, adminId, reason) {
        await this.connect();
        
        const request = await KycRequest.findOne({ _id: requestId, status: 'pending' });
        if (!request) return { success: false, message: 'الطلب غير موجود' };
        
        await KycRequest.updateOne({ _id: requestId }, {
            status: 'rejected', rejectionReason: reason, approvedBy: adminId, updatedAt: new Date()
        });
        
        await this.updateDailyStats('pendingKyc', -1);
        await this.addAuditLog(adminId, 'kyc_reject', { userId: request.userId, reason }, '', '');
        
        return {
            success: true,
            userId: request.userId,
            message: `❌ *تم رفض طلب التوثيق!*\n\n📝 *السبب:* ${reason}\n\n🔄 *يمكنك إعادة تقديم الطلب بعد تصحيح البيانات*`
        };
    }

    async getKycStatus(userId) {
        const request = await KycRequest.findOne({ userId });
        if (!request) return { status: 'not_submitted' };
        return { status: request.status, requestId: request._id, rejectionReason: request.rejectionReason };
    }

    // ========== تاريخ العروض والصفقات ==========
    async getUserOffersHistory(userId, limit = 20) {
        await this.connect();
        return await P2pOffer.find({ userId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('type currency fiatAmount price status createdAt completedAt');
    }

    async getUserTradesHistory(userId, limit = 20) {
        await this.connect();
        const trades = await Trade.find({
            $or: [{ buyerId: userId }, { sellerId: userId }]
        })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('amount currency price status createdAt completedAt paidAt buyerId sellerId fee totalUsd');
        
        for (const trade of trades) {
            const otherId = trade.buyerId === userId ? trade.sellerId : trade.buyerId;
            const otherUser = await User.findOne({ userId: otherId }).select('firstName username');
            trade.otherParty = otherUser ? (otherUser.firstName || otherUser.username || otherId) : otherId;
            trade.role = trade.buyerId === userId ? 'مشتري' : 'بائع';
        }
        return trades;
    }

    async getAveragePrice() {
        const offers = await P2pOffer.find({ status: 'active' });
        if (offers.length === 0) return 0;
        const avgPrice = offers.reduce((sum, o) => sum + o.price, 0) / offers.length;
        return avgPrice.toFixed(2);
    }

    async getMostActiveCurrency() {
        const result = await P2pOffer.aggregate([
            { $match: { status: 'active' } },
            { $group: { _id: '$currency', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 1 }
        ]);
        return result[0]?._id || 'USD';
    }

    async getMarketStats() {
        await this.connect();
        
        const totalOffers = await P2pOffer.countDocuments({ status: 'active' });
        const avgPrice = await this.getAveragePrice();
        const mostActiveCurrency = await this.getMostActiveCurrency();
        const totalTraders = await User.countDocuments({ completedTrades: { $gt: 0 } });
        const totalVolume = await Trade.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$totalUsd' } } }
        ]);
        
        return {
            totalOffers,
            avgPrice: parseFloat(avgPrice),
            mostActiveCurrency,
            totalTraders,
            totalVolume: totalVolume[0]?.total || 0
        };
    }

    // ========== عروض P2P ==========
    async createOffer(userId, type, currency, fiatAmount, price, paymentMethod, paymentDetails, bankName, bankAccountNumber, bankAccountName, minAmount, maxAmount) {
        const user = await this.getUser(userId);
        if (!user) return { success: false, message: 'المستخدم غير موجود' };
        
        const banCheck = await this.isUserBannedOrLocked(userId);
        if (banCheck.banned) return { success: false, message: banCheck.reason };
        if (banCheck.locked) return { success: false, message: banCheck.reason };
        
        if (!user.isVerified) {
            return { success: false, message: '⚠️ حسابك غير موثق! يرجى توثيق حسابك أولاً' };
        }
        
        const wallet = await this.getUserWallet(userId);
        const usdValue = fiatAmount / price;
        
        if (type === 'sell' && wallet.usdBalance < usdValue) {
            return { success: false, message: `❌ رصيد غير كافٍ! لديك ${wallet.usdBalance.toFixed(2)} USD\nتحتاج: ${usdValue.toFixed(2)} USD` };
        }
        
        const offer = await P2pOffer.create({
            userId, type, currency, fiatAmount, price,
            paymentMethod, paymentDetails, bankName, bankAccountNumber, bankAccountName,
            minAmount: minAmount || 10, maxAmount: maxAmount || 100000
        });
        
        await this.updateDailyStats('activeOffers', 1);
        await this.addAuditLog(userId, 'create_offer', { offerId: offer._id, type, currency, amount: fiatAmount }, '', '');
        await this.updateLastSeen(userId);
        
        const currencyNames = {
            USD: 'دولار أمريكي', EUR: 'يورو', GBP: 'جنيه إسترليني',
            SAR: 'ريال سعودي', AED: 'درهم إماراتي', EGP: 'جنيه مصري',
            SDG: 'جنيه سوداني', IQD: 'دينار عراقي', JOD: 'دينار أردني',
            KWD: 'دينار كويتي', QAR: 'ريال قطري', BHD: 'دينار بحريني',
            OMR: 'ريال عماني', TRY: 'ليرة تركية', INR: 'روبية هندية', PKR: 'روبية باكستانية'
        };
        
        return {
            success: true,
            offerId: offer._id,
            message: `✅ *تم إنشاء عرض ${type === 'sell' ? 'بيع' : 'شراء'}!*\n\n💰 *المبلغ:* ${fiatAmount.toFixed(2)} ${currency} (${currencyNames[currency] || currency})\n📊 *السعر:* ${price.toFixed(2)} ${currency}/USD\n💵 *القيمة بالدولار:* ${usdValue.toFixed(2)} USD\n🏦 *طريقة الدفع:* ${paymentMethod}\n${bankName ? `🏛️ *البنك:* ${bankName}\n` : ''}${bankAccountNumber ? `🔢 *رقم الحساب:* ${bankAccountNumber}\n` : ''}${bankAccountName ? `👤 *اسم الحساب:* ${bankAccountName}\n` : ''}⚠️ *الحد الأدنى:* ${minAmount || 10} ${currency} | *الحد الأقصى:* ${maxAmount || 100000} ${currency}`
        };
    }

    async getOffers(type = null, currency = null, sortBy = 'price', order = 'asc', limit = 50) {
        const query = { status: 'active' };
        if (type) query.type = type;
        if (currency) query.currency = currency;
        
        const sort = {};
        sort[sortBy] = order === 'asc' ? 1 : -1;
        
        const offers = await P2pOffer.find(query).sort(sort).limit(limit).lean();
        
        const users = await User.find({ userId: { $in: offers.map(o => o.userId) } });
        const userMap = {};
        for (const u of users) {
            const completed = u.completedTrades || 0;
            const failed = u.failedTrades || 0;
            u.successRate = completed + failed > 0 ? (completed / (completed + failed)) * 100 : 100;
            
            const onlineStatus = await this.getUserOnlineStatus(u.userId);
            u.onlineStatus = onlineStatus.statusText;
            u.isOnline = onlineStatus.isOnline;
            userMap[u.userId] = u;
        }
        
        return offers.map(offer => {
            const user = userMap[offer.userId];
            let trustLevel = 'medium';
            let trustBadge = '';
            if (user?.completedTrades > 50 && user?.rating > 4.5) {
                trustLevel = 'high';
                trustBadge = '🏅 ممتاز';
            } else if (user?.completedTrades > 10 && user?.rating > 4) {
                trustLevel = 'high';
                trustBadge = '✅ موثوق';
            } else if (user?.completedTrades < 5) {
                trustLevel = 'low';
                trustBadge = '🆕 جديد';
            }
            
            const badges = [];
            if (user?.isVerified) badges.push('✅ موثق');
            if (user?.completedTrades > 50) badges.push('👑 تاجر محترف');
            if (user?.completedTrades > 10) badges.push('⭐ نشط');
            if (user?.rating > 4.5) badges.push('🏅 ممتاز');
            if (user?.isOnline) badges.push('🟢 متصل');
            
            return {
                ...offer,
                username: user?.username,
                firstName: user?.firstName,
                rating: user?.rating || 5.0,
                completedTrades: user?.completedTrades || 0,
                successRate: user?.successRate || 100,
                isVerified: user?.isVerified || false,
                isMerchant: user?.isMerchant || false,
                onlineStatus: user?.onlineStatus || 'غير معروف',
                isOnline: user?.isOnline || false,
                trustLevel,
                trustBadge,
                badges: badges.join(' ')
            };
        });
    }

    async getUserOffers(userId) {
        return await P2pOffer.find({ userId, status: 'active' }).sort({ createdAt: -1 }).lean();
    }

    async cancelOffer(offerId, userId) {
        const offer = await P2pOffer.findOne({ _id: offerId, userId, status: 'active' });
        if (!offer) return { success: false, message: 'العرض غير موجود' };
        
        await P2pOffer.updateOne({ _id: offerId }, { status: 'cancelled' });
        await this.updateDailyStats('activeOffers', -1);
        await this.addAuditLog(userId, 'cancel_offer', { offerId }, '', '');
        await this.updateLastSeen(userId);
        
        return { success: true, message: '✅ تم إلغاء العرض بنجاح' };
    }

    // ========== بدء صفقة ==========
    async startTrade(offerId, buyerId) {
        const offer = await P2pOffer.findOne({ _id: offerId, status: 'active' });
        if (!offer) return { success: false, message: 'العرض غير موجود' };
        
        if (offer.userId === buyerId) return { success: false, message: 'لا يمكنك شراء عرضك الخاص' };
        
        const buyerBanCheck = await this.isUserBannedOrLocked(buyerId);
        if (buyerBanCheck.banned) return { success: false, message: buyerBanCheck.reason };
        if (buyerBanCheck.locked) return { success: false, message: buyerBanCheck.reason };
        
        const sellerBanCheck = await this.isUserBannedOrLocked(offer.userId);
        if (sellerBanCheck.banned) return { success: false, message: 'البائع محظور لا يمكن التداول معه' };
        
        const buyer = await this.getUser(buyerId);
        if (!buyer.isVerified) {
            return { success: false, message: '⚠️ حسابك غير موثق! يرجى توثيق حسابك أولاً' };
        }
        
        const seller = await this.getUser(offer.userId);
        if (!seller.isVerified) {
            return { success: false, message: '⚠️ البائع غير موثق! لا يمكن إتمام الصفقة' };
        }
        
        const totalUsd = offer.fiatAmount / offer.price;
        const limitCheck = await this.checkUserLimits(buyerId, totalUsd);
        if (!limitCheck.allowed) return { success: false, message: limitCheck.reason };
        
        const fee = totalUsd * this.platformFee;
        
        if (offer.type === 'sell') {
            const sellerWallet = await this.getUserWallet(offer.userId);
            if (sellerWallet.usdBalance < totalUsd) {
                await P2pOffer.updateOne({ _id: offerId }, { status: 'cancelled' });
                return { success: false, message: 'البائع ليس لديه رصيد كافٍ' };
            }
        }
        
        const trade = await Trade.create({
            offerId, buyerId, sellerId: offer.userId,
            currency: offer.currency, amount: offer.fiatAmount,
            price: offer.price, totalUsd, fee,
            paymentMethod: offer.paymentMethod,
            buyerBankDetails: `${buyer.bankName || ''} - ${buyer.bankAccountNumber || ''} - ${buyer.bankAccountName || ''}`,
            sellerBankDetails: `${offer.bankName || ''} - ${offer.bankAccountNumber || ''} - ${offer.bankAccountName || ''}`,
            status: 'pending'
        });
        
        await P2pOffer.updateOne({ _id: offerId }, { status: 'pending', counterpartyId: buyerId });
        await this.addAuditLog(buyerId, 'start_trade', { tradeId: trade._id, offerId, amount: totalUsd }, '', '');
        await this.updateLastSeen(buyerId);
        
        return {
            success: true,
            tradeId: trade._id,
            sellerPaymentDetails: offer.type === 'sell' ? offer.paymentDetails : '',
            buyerPaymentDetails: offer.type === 'buy' ? offer.paymentDetails : '',
            totalUsd,
            fee,
            message: `🔄 *تم بدء الصفقة!*\n\n💰 *المبلغ:* ${offer.fiatAmount.toFixed(2)} ${offer.currency}\n💵 *القيمة:* ${totalUsd.toFixed(2)} USD\n💸 *عمولة المنصة:* ${fee.toFixed(2)} USD\n🏦 *طريقة الدفع:* ${offer.paymentMethod}\n📝 *تفاصيل ${offer.type === 'sell' ? 'البائع' : 'المشتري'}:*\n${offer.type === 'sell' ? offer.paymentDetails : ''}\n\n✅ *بعد التحويل، أرسل:*\n/send_proof ${trade._id} [رابط الصورة]\n\n❌ *لإلغاء الصفقة قبل الدفع:*\n/cancel_trade ${trade._id}`
        };
    }

    // ========== تأكيد الدفع ==========
    async confirmPayment(tradeId, buyerId, proofImage) {
        const trade = await Trade.findOne({ _id: tradeId, buyerId, status: 'pending' });
        if (!trade) return { success: false, message: 'الصفقة غير موجودة' };
        
        const timeToSend = Date.now() - new Date(trade.createdAt).getTime();
        if (timeToSend < 30000) {
            await this.trackSuspiciousBehavior(buyerId, 'fast_proof', { timeToSend, tradeId });
            return { success: false, message: '⚠️ إثبات سريع جداً - يرجى الانتظار دقيقة قبل إرسال الإثبات' };
        }
        
        await Trade.updateOne({ _id: tradeId }, { paymentProof: proofImage, status: 'paid', paidAt: new Date() });
        await this.addAuditLog(buyerId, 'confirm_payment', { tradeId, proofImage }, '', '');
        await this.updateLastSeen(buyerId);
        
        // جدولة تذكير للتاجر بعد 15 دقيقة
        this.scheduleReleaseReminder(tradeId);
        
        return {
            success: true,
            sellerId: trade.sellerId,
            message: `✅ *تم استلام إثبات الدفع!*\n\n📋 *رقم الصفقة:* ${tradeId}\n💰 *المبلغ:* ${trade.amount.toFixed(2)} ${trade.currency}\n🖼️ *رابط الإثبات:* ${proofImage}\n\n🔓 *بعد التحقق، قم بتحرير العملة:*\n/release_crystals ${tradeId}`
        };
    }

    // ========== تذكير التاجر بعد 15 دقيقة ==========
    async scheduleReleaseReminder(tradeId) {
        setTimeout(async () => {
            const trade = await Trade.findById(tradeId);
            
            if (trade && trade.status === 'paid') {
                const timeSincePaid = Date.now() - new Date(trade.paidAt).getTime();
                
                // تذكير أول بعد 15 دقيقة
                if (timeSincePaid >= 15 * 60 * 1000 && timeSincePaid < 30 * 60 * 1000) {
                    await bot.telegram.sendMessage(trade.sellerId,
                        `⏰ *تذكير: لم تقم بتحرير العملة بعد!*\n\n` +
                        `📋 *الصفقة:* ${tradeId}\n` +
                        `💰 *المبلغ:* ${trade.amount} ${trade.currency}\n` +
                        `⏱️ *مضى:* 15 دقيقة على تأكيد الدفع\n\n` +
                        `🔓 *يرجى تحرير العملة الآن:*\n/release_crystals ${tradeId}\n\n` +
                        `⚠️ إذا لم تكن الأموال قد وصلتك، افتح نزاعاً:\n/dispute ${tradeId} "لم استلم الأموال"`,
                        { parse_mode: 'Markdown' }
                    );
                    
                    await bot.telegram.sendMessage(trade.buyerId,
                        `⏰ *تحديث الصفقة*\n\n` +
                        `📋 *الصفقة:* ${tradeId}\n` +
                        `💰 *المبلغ:* ${trade.amount} ${trade.currency}\n` +
                        `📤 *تم إرسال إثبات الدفع منذ 15 دقيقة*\n\n` +
                        `⏳ *البائع لم يحرر العملة بعد*\n` +
                        `📞 يمكنك تذكير البائع: /remind_seller ${tradeId}`,
                        { parse_mode: 'Markdown' }
                    );
                }
                
                // تذكير ثانٍ بعد 30 دقيقة مع إشعار الأدمن
                if (timeSincePaid >= 30 * 60 * 1000 && timeSincePaid < 60 * 60 * 1000) {
                    await bot.telegram.sendMessage(trade.sellerId,
                        `⚠️ *تذكير مهم: لم تقم بتحرير العملة!*\n\n` +
                        `📋 *الصفقة:* ${tradeId}\n` +
                        `⏱️ *مضى:* 30 دقيقة على تأكيد الدفع\n\n` +
                        `🔓 /release_crystals ${tradeId}\n\n` +
                        `⚠️ إذا لم تتحرر العملة قريباً، سيتم إشعار الإدارة.`,
                        { parse_mode: 'Markdown' }
                    );
                    
                    // إشعار الأدمن
                    const ADMIN_ID = parseInt(process.env.ADMIN_ID) || 6701743450;
                    await bot.telegram.sendMessage(ADMIN_ID,
                        `⚠️ *صفقة متأخرة*\n📋 الصفقة: ${tradeId}\n👤 البائع: ${trade.sellerId}\n👤 المشتري: ${trade.buyerId}\n💰 المبلغ: ${trade.amount} USD\n⏱️ مضى 30 دقيقة على تأكيد الدفع ولم يحرر`,
                        { parse_mode: 'Markdown' }
                    );
                }
                
                // تحرير تلقائي بعد 24 ساعة
                if (timeSincePaid >= 24 * 60 * 60 * 1000) {
                    await this.autoReleaseAfterDelay(tradeId);
                }
            }
        }, 15 * 60 * 1000);
    }

    // ========== تحرير تلقائي بعد 24 ساعة ==========
    async autoReleaseAfterDelay(tradeId) {
        const trade = await Trade.findById(tradeId);
        
        if (trade && trade.status === 'paid') {
            const timeSincePaid = Date.now() - new Date(trade.paidAt).getTime();
            
            if (timeSincePaid >= 24 * 60 * 60 * 1000) {
                // تسجيل تأخير التاجر
                await this.trackSellerDelay(trade.sellerId, tradeId, 24 * 60);
                
                // تحرير تلقائي
                await this.releaseCrystals(tradeId, trade.sellerId);
                
                // إشعار الطرفين
                await bot.telegram.sendMessage(trade.sellerId,
                    `🤖 *تم تحرير العملة تلقائياً*\n\n📋 الصفقة: ${tradeId}\n⏱️ مضى 24 ساعة على تأكيد الدفع\n\n⚠️ تم تحرير العملة تلقائياً لصالح المشتري`,
                    { parse_mode: 'Markdown' }
                );
                
                await bot.telegram.sendMessage(trade.buyerId,
                    `✅ *تم تحرير العملة تلقائياً*\n\n📋 الصفقة: ${tradeId}\n💰 المبلغ: ${trade.amount} ${trade.currency}\n\n🎉 تم تحرير العملة بعد انقضاء المهلة الزمنية`,
                    { parse_mode: 'Markdown' }
                );
            }
        }
    }

    // ========== تحرير العملة مع 2FA ومهلة أمان ==========
    async releaseCrystals(tradeId, sellerId, twoFACode = null, ip = '', userAgent = '') {
        const trade = await Trade.findOne({ _id: tradeId, sellerId, status: 'paid' });
        if (!trade) return { success: false, message: 'الصفقة غير موجودة' };
        
        const seller = await User.findOne({ userId: sellerId });
        const buyer = await User.findOne({ userId: trade.buyerId });
        
        // تحديث آخر ظهور
        await this.updateLastSeen(sellerId);
        
        // ========== 1. التحقق من 2FA ==========
        const needs2FA = this.checkIfNeeds2FA(seller, trade.totalUsd);
        
        if (needs2FA && seller.twoFAEnabled) {
            if (!twoFACode) {
                return { 
                    success: false, 
                    message: `🔐 *مطلوب رمز التحقق بخطوتين لتحرير ${trade.totalUsd.toFixed(2)} USD*\n📱 أرسل: /release_2fa ${tradeId} [الرمز]` 
                };
            }
            
            const verified = await this.verify2FACode(sellerId, twoFACode);
            if (!verified) {
                await this.trackSuspiciousBehavior(sellerId, 'failed_2fa_release', { tradeId, amount: trade.totalUsd });
                return { success: false, message: '❌ رمز التحقق غير صحيح' };
            }
        }
        
        // ========== 2. مهلة أمان للمبالغ الكبيرة ==========
        const timeSincePaid = Date.now() - new Date(trade.paidAt).getTime();
        let requiredDelay = 0;
        
        if (trade.totalUsd > 5000) requiredDelay = 60 * 60 * 1000;      // ساعة للمبالغ الكبيرة جداً
        else if (trade.totalUsd > 1000) requiredDelay = 30 * 60 * 1000; // 30 دقيقة للمبالغ الكبيرة
        else if (seller.completedTrades < 10) requiredDelay = 15 * 60 * 1000; // 15 دقيقة للتجار الجدد
        
        if (requiredDelay > 0 && timeSincePaid < requiredDelay) {
            const remainingMinutes = Math.ceil((requiredDelay - timeSincePaid) / 60000);
            return { 
                success: false, 
                message: `⚠️ مهلة أمان: سيتم تحرير العملة خلال ${remainingMinutes} دقيقة للتأكد من صحة الدفع` 
            };
        }
        
        // ========== 3. تنفيذ التحرير ==========
        const sellerWallet = await this.getUserWallet(sellerId);
        
        if (trade.offerId) {
            const offer = await P2pOffer.findById(trade.offerId);
            if (offer && offer.type === 'sell') {
                if (sellerWallet.usdBalance < trade.totalUsd) {
                    await Trade.updateOne({ _id: tradeId }, { status: 'disputed' });
                    await this.trackSuspiciousBehavior(sellerId, 'insufficient_balance', { tradeId, required: trade.totalUsd, available: sellerWallet.usdBalance });
                    return { success: false, message: '⚠️ رصيد البائع غير كافٍ! تم فتح نزاع' };
                }
                await Wallet.updateOne({ userId: sellerId }, { $inc: { usdBalance: -trade.totalUsd } });
                await Wallet.updateOne({ userId: trade.buyerId }, { $inc: { usdBalance: trade.totalUsd - trade.fee } });
            }
        }
        
        await Wallet.updateOne({ userId: 0 }, { $inc: { usdBalance: trade.fee } });
        
        // إضافة عمولة الإحالة
        if (buyer && buyer.referrerId) {
            await this.addReferralCommission(buyer.referrerId, trade.buyerId, trade.totalUsd, trade.fee);
        }
        
        await Trade.updateOne({ _id: tradeId }, { status: 'completed', releasedAt: new Date(), completedAt: new Date() });
        await P2pOffer.updateOne({ _id: trade.offerId }, { status: 'completed' });
        
        await User.updateOne({ userId: sellerId }, { $inc: { completedTrades: 1, totalTraded: trade.totalUsd } });
        await User.updateOne({ userId: trade.buyerId }, { $inc: { completedTrades: 1, totalTraded: trade.totalUsd } });
        
        await this.updateDailyStats('totalTrades', 1);
        await this.updateDailyStats('totalVolume', trade.totalUsd);
        await this.updateDailyStats('totalCommission', trade.fee);
        await this.updateDailyStats('activeOffers', -1);
        await this.addAuditLog(sellerId, 'release_crystals', { tradeId, amount: trade.totalUsd, required2FA: needs2FA }, ip, userAgent);
        
        return {
            success: true,
            buyerId: trade.buyerId,
            message: `✅ *تم تحرير العملة بنجاح!*\n\n📋 *رقم الصفقة:* ${tradeId}\n💰 *المبلغ:* ${trade.amount.toFixed(2)} ${trade.currency}\n💵 *القيمة:* ${trade.totalUsd.toFixed(2)} USD\n💸 *عمولة المنصة:* ${trade.fee.toFixed(2)} USD\n\n⭐ *تقييم الصفقة:*\n/rate ${tradeId} [5] [تعليق]`
        };
    }

    // ========== إلغاء صفقة معلقة ==========
    async cancelPendingTrade(tradeId, userId) {
        await this.connect();
        
        const trade = await Trade.findOne({
            _id: tradeId,
            $or: [{ buyerId: userId }, { sellerId: userId }],
            status: 'pending'
        });
        
        if (!trade) {
            return { success: false, message: '❌ لا يمكن إلغاء هذه الصفقة. قد تكون تمت بالفعل أو انتهت صلاحيتها' };
        }
        
        await Trade.updateOne({ _id: tradeId }, { status: 'cancelled' });
        
        if (trade.offerId) {
            await P2pOffer.updateOne({ _id: trade.offerId }, { status: 'active', counterpartyId: null });
        }
        
        await User.updateOne({ userId: trade.buyerId }, { $inc: { failedTrades: 1 } });
        await User.updateOne({ userId: trade.sellerId }, { $inc: { failedTrades: 1 } });
        await this.addAuditLog(userId, 'cancel_trade', { tradeId }, '', '');
        await this.updateLastSeen(userId);
        
        return {
            success: true,
            message: `✅ *تم إلغاء الصفقة بنجاح*\n\n📋 *رقم الصفقة:* ${tradeId}\n💰 *المبلغ:* ${trade.amount.toFixed(2)} ${trade.currency}\n\n⚠️ *تم إلغاء الحجز وعودة العرض إلى حالة النشاط*`
        };
    }

    // ========== النزاعات ==========
    async openDispute(tradeId, userId, reason) {
        const trade = await Trade.findOne({ 
            _id: tradeId, 
            $or: [{ buyerId: userId }, { sellerId: userId }], 
            status: { $in: ['pending', 'paid'] } 
        });
        if (!trade) return { success: false, message: 'الصفقة غير موجودة' };
        
        await Trade.updateOne({ _id: tradeId }, { status: 'disputed', disputeReason: reason, disputeOpenedBy: userId });
        await this.addAuditLog(userId, 'open_dispute', { tradeId, reason }, '', '');
        await this.updateLastSeen(userId);
        
        return {
            success: true,
            message: `⚠️ *تم فتح نزاع!*\n\n📋 *رقم الصفقة:* ${tradeId}\n📝 *السبب:* ${reason}\n\n👨‍⚖️ *سيتم مراجعة النزاع من قبل الإدارة خلال 24 ساعة*`
        };
    }

    // ========== التقييمات ==========
    async addReview(tradeId, reviewerId, rating, comment) {
        const trade = await Trade.findOne({ _id: tradeId, status: 'completed' });
        if (!trade) return { success: false, message: 'الصفقة غير موجودة' };
        
        const existing = await Review.findOne({ tradeId, reviewerId });
        if (existing) return { success: false, message: 'لقد قمت بتقييم هذه الصفقة بالفعل' };
        
        const targetId = reviewerId === trade.buyerId ? trade.sellerId : trade.buyerId;
        
        await Review.create({ tradeId, reviewerId, targetId, rating, comment });
        
        const reviews = await Review.find({ targetId });
        const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
        await User.updateOne({ userId: targetId }, { rating: avgRating });
        await this.addAuditLog(reviewerId, 'add_review', { tradeId, targetId, rating }, '', '');
        await this.updateLastSeen(reviewerId);
        
        return { success: true, message: `⭐ *تم التقييم!*\n\n📊 *تقييمك:* ${rating}/5\n${comment ? `📝 *تعليق:* ${comment}` : ''}` };
    }

    // ========== الإيداع والسحب ==========
    async requestDeposit(userId, amount, currency, network) {
        const wallet = await this.getUserWallet(userId);
        
        let address;
        switch(network) {
            case 'bnb': address = wallet.bnbAddress; break;
            case 'polygon': address = wallet.polygonAddress; break;
            case 'solana': address = wallet.solanaAddress; break;
            case 'aptos': address = wallet.aptosAddress; break;
            default: return { success: false, message: 'شبكة غير مدعومة' };
        }
        
        const request = await DepositRequest.create({ userId, amount, currency, network, address });
        await this.addAuditLog(userId, 'request_deposit', { amount, currency, network }, '', '');
        await this.updateLastSeen(userId);
        
        return {
            success: true,
            requestId: request._id,
            address,
            message: `📤 *طلب إيداع ${currency}*\n\n🌐 *الشبكة:* ${network.toUpperCase()}\n💰 *المبلغ:* ${amount} ${currency}\n📤 *العنوان:*\n\`${address}\`\n\n⚠️ *أرسل فقط ${currency} على شبكة ${network.toUpperCase()}*\n📎 *بعد الإرسال:* /confirm_deposit ${request._id} [رابط المعاملة]`
        };
    }

    async confirmDeposit(requestId, transactionHash, adminId) {
        const request = await DepositRequest.findOne({ _id: requestId, status: 'pending' });
        if (!request) return { success: false, message: 'الطلب غير موجود' };
        
        await DepositRequest.updateOne({ _id: requestId }, { status: 'completed', transactionHash, completedAt: new Date(), verifiedBy: adminId, verifiedAt: new Date() });
        await Wallet.updateOne({ userId: request.userId }, { $inc: { usdBalance: request.amount } });
        await this.addAuditLog(adminId, 'confirm_deposit', { requestId, amount: request.amount }, '', '');
        
        return { success: true, message: `✅ تم إضافة ${request.amount} USD إلى رصيدك` };
    }

    async requestWithdraw(userId, amount, currency, network, address, twoFACode = null) {
        const wallet = await this.getUserWallet(userId);
        if (wallet.usdBalance < amount) {
            return { success: false, message: `❌ رصيد غير كافٍ! لديك ${wallet.usdBalance.toFixed(2)} USD` };
        }
        
        const user = await User.findOne({ userId });
        if (user.twoFAEnabled) {
            if (!twoFACode) {
                return { success: false, message: '🔐 يرجى إدخال رمز التحقق بخطوتين:\n/withdraw [المبلغ] [الشبكة] [العنوان] [الرمز]' };
            }
            const verified = await this.verify2FACode(userId, twoFACode);
            if (!verified) {
                await this.trackSuspiciousBehavior(userId, 'failed_2fa_withdraw', { amount, address });
                return { success: false, message: '❌ رمز التحقق غير صحيح' };
            }
        }
        
        const fee = amount * 0.02;
        
        if (amount > 1000) {
            const request = await WithdrawRequest.create({ userId, amount, currency, network, address, fee, status: 'pending' });
            await this.addAuditLog(userId, 'request_large_withdraw', { amount, address }, '', '');
            await this.updateLastSeen(userId);
            
            return {
                success: true,
                requestId: request._id,
                message: `✅ *تم استلام طلب السحب #${request._id.toString().slice(-6)}*\n\n💰 *المبلغ:* ${amount} ${currency}\n💸 *العمولة:* ${fee.toFixed(2)} USD\n📤 *العنوان:* \`${address}\`\n\n⏳ *سيتم مراجعة الطلب من قبل الإدارة خلال 24 ساعة*`
            };
        }
        
        const request = await WithdrawRequest.create({ userId, amount, currency, network, address, fee, twoFAVerified: user.twoFAEnabled });
        await this.addAuditLog(userId, 'request_withdraw', { amount, address }, '', '');
        await this.updateLastSeen(userId);
        
        return {
            success: true,
            requestId: request._id,
            message: `✅ *تم إنشاء طلب سحب #${request._id.toString().slice(-6)}*\n\n💰 *المبلغ:* ${amount} ${currency}\n💸 *العمولة:* ${fee.toFixed(2)} USD\n📤 *العنوان:* \`${address}\`\n\n⏳ *سيتم مراجعة الطلب من قبل الإدارة*`
        };
    }

    async confirmWithdraw(requestId, transactionHash, adminId) {
        const request = await WithdrawRequest.findOne({ _id: requestId, status: 'pending' });
        if (!request) return { success: false, message: 'الطلب غير موجود' };
        
        await WithdrawRequest.updateOne({ _id: requestId }, { status: 'completed', transactionHash, approvedAt: new Date(), approvedBy: adminId });
        await Wallet.updateOne({ userId: request.userId }, { $inc: { usdBalance: -(request.amount + request.fee) } });
        await this.addAuditLog(adminId, 'confirm_withdraw', { requestId, amount: request.amount }, '', '');
        
        return { success: true, message: `✅ تمت الموافقة على سحب ${request.amount} USD` };
    }

    // ========== إحصائيات ==========
    async getLeaderboard(limit = 15) {
        return await User.find({}).sort({ totalTraded: -1 }).limit(limit).select('userId username firstName totalTraded completedTrades rating isVerified isMerchant').lean();
    }

    async getTopMerchants(limit = 10) {
        return await User.find({ completedTrades: { $gt: 0 } })
            .sort({ completedTrades: -1, rating: -1 })
            .limit(limit)
            .select('userId firstName username completedTrades rating isVerified');
    }

    async getGlobalStats() {
        const stats = await User.aggregate([
            { $group: { _id: null, totalUsers: { $sum: 1 }, verifiedUsers: { $sum: { $cond: ['$isVerified', 1, 0] } }, totalTraded: { $sum: '$totalTraded' }, avgRating: { $avg: '$rating' } } }
        ]);
        const totalActiveOffers = await P2pOffer.countDocuments({ status: 'active' });
        const totalPendingTrades = await Trade.countDocuments({ status: { $in: ['pending', 'paid'] } });
        const pendingKyc = await KycRequest.countDocuments({ status: 'pending' });
        const totalReferralCommissions = await DailyStats.aggregate([
            { $group: { _id: null, total: { $sum: '$totalReferralCommissions' } } }
        ]);
        
        return {
            users: stats[0]?.totalUsers || 0,
            verifiedUsers: stats[0]?.verifiedUsers || 0,
            totalTraded: stats[0]?.totalTraded?.toFixed(2) || 0,
            avgRating: stats[0]?.avgRating?.toFixed(1) || 5.0,
            activeOffers: totalActiveOffers,
            pendingTrades: totalPendingTrades,
            pendingKyc: pendingKyc,
            totalReferralCommissions: totalReferralCommissions[0]?.total?.toFixed(2) || 0
        };
    }

    async getTodayStats() {
        const today = new Date().toISOString().split('T')[0];
        return await DailyStats.findOne({ date: today });
    }
    
    async updateDailyStats(type, value = 1) {
        const today = new Date().toISOString().split('T')[0];
        let s = await DailyStats.findOne({ date: today });
        if (!s) s = await DailyStats.create({ date: today });
        const u = {};
        if (type === 'totalUsers') u.totalUsers = (s.totalUsers || 0) + value;
        if (type === 'newUsers') u.newUsers = (s.newUsers || 0) + value;
        if (type === 'verifiedUsers') u.verifiedUsers = (s.verifiedUsers || 0) + value;
        if (type === 'totalTrades') u.totalTrades = (s.totalTrades || 0) + value;
        if (type === 'totalVolume') u.totalVolume = (s.totalVolume || 0) + value;
        if (type === 'totalCommission') u.totalCommission = (s.totalCommission || 0) + value;
        if (type === 'totalReferralCommissions') u.totalReferralCommissions = (s.totalReferralCommissions || 0) + value;
        if (type === 'activeOffers') u.activeOffers = (s.activeOffers || 0) + value;
        if (type === 'pendingKyc') u.pendingKyc = (s.pendingKyc || 0) + value;
        await DailyStats.updateOne({ date: today }, { $inc: u });
    }
    
    async getPendingWithdraws() { 
        return await WithdrawRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).lean(); 
    }
    
    async getPendingDeposits() { 
        return await DepositRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).lean(); 
    }
    
    async getDisputedTrades() { 
        return await Trade.find({ status: 'disputed' }).sort({ createdAt: -1 }).lean(); 
    }
    
    async searchUsers(query) {
        const regex = new RegExp(query, 'i');
        return await User.find({ 
            $or: [
                { username: regex }, 
                { firstName: regex }, 
                { lastName: regex }, 
                { phoneNumber: regex }, 
                { email: regex }, 
                { userId: !isNaN(query) ? parseInt(query) : -1 }
            ] 
        }).limit(20).select('userId username firstName lastName phoneNumber email rating isVerified isMerchant completedTrades isOnline lastSeen');
    }
    
    async setLanguage(userId, language) { 
        await User.updateOne({ userId }, { language }); 
        return true; 
    }
    
    async updateBankDetails(userId, bankName, accountNumber, accountName) { 
        await User.updateOne({ userId }, { bankName, bankAccountNumber: accountNumber, bankAccountName: accountName }); 
        await this.addAuditLog(userId, 'update_bank', { bankName }, '', '');
        await this.updateLastSeen(userId);
        return true; 
    }
    
    // ========== أمر تذكير البائع ==========
    async remindSeller(tradeId, buyerId) {
        const trade = await Trade.findOne({ _id: tradeId, buyerId, status: 'paid' });
        if (!trade) return { success: false, message: 'الصفقة غير موجودة أو لم يتم الدفع بعد' };
        
        await bot.telegram.sendMessage(trade.sellerId,
            `🔔 *تذكير من المشتري*\n\n` +
            `👤 المشتري يطلب منك تحرير العملة للصفقة #${tradeId}\n` +
            `💰 المبلغ: ${trade.amount} ${trade.currency}\n` +
            `⏱️ تم تأكيد الدفع منذ ${Math.floor((Date.now() - new Date(trade.paidAt).getTime()) / 60000)} دقيقة\n\n` +
            `🔓 /release_crystals ${tradeId}`,
            { parse_mode: 'Markdown' }
        );
        
        await this.addAuditLog(buyerId, 'remind_seller', { tradeId }, '', '');
        
        return { success: true, message: `✅ تم إرسال تذكير للبائع للصفقة #${tradeId}` };
    }
}

module.exports = new Database();
