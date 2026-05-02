const mongoose = require('mongoose');
const crypto = require('crypto');
const { ethers } = require('ethers');
const { Connection, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { AptosAccount } = require('aptos');
const CryptoJS = require('crypto-js');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { User, Wallet, KycRequest, P2pOffer, Trade, DepositRequest, WithdrawRequest, Review, DailyStats, AuditLog, Report, Blacklist, ChatMessage, Reminder } = require('./models');

class Database {
    constructor() {
        this.connected = false;
        this.encryptionKey = process.env.ENCRYPTION_KEY || 'default_key_32_bytes_long';
        
        // ✅ رسوم المنصة الثابتة
        this.platformWithdrawFee = 0.05;      // 0.05 دولار ثابت للسحب
        this.platformTradeFee = 0.05;         // 0.05 دولار ثابت لكل صفقة P2P
        this.referralCommissionRate = 10;     // 10% من رسوم المنصة
        
        this.release2FAThreshold = 100;
        this.release2FAForAll = true;
        
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
        
        // ✅ رسوم الشبكة (سيتم تحديثها كل ساعة)
        this.networkFees = {
            bnb: 0.10,      // BEP-20
            polygon: 0.05,  // Polygon
            solana: 0.01,   // Solana
            aptos: 0.02,    // Aptos
            trc20: 0.80,    // TRC-20 (Tron)
            erc20: 8.00     // ERC-20 (Ethereum)
        };
        
        this.lastNetworkFeeUpdate = null;
        
        // ربط النماذج للاستخدام المباشر
        this.User = User;
        this.Wallet = Wallet;
        this.P2pOffer = P2pOffer;
        this.Trade = Trade;
        this.ChatMessage = ChatMessage;
        this.Reminder = Reminder;
        
        // بدء تحديث رسوم الشبكة
        this.startNetworkFeeUpdater();
    }

    // ========== دوال رسوم الشبكة ==========
    
    async updateNetworkFees() {
        try {
            // 1. لشبكة BNB (BSC)
            try {
                const bscRes = await fetch('https://api.bscscan.com/api?module=gastracker&action=gasoracle&apikey=YourApiKey');
                const bscData = await bscRes.json();
                if (bscData.status === '1') {
                    const bscGasGwei = parseFloat(bscData.result.SafeGasPrice);
                    this.networkFees.bnb = (bscGasGwei * 0.0005).toFixed(4);
                }
            } catch(e) { console.log('BSC fee update failed:', e.message); }
            
            // 2. لشبكة Polygon
            try {
                const polygonRes = await fetch('https://api.polygonscan.com/api?module=gastracker&action=gasoracle&apikey=YourApiKey');
                const polygonData = await polygonRes.json();
                if (polygonData.status === '1') {
                    const polygonGasGwei = parseFloat(polygonData.result.SafeGasPrice);
                    this.networkFees.polygon = (polygonGasGwei * 0.0003).toFixed(4);
                }
            } catch(e) { console.log('Polygon fee update failed:', e.message); }
            
            // 3. لشبكة Ethereum
            try {
                const ethRes = await fetch('https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=YourApiKey');
                const ethData = await ethRes.json();
                if (ethData.status === '1') {
                    const ethGasGwei = parseFloat(ethData.result.SafeGasPrice);
                    this.networkFees.erc20 = ((ethGasGwei * 21000) / 1e9).toFixed(2);
                }
            } catch(e) { console.log('ETH fee update failed:', e.message); }
            
            this.lastNetworkFeeUpdate = new Date();
            console.log('✅ Network fees updated:', this.networkFees);
            
        } catch (error) {
            console.error('Failed to update network fees:', error);
        }
    }
    
    startNetworkFeeUpdater() {
        // تحديث فوري عند بدء التشغيل
        this.updateNetworkFees();
        // تحديث كل ساعة
        setInterval(async () => {
            await this.updateNetworkFees();
        }, 3600000);
    }
    
    getNetworkFee(network) {
        const fees = {
            'bnb': this.networkFees.bnb,
            'polygon': this.networkFees.polygon,
            'solana': this.networkFees.solana,
            'aptos': this.networkFees.aptos,
            'trc20': this.networkFees.trc20,
            'erc20': this.networkFees.erc20
        };
        return parseFloat(fees[network]) || 0.10;
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

    async addAuditLog(userId, action, details = {}, ip = '', userAgent = '') {
        try {
            await AuditLog.create({ userId, action, details, ip, userAgent, timestamp: new Date() });
        } catch (e) { console.error('Audit log error:', e); }
    }

    async updateLastSeen(userId) {
        await User.updateOne({ userId }, { lastSeen: new Date(), isOnline: true });
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
        if (isOnline) statusText = '🟢 متصل الآن';
        else if (timeSinceLastSeen < 60 * 60 * 1000) statusText = `🟡 آخر ظهور منذ ${Math.floor(timeSinceLastSeen / 60000)} دقيقة`;
        else if (timeSinceLastSeen < 24 * 60 * 60 * 1000) statusText = `🟠 آخر ظهور منذ ${Math.floor(timeSinceLastSeen / (60 * 60 * 1000))} ساعة`;
        else statusText = `⚫ آخر ظهور منذ ${Math.floor(timeSinceLastSeen / (24 * 60 * 60 * 1000))} يوم`;
        
        return { isOnline, lastSeen: user.lastSeen, statusText };
    }

    async isUserBannedOrLocked(userId) {
        const user = await User.findOne({ userId });
        if (!user) return { banned: false, locked: false };
        if (user.isBanned) return { banned: true, reason: user.banReason || 'تم حظر حسابك نهائياً' };
        if (user.isLocked) return { locked: true, reason: 'حسابك مقفل مؤقتاً' };
        if (user.banExpires && user.banExpires > new Date()) return { banned: true, reason: `محظور حتى ${user.banExpires.toLocaleString()}` };
        return { banned: false, locked: false };
    }

    async trackSuspiciousBehavior(userId, action, details, ip = '') {
        const user = await User.findOne({ userId });
        if (!user) return { warning: false };
        const suspiciousActions = user.suspiciousActions || [];
        suspiciousActions.push({ action, details, timestamp: new Date(), ip });
        while (suspiciousActions.length > 50) suspiciousActions.shift();
        const warningCount = (user.warningCount || 0) + 1;
        await User.updateOne({ userId }, { $set: { suspiciousActions, warningCount } });
        await this.addAuditLog(userId, `suspicious_${action}`, details, ip);
        if (warningCount >= 5) {
            await User.updateOne({ userId }, { isLocked: true, lockReason: 'نشاط مشبوه متكرر' });
            return { locked: true, message: '⛔ تم قفل حسابك بسبب نشاط مشبوه' };
        }
        return { warning: true, remaining: 5 - warningCount };
    }

    async trackSellerDelay(sellerId, tradeId, delayMinutes) {
        await User.updateOne({ userId: sellerId }, { $inc: { totalDelays: 1, totalDelayMinutes: delayMinutes } });
        const seller = await User.findOne({ userId: sellerId });
        if (seller.totalDelays >= 5) {
            const newRating = Math.max(1, (seller.rating || 5) - 0.5);
            await User.updateOne({ userId: sellerId }, { rating: newRating, isFlagged: true, flagReason: 'تأخير متكرر في التحرير' });
            return { flagged: true, newRating };
        }
        return { flagged: false };
    }

    async checkUserLimits(userId, tradeAmount) {
        const user = await User.findOne({ userId });
        if (!user) return { allowed: false, reason: 'المستخدم غير موجود' };
        const today = new Date().toISOString().split('T')[0];
        const dailyTrades = user.dailyTrades || [];
        const todayTrades = dailyTrades.filter(t => t.date === today);
        if ((user.completedTrades || 0) < 5) {
            if (tradeAmount > 500) return { allowed: false, reason: '⚠️ المستخدمون الجدد حدهم 500 دولار حتى 5 صفقات' };
            if (todayTrades.length >= 2) return { allowed: false, reason: '⚠️ حد أقصى صفقتين يومياً للمستخدمين الجدد' };
        }
        if (!user.isVerified && tradeAmount > 100) return { allowed: false, reason: '⚠️ الحسابات غير الموثقة حدها 100 دولار' };
        await User.updateOne({ userId }, { $push: { dailyTrades: { date: today, amount: tradeAmount, timestamp: new Date() } } });
        return { allowed: true };
    }

    checkIfNeeds2FA(seller, amount) {
        if (seller.require2FAForRelease === true) return true;
        const threshold = seller.release2FAThreshold || this.release2FAThreshold;
        if (amount >= threshold) return true;
        if ((seller.completedTrades || 0) < 10) return true;
        if (seller.isFlagged) return true;
        return false;
    }

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
            await User.updateOne({ userId }, { twoFASecret: encryptedSecret, twoFABackupCodes: backupCodes }).maxTimeMS(5000);
            const otpauthURL = speakeasy.otpauthURL({ secret: secret.ascii, label: `P2P Exchange (${userId})`, issuer: 'P2P Exchange' });
            const qrCode = await qrcode.toDataURL(otpauthURL);
            const decryptedBackupCodes = backupCodes.map(code => this.decryptPrivateKey(code));
            return { success: true, qrCode, backupCodes: decryptedBackupCodes, secret: secret.base32 };
        } catch (error) {
            console.error('2FA generate error:', error);
            return { success: false, message: 'خطأ في الخادم' };
        }
    }

    async enable2FA(userId, code) {
        try {
            const user = await User.findOne({ userId }).maxTimeMS(5000);
            if (!user) return { success: false, message: 'المستخدم غير موجود' };
            if (!user.twoFASecret) return { success: false, message: 'لم يتم إنشاء رمز 2FA' };
            const decryptedSecret = this.decryptPrivateKey(user.twoFASecret);
            const verified = speakeasy.totp.verify({ secret: decryptedSecret, encoding: 'base32', token: code, window: 2 });
            if (!verified) return { success: false, message: '❌ رمز التحقق غير صحيح' };
            await User.updateOne({ userId }, { twoFAEnabled: true }).maxTimeMS(5000);
            return { success: true, message: '✅ تم تفعيل التحقق بخطوتين' };
        } catch (error) {
            console.error('2FA enable error:', error);
            return { success: false, message: 'خطأ في الخادم' };
        }
    }

    async disable2FA(userId, code) {
        try {
            const user = await User.findOne({ userId }).maxTimeMS(5000);
            if (!user) return { success: false, message: 'المستخدم غير موجود' };
            if (user.twoFAEnabled && user.twoFASecret) {
                const decryptedSecret = this.decryptPrivateKey(user.twoFASecret);
                const verified = speakeasy.totp.verify({ secret: decryptedSecret, encoding: 'base32', token: code, window: 2 });
                if (!verified) return { success: false, message: '❌ رمز التحقق غير صحيح' };
            }
            await User.updateOne({ userId }, { twoFAEnabled: false, twoFASecret: '', twoFABackupCodes: [] }).maxTimeMS(5000);
            return { success: true, message: '✅ تم تعطيل التحقق بخطوتين' };
        } catch (error) {
            console.error('2FA disable error:', error);
            return { success: false, message: 'خطأ في الخادم' };
        }
    }

    async verify2FACode(userId, code) {
        const user = await User.findOne({ userId });
        if (!user || !user.twoFAEnabled) return false;
        const decryptedSecret = this.decryptPrivateKey(user.twoFASecret);
        const verified = speakeasy.totp.verify({ secret: decryptedSecret, encoding: 'base32', token: code, window: 2 });
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

    async registerUser(userId, username, firstName, lastName, phone, email, country, city, referrerId = null, language = 'ar', ip = '', userAgent = '') {
        await this.connect();
        
        let user = await User.findOne({ userId });
        if (!user) {
            const wallet = await this.getUserWallet(userId);
            
            let validReferrer = null;
            
            if (referrerId && referrerId !== userId) {
                validReferrer = await User.findOne({ userId: referrerId });
                if (validReferrer && !validReferrer.isBanned && !validReferrer.isLocked) {
                    await User.updateOne({ userId: referrerId }, { 
                        $inc: { referralCount: 1 },
                        $push: { referrals: { userId: userId, joinedAt: new Date(), totalCommission: 0, earned: 0 } }
                    });
                    await this.addAuditLog(referrerId, 'referral_new_user', { newUser: userId }, ip, userAgent);
                } else {
                    validReferrer = null;
                }
            }
            
            user = await User.create({
                userId, username: username || '', firstName: firstName || '', lastName: lastName || '',
                phoneNumber: phone || '', email: email || '', country: country || 'SD', city: city || '',
                language, walletId: wallet._id, referrerId: validReferrer ? referrerId : null,
                referralCount: 0, referralEarnings: 0, referralCommissionRate: this.referralCommissionRate, referrals: [],
                isVerified: false, lastSeen: new Date(), isOnline: true, lastLoginIp: ip, loginAttempts: 0,
                twoFAEnabled: false, twoFASecret: '', twoFABackupCodes: [], require2FAForRelease: true, release2FAThreshold: 100,
                dailyTrades: [], suspiciousActions: [], warningCount: 0, totalDelays: 0, totalDelayMinutes: 0, isFlagged: false, flagReason: ''
            });
            
            await this.updateDailyStats('totalUsers', 'newUsers');
            await this.addAuditLog(userId, 'register', { referrer: referrerId }, ip, userAgent);
            return { success: true, isNew: true, referrer: validReferrer };
        }
        
        await User.updateOne({ userId }, { lastSeen: new Date(), isOnline: true, lastLoginIp: ip });
        await this.addAuditLog(userId, 'login', {}, ip, userAgent);
        return { success: true, isNew: false };
    }

    async getUser(userId) { return await User.findOne({ userId }); }
    
    async getUserStats(userId) {
        const user = await this.getUser(userId);
        if (!user) return null;
        const wallet = await this.getUserWallet(userId);
        const activeOffers = await P2pOffer.countDocuments({ userId, status: 'active' });
        const pendingTrades = await Trade.countDocuments({ $or: [{ buyerId: userId }, { sellerId: userId }], status: { $in: ['pending', 'paid'] } });
        const completedTrades = user.completedTrades || 0;
        const failedTrades = user.failedTrades || 0;
        const successRate = completedTrades + failedTrades > 0 ? (completedTrades / (completedTrades + failedTrades)) * 100 : 100;
        const onlineStatus = await this.getUserOnlineStatus(userId);
        return {
            ...user.toObject(),
            usdBalance: wallet.usdBalance,
            walletAddresses: { bnb: wallet.bnbAddress, polygon: wallet.polygonAddress, solana: wallet.solanaAddress, aptos: wallet.aptosAddress },
            walletSignature: wallet.walletSignature,
            activeOffers, pendingTrades,
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

    async addReferralCommission(referrerId, userId, tradeAmount, platformFee) {
        const referrer = await User.findOne({ userId: referrerId });
        if (!referrer || referrer.isBanned) return 0;
        const commission = platformFee * (this.referralCommissionRate / 100);
        if (commission <= 0) return 0;
        await User.updateOne({ userId: referrerId }, { $inc: { referralEarnings: commission } });
        await User.updateOne({ userId: referrerId, 'referrals.userId': userId }, { $inc: { 'referrals.$.earned': commission, 'referrals.$.totalCommission': commission } });
        await this.addAuditLog(referrerId, 'referral_commission', { amount: commission, fromUser: userId, tradeAmount }, '', '');
        await this.updateDailyStats('totalReferralCommissions', commission);
        return commission;
    }
    
    async transferReferralEarningsToWallet(userId) {
        const user = await User.findOne({ userId });
        if (!user) return { success: false, message: 'المستخدم غير موجود' };
        const referralEarnings = user.referralEarnings || 0;
        if (referralEarnings <= 0) return { success: false, message: '⚠️ لا يوجد رصيد إحالات للتحويل' };
        await Wallet.updateOne({ userId }, { $inc: { usdBalance: referralEarnings } });
        await User.updateOne({ userId }, { $set: { referralEarnings: 0 } });
        await this.addAuditLog(userId, 'transfer_referral_earnings', { amount: referralEarnings }, '', '');
        return { success: true, amount: referralEarnings, message: `✅ تم تحويل ${referralEarnings.toFixed(2)} USD من رصيد الإحالات إلى محفظتك` };
    }
    
    async getReferralData(userId) {
        const user = await User.findOne({ userId });
        if (!user) return { referralCount: 0, referralEarnings: 0, referralCommissionRate: this.referralCommissionRate, referrals: [], referralLink: `https://t.me/YourBotUsername?start=${userId}` };
        const referralsWithDetails = [];
        for (const ref of (user.referrals || [])) {
            const referredUser = await User.findOne({ userId: ref.userId }).select('firstName username completedTrades');
            referralsWithDetails.push({
                userId: ref.userId, joinedAt: ref.joinedAt, totalCommission: ref.totalCommission || 0, earned: ref.earned || 0,
                name: referredUser ? (referredUser.firstName || referredUser.username || ref.userId) : ref.userId,
                trades: referredUser ? referredUser.completedTrades || 0 : 0
            });
        }
        return {
            referralCount: user.referralCount || 0,
            referralEarnings: user.referralEarnings || 0,
            referralCommissionRate: user.referralCommissionRate || this.referralCommissionRate,
            referrals: referralsWithDetails,
            referralLink: `https://t.me/YourBotUsername?start=${userId}`
        };
    }

    async createKycRequest(userId, fullName, passportNumber, nationalId, phoneNumber, email, country, city, passportPhotoFileId, personalPhotoFileId, bankName, bankAccountNumber, bankAccountName) {
        await this.connect();
        const existing = await KycRequest.findOne({ userId });
        if (existing && existing.status === 'pending') return { success: false, message: '⚠️ لديك طلب قيد المراجعة' };
        if (existing && existing.status === 'approved') return { success: false, message: '✅ حسابك موثق بالفعل' };
        const kycRequest = await KycRequest.create({
            userId, fullName, passportNumber, nationalId, phoneNumber, email, country, city,
            passportPhotoFileId, personalPhotoFileId, bankName, bankAccountNumber, bankAccountName, status: 'pending'
        });
        await this.updateDailyStats('pendingKyc', 1);
        await this.addAuditLog(userId, 'kyc_submit', { requestId: kycRequest._id }, '', '');
        return { success: true, requestId: kycRequest._id, request: kycRequest, message: `✅ تم إرسال طلب التوثيق! رقم الطلب: ${kycRequest._id.toString().slice(-6)}` };
    }

    async getPendingKycRequests() { return await KycRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).lean(); }

    async approveKyc(requestId, adminId) {
        const request = await KycRequest.findOne({ _id: requestId, status: 'pending' });
        if (!request) return { success: false, message: 'الطلب غير موجود' };
        await KycRequest.updateOne({ _id: requestId }, { status: 'approved', approvedBy: adminId, approvedAt: new Date() });
        await User.updateOne({ userId: request.userId }, {
            firstName: request.fullName.split(' ')[0], lastName: request.fullName.split(' ').slice(1).join(' '),
            phoneNumber: request.phoneNumber, email: request.email, country: request.country, city: request.city,
            bankName: request.bankName, bankAccountNumber: request.bankAccountNumber, bankAccountName: request.bankAccountName,
            isVerified: true
        });
        await this.updateDailyStats('verifiedUsers', 1);
        await this.updateDailyStats('pendingKyc', -1);
        await this.addAuditLog(adminId, 'kyc_approve', { userId: request.userId }, '', '');
        return { success: true, userId: request.userId, message: `✅ تم توثيق الحساب بنجاح!` };
    }

    async rejectKyc(requestId, adminId, reason) {
        const request = await KycRequest.findOne({ _id: requestId, status: 'pending' });
        if (!request) return { success: false, message: 'الطلب غير موجود' };
        await KycRequest.updateOne({ _id: requestId }, { status: 'rejected', rejectionReason: reason, approvedBy: adminId });
        await this.updateDailyStats('pendingKyc', -1);
        await this.addAuditLog(adminId, 'kyc_reject', { userId: request.userId, reason }, '', '');
        return { success: true, userId: request.userId, message: `❌ تم رفض طلب التوثيق!\nالسبب: ${reason}` };
    }

    async getKycStatus(userId) {
        const request = await KycRequest.findOne({ userId });
        if (!request) return { status: 'not_submitted' };
        return { status: request.status, requestId: request._id, rejectionReason: request.rejectionReason };
    }

    async getUserOffersHistory(userId, limit = 20) {
        return await P2pOffer.find({ userId }).sort({ createdAt: -1 }).limit(limit).select('type currency fiatAmount price status createdAt completedAt remainingAmount');
    }

    async getUserTradesHistory(userId, limit = 20) {
        const trades = await Trade.find({ $or: [{ buyerId: userId }, { sellerId: userId }] }).sort({ createdAt: -1 }).limit(limit).select('amount currency price status createdAt completedAt paidAt buyerId sellerId fee totalUsd isPartial');
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
        return (offers.reduce((sum, o) => sum + o.price, 0) / offers.length).toFixed(2);
    }

    async getMostActiveCurrency() {
        const result = await P2pOffer.aggregate([{ $match: { status: 'active' } }, { $group: { _id: '$currency', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 1 }]);
        return result[0]?._id || 'USD';
    }

    async getMarketStats() {
        const totalOffers = await P2pOffer.countDocuments({ status: 'active' });
        const avgPrice = await this.getAveragePrice();
        const mostActiveCurrency = await this.getMostActiveCurrency();
        const totalTraders = await User.countDocuments({ completedTrades: { $gt: 0 } });
        const totalVolume = await Trade.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: '$totalUsd' } } }]);
        return { totalOffers, avgPrice: parseFloat(avgPrice), mostActiveCurrency, totalTraders, totalVolume: totalVolume[0]?.total || 0 };
    }

    // ========== إنشاء عرض مع دعم البيع بالتجزئة ==========
    async createOffer(userId, type, currency, fiatAmount, price, paymentMethod, paymentDetails, bankName, bankAccountNumber, bankAccountName, minAmount, maxAmount) {
        const user = await this.getUser(userId);
        if (!user) return { success: false, message: 'المستخدم غير موجود' };
        const banCheck = await this.isUserBannedOrLocked(userId);
        if (banCheck.banned) return { success: false, message: banCheck.reason };
        if (banCheck.locked) return { success: false, message: banCheck.reason };
        if (!user.isVerified) return { success: false, message: '⚠️ حسابك غير موثق! يرجى توثيق حسابك أولاً' };
        const wallet = await this.getUserWallet(userId);
        const usdValue = fiatAmount / price;
        if (type === 'sell' && wallet.usdBalance < usdValue) return { success: false, message: `❌ رصيد غير كافٍ! لديك ${wallet.usdBalance.toFixed(2)} USD` };
        
        // إنشاء العرض مع remainingAmount
        const offer = await P2pOffer.create({ 
            userId, type, currency, 
            fiatAmount, 
            remainingAmount: fiatAmount,  // الكمية المتبقية للبيع بالتجزئة
            price, paymentMethod, paymentDetails, 
            bankName, bankAccountNumber, bankAccountName, 
            minAmount: minAmount || 10, 
            maxAmount: maxAmount || 100000 
        });
        
        await this.updateDailyStats('activeOffers', 1);
        await this.addAuditLog(userId, 'create_offer', { offerId: offer._id, type, currency, amount: fiatAmount }, '', '');
        await this.updateLastSeen(userId);
        return { success: true, offerId: offer._id, message: `✅ تم إنشاء عرض ${type === 'sell' ? 'بيع' : 'شراء'}!` };
    }

    // ========== جلب العروض مع remainingAmount ==========
    async getOffers(type = null, currency = null, sortBy = 'price', order = 'asc', limit = 50, offset = 0) {
        const query = { status: 'active' };
        if (type) query.type = type;
        if (currency && currency !== '') query.currency = currency;
        // للبيع: نعرض فقط العروض التي لديها كمية متبقية > 0
        if (type === 'sell') {
            query.remainingAmount = { $gt: 0 };
        }
        const sort = {};
        sort[sortBy] = order === 'asc' ? 1 : -1;
        const offers = await P2pOffer.find(query).sort(sort).skip(offset).limit(limit).lean();
        const total = await P2pOffer.countDocuments(query);
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
        const results = offers.map(offer => {
            const user = userMap[offer.userId];
            let trustBadge = '';
            if (user?.completedTrades > 50 && user?.rating > 4.5) trustBadge = '🏅 ممتاز';
            else if (user?.completedTrades > 10 && user?.rating > 4) trustBadge = '✅ موثوق';
            else if (user?.completedTrades < 5) trustBadge = '🆕 جديد';
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
                isOnline: user?.isOnline || false, 
                onlineStatus: user?.onlineStatus || 'غير معروف',
                trustBadge, 
                badges: badges.join(' '), 
                minAmount: offer.minAmount || 10, 
                maxAmount: offer.maxAmount || 100000,
                remainingAmount: offer.remainingAmount || offer.fiatAmount
            };
        });
        return { offers: results, total };
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
        return { success: true, message: '✅ تم إلغاء العرض' };
    }

    // ========== بدء صفقة مع دعم البيع بالتجزئة (Partial Fill) ==========
    async startTrade(offerId, buyerId, requestedAmount = null) {
        const offer = await P2pOffer.findOne({ _id: offerId, status: 'active' });
        if (!offer) return { success: false, message: 'العرض غير موجود' };
        if (offer.userId === buyerId) return { success: false, message: 'لا يمكنك شراء عرضك الخاص' };
        
        // تحديد المبلغ المطلوب شراؤه
        let buyAmount = requestedAmount || offer.fiatAmount;
        
        // التحقق من الحدود
        if (buyAmount < offer.minAmount) {
            return { success: false, message: `⚠️ الحد الأدنى للشراء هو ${offer.minAmount} ${offer.currency}` };
        }
        if (buyAmount > offer.maxAmount) {
            return { success: false, message: `⚠️ الحد الأقصى للشراء هو ${offer.maxAmount} ${offer.currency}` };
        }
        if (buyAmount > offer.remainingAmount) {
            return { success: false, message: `⚠️ الكمية المتبقية هي ${offer.remainingAmount} ${offer.currency} فقط` };
        }
        
        const buyerBanCheck = await this.isUserBannedOrLocked(buyerId);
        if (buyerBanCheck.banned) return { success: false, message: buyerBanCheck.reason };
        const sellerBanCheck = await this.isUserBannedOrLocked(offer.userId);
        if (sellerBanCheck.banned) return { success: false, message: 'البائع محظور' };
        
        const buyer = await this.getUser(buyerId);
        if (!buyer.isVerified) return { success: false, message: '⚠️ حسابك غير موثق!' };
        const seller = await this.getUser(offer.userId);
        if (!seller.isVerified) return { success: false, message: '⚠️ البائع غير موثق!' };
        
        const totalUsd = buyAmount / offer.price;
        const limitCheck = await this.checkUserLimits(buyerId, totalUsd);
        if (!limitCheck.allowed) return { success: false, message: limitCheck.reason };
        
        // رسوم المنصة ثابتة 0.05 دولار
        const fee = this.platformTradeFee;
        
        if (offer.type === 'sell') {
            const sellerWallet = await this.getUserWallet(offer.userId);
            // التحقق من رصيد البائع للكمية المطلوبة فقط
            if (sellerWallet.usdBalance < totalUsd) {
                await P2pOffer.updateOne({ _id: offerId }, { status: 'cancelled' });
                return { success: false, message: 'البائع ليس لديه رصيد كافٍ' };
            }
        }
        
        // حساب المبلغ الجديد المتبقي
        const newRemainingAmount = offer.remainingAmount - buyAmount;
        const isPartial = newRemainingAmount > 0;
        
        // إنشاء الصفقة
        const trade = await Trade.create({
            offerId, buyerId, sellerId: offer.userId, currency: offer.currency,
            amount: buyAmount,  // المبلغ المطلوب فقط
            price: offer.price,
            totalUsd, fee,
            paymentMethod: offer.paymentMethod,
            buyerBankDetails: `${buyer.bankName || ''} - ${buyer.bankAccountNumber || ''} - ${buyer.bankAccountName || ''}`,
            sellerBankDetails: `${offer.bankName || ''} - ${offer.bankAccountNumber || ''} - ${offer.bankAccountName || ''}`,
            status: 'pending',
            isPartial: isPartial
        });
        
        // تحديث الكمية المتبقية من العرض
        if (newRemainingAmount > 0) {
            // العرض لا يزال موجوداً مع الكمية المتبقية
            await P2pOffer.updateOne({ _id: offerId }, { 
                remainingAmount: newRemainingAmount,
                status: 'active'  // يبقى نشطاً
            });
        } else {
            // العرض اكتمل بالكامل
            await P2pOffer.updateOne({ _id: offerId }, { 
                remainingAmount: 0,
                status: 'completed' 
            });
            await this.updateDailyStats('activeOffers', -1);
        }
        
        await this.addAuditLog(buyerId, 'start_trade', { 
            tradeId: trade._id, offerId, 
            amount: buyAmount, 
            remainingAmount: newRemainingAmount 
        });
        await this.updateLastSeen(buyerId);
        
        // إرسال رسالة نظام في الدردشة عند بدء الصفقة
        await this.sendSystemMessage(trade._id, buyerId, offer.userId, 
            `🔄 تم بدء الصفقة!\n💰 المبلغ: ${buyAmount} ${offer.currency} (${totalUsd.toFixed(2)} USD)\n💸 رسوم المنصة: ${fee} $\n📦 المتبقي من العرض: ${newRemainingAmount} ${offer.currency}`
        );
        
        // تفعيل التذكير للصفقة
        await this.activateTradeReminder(trade._id);
        
        return {
            success: true, 
            tradeId: trade._id,
            sellerPaymentDetails: offer.type === 'sell' ? offer.paymentDetails : '',
            totalUsd, fee,
            remainingAmount: newRemainingAmount,
            isPartial: isPartial,
            message: `🔄 تم بدء الصفقة!\n💰 المبلغ: ${buyAmount} ${offer.currency}\n💵 القيمة: ${totalUsd.toFixed(2)} USD\n💸 رسوم المنصة: ${fee} $\n📦 المتبقي من العرض: ${newRemainingAmount} ${offer.currency}`
        };
    }

    async confirmPayment(tradeId, buyerId, proofImage) {
        const trade = await Trade.findOne({ _id: tradeId, buyerId, status: 'pending' });
        if (!trade) return { success: false, message: 'الصفقة غير موجودة' };
        const timeToSend = Date.now() - new Date(trade.createdAt).getTime();
        if (timeToSend < 30000) {
            await this.trackSuspiciousBehavior(buyerId, 'fast_proof', { timeToSend, tradeId });
            return { success: false, message: '⚠️ إثبات سريع جداً - انتظر دقيقة' };
        }
        await Trade.updateOne({ _id: tradeId }, { paymentProof: proofImage, status: 'paid', paidAt: new Date() });
        await this.addAuditLog(buyerId, 'confirm_payment', { tradeId, proofImage }, '', '');
        await this.updateLastSeen(buyerId);
        
        // إرسال رسالة نظام في الدردشة عند تأكيد الدفع
        await this.sendSystemMessage(tradeId, buyerId, trade.sellerId, `✅ تم تأكيد الدفع! رابط الإثبات: ${proofImage}`);
        
        // بدء جدولة التذكير
        this.scheduleReleaseReminder(tradeId);
        
        return { success: true, sellerId: trade.sellerId, message: `✅ تم استلام إثبات الدفع!` };
    }

    async scheduleReleaseReminder(tradeId) {
        // جدولة التذكير بعد 15 دقيقة
        setTimeout(async () => {
            await this.sendReminderMessage(tradeId);
        }, 15 * 60 * 1000);
        
        // جدولة التذكير الثاني بعد 30 دقيقة
        setTimeout(async () => {
            await this.sendSecondReminderMessage(tradeId);
        }, 30 * 60 * 1000);
        
        // تحرير تلقائي بعد 24 ساعة
        setTimeout(async () => {
            await this.autoReleaseAfterDelay(tradeId);
        }, 24 * 60 * 60 * 1000);
    }
    
    async sendReminderMessage(tradeId) {
        const trade = await Trade.findById(tradeId);
        if (!trade || trade.status !== 'paid') return;
        
        // تحديث عداد التذكير
        await this.updateReminderCount(tradeId);
        
        // إرسال رسالة تذكير في الدردشة
        await this.sendSystemMessage(tradeId, trade.sellerId, trade.buyerId, 
            `⏰ *تذكير!* مضى 15 دقيقة على تأكيد الدفع.\n🔓 يرجى تحرير العملة باستخدام الأمر:\n/release_crystals ${tradeId}`);
        
        // إرسال إشعار للبائع عبر البوت
        const bot = require('./server').bot;
        if (bot) {
            await bot.telegram.sendMessage(trade.sellerId,
                `⏰ *تذكير الصفقة #${tradeId}*\n\n` +
                `💰 المبلغ: ${trade.amount} ${trade.currency}\n` +
                `⏱️ مضى 15 دقيقة على تأكيد الدفع\n\n` +
                `🔓 /release_crystals ${tradeId}`,
                { parse_mode: 'Markdown' }
            );
        }
    }
    
    async sendSecondReminderMessage(tradeId) {
        const trade = await Trade.findById(tradeId);
        if (!trade || trade.status !== 'paid') return;
        
        await this.sendSystemMessage(tradeId, trade.sellerId, trade.buyerId,
            `⚠️ *تذكير مهم!* مضى 30 دقيقة على تأكيد الدفع.\n🔓 الرجاء تحرير العملة فوراً:\n/release_crystals ${tradeId}`);
        
        const bot = require('./server').bot;
        if (bot) {
            await bot.telegram.sendMessage(trade.sellerId,
                `⚠️ *تذكير مهم - الصفقة #${tradeId}*\n\n` +
                `💰 المبلغ: ${trade.amount} ${trade.currency}\n` +
                `⏱️ مضى 30 دقيقة على تأكيد الدفع\n\n` +
                `🔓 /release_crystals ${tradeId}\n\n` +
                `⚠️ إذا لم تتحرر العملة قريباً، سيتم إشعار الإدارة.`,
                { parse_mode: 'Markdown' }
            );
        }
    }
    
    async updateReminderCount(tradeId) {
        let reminder = await Reminder.findOne({ tradeId });
        if (!reminder) {
            reminder = await Reminder.create({ tradeId, reminderCount: 1, lastReminderAt: new Date() });
        } else {
            reminder.reminderCount += 1;
            reminder.lastReminderAt = new Date();
            await reminder.save();
        }
    }
    
    async activateTradeReminder(tradeId) {
        await Reminder.findOneAndUpdate(
            { tradeId },
            { isActive: true, reminderCount: 0, lastReminderAt: null },
            { upsert: true }
        );
    }

    async autoReleaseAfterDelay(tradeId) {
        const trade = await Trade.findById(tradeId);
        if (trade && trade.status === 'paid') {
            const timeSincePaid = Date.now() - new Date(trade.paidAt).getTime();
            if (timeSincePaid >= 24 * 60 * 60 * 1000) {
                await this.trackSellerDelay(trade.sellerId, tradeId, 24 * 60);
                await this.releaseCrystals(tradeId, trade.sellerId);
                
                await this.sendSystemMessage(tradeId, trade.sellerId, trade.buyerId,
                    `🤖 *تم تحرير العملة تلقائياً* بعد انقضاء 24 ساعة.`);
            }
        }
    }

    // ========== تحرير العملة مع دعم البيع بالتجزئة ==========
    async releaseCrystals(tradeId, sellerId, twoFACode = null, ip = '', userAgent = '') {
        const trade = await Trade.findOne({ _id: tradeId, sellerId, status: 'paid' });
        if (!trade) return { success: false, message: 'الصفقة غير موجودة' };
        
        const seller = await User.findOne({ userId: sellerId });
        const buyer = await User.findOne({ userId: trade.buyerId });
        await this.updateLastSeen(sellerId);
        
        const needs2FA = this.checkIfNeeds2FA(seller, trade.totalUsd);
        if (needs2FA && seller.twoFAEnabled) {
            if (!twoFACode) return { success: false, message: `🔐 مطلوب رمز 2FA لتحرير ${trade.totalUsd.toFixed(2)} USD` };
            const verified = await this.verify2FACode(sellerId, twoFACode);
            if (!verified) return { success: false, message: '❌ رمز التحقق غير صحيح' };
        }
        
        const timeSincePaid = Date.now() - new Date(trade.paidAt).getTime();
        let requiredDelay = 0;
        if (trade.totalUsd > 5000) requiredDelay = 60 * 60 * 1000;
        else if (trade.totalUsd > 1000) requiredDelay = 30 * 60 * 1000;
        else if (seller.completedTrades < 10) requiredDelay = 15 * 60 * 1000;
        
        if (requiredDelay > 0 && timeSincePaid < requiredDelay) {
            const remainingMinutes = Math.ceil((requiredDelay - timeSincePaid) / 60000);
            return { success: false, message: `⚠️ مهلة أمان: سيتم التحرير خلال ${remainingMinutes} دقيقة` };
        }
        
        const sellerWallet = await this.getUserWallet(sellerId);
        if (trade.offerId) {
            const offer = await P2pOffer.findById(trade.offerId);
            if (offer && offer.type === 'sell') {
                // خصم المبلغ الفعلي فقط من رصيد البائع (وليس العرض كاملاً)
                if (sellerWallet.usdBalance < trade.totalUsd) {
                    await Trade.updateOne({ _id: tradeId }, { status: 'disputed' });
                    return { success: false, message: '⚠️ رصيد البائع غير كافٍ! تم فتح نزاع' };
                }
                await Wallet.updateOne({ userId: sellerId }, { $inc: { usdBalance: -trade.totalUsd } });
                await Wallet.updateOne({ userId: trade.buyerId }, { $inc: { usdBalance: trade.totalUsd - trade.fee } });
            }
        }
        
        await Wallet.updateOne({ userId: 0 }, { $inc: { usdBalance: trade.fee } });
        if (buyer && buyer.referrerId) await this.addReferralCommission(buyer.referrerId, trade.buyerId, trade.totalUsd, trade.fee);
        
        await Trade.updateOne({ _id: tradeId }, { status: 'completed', releasedAt: new Date(), completedAt: new Date() });
        
        // تحديث العرض إذا كان موجوداً ولم يكتمل
        if (trade.offerId) {
            const offer = await P2pOffer.findById(trade.offerId);
            if (offer && offer.remainingAmount > 0) {
                // العرض لا يزال نشطاً مع الكمية المتبقية
                await P2pOffer.updateOne({ _id: trade.offerId }, { status: 'active' });
            }
        }
        
        await User.updateOne({ userId: sellerId }, { $inc: { completedTrades: 1, totalTraded: trade.totalUsd } });
        await User.updateOne({ userId: trade.buyerId }, { $inc: { completedTrades: 1, totalTraded: trade.totalUsd } });
        await this.updateDailyStats('totalTrades', 1);
        await this.updateDailyStats('totalVolume', trade.totalUsd);
        await this.updateDailyStats('totalCommission', trade.fee);
        await this.addAuditLog(sellerId, 'release_crystals', { tradeId, amount: trade.totalUsd }, ip, userAgent);
        
        // إرسال رسالة نظام في الدردشة عند تحرير العملة
        await this.sendSystemMessage(tradeId, sellerId, trade.buyerId, `✅ *تم تحرير العملة بنجاح!* المبلغ: ${trade.amount} ${trade.currency}`);
        
        // إلغاء التذكير
        await Reminder.updateOne({ tradeId }, { isActive: false });
        
        return { success: true, buyerId: trade.buyerId, message: `✅ تم تحرير ${trade.amount} ${trade.currency} بنجاح!` };
    }

    async cancelPendingTrade(tradeId, userId) {
        const trade = await Trade.findOne({ _id: tradeId, $or: [{ buyerId: userId }, { sellerId: userId }], status: 'pending' });
        if (!trade) return { success: false, message: 'لا يمكن إلغاء هذه الصفقة' };
        
        // استعادة الكمية المحجوزة من العرض إذا كان عرض بيع
        if (trade.offerId) {
            const offer = await P2pOffer.findById(trade.offerId);
            if (offer && offer.status === 'active') {
                // إعادة الكمية المحجوزة
                const newRemaining = offer.remainingAmount + trade.amount;
                await P2pOffer.updateOne({ _id: trade.offerId }, { 
                    remainingAmount: newRemaining,
                    status: 'active'
                });
            } else if (offer && offer.status === 'pending') {
                await P2pOffer.updateOne({ _id: trade.offerId }, { 
                    status: 'active',
                    counterpartyId: null
                });
            }
        }
        
        await Trade.updateOne({ _id: tradeId }, { status: 'cancelled' });
        await User.updateOne({ userId: trade.buyerId }, { $inc: { failedTrades: 1 } });
        await User.updateOne({ userId: trade.sellerId }, { $inc: { failedTrades: 1 } });
        await this.addAuditLog(userId, 'cancel_trade', { tradeId }, '', '');
        
        // إرسال رسالة نظام في الدردشة عند إلغاء الصفقة
        await this.sendSystemMessage(tradeId, userId, trade.buyerId === userId ? trade.sellerId : trade.buyerId, `❌ تم إلغاء الصفقة.`);
        
        await Reminder.updateOne({ tradeId }, { isActive: false });
        return { success: true, message: `✅ تم إلغاء الصفقة` };
    }

    async openDispute(tradeId, userId, reason) {
        const trade = await Trade.findOne({ _id: tradeId, $or: [{ buyerId: userId }, { sellerId: userId }], status: { $in: ['pending', 'paid'] } });
        if (!trade) return { success: false, message: 'الصفقة غير موجودة' };
        await Trade.updateOne({ _id: tradeId }, { status: 'disputed', disputeReason: reason, disputeOpenedBy: userId });
        await this.addAuditLog(userId, 'open_dispute', { tradeId, reason }, '', '');
        
        // إرسال رسالة نظام في الدردشة عند فتح نزاع
        await this.sendSystemMessage(tradeId, userId, trade.buyerId === userId ? trade.sellerId : trade.buyerId, `⚠️ تم فتح نزاع!\nالسبب: ${reason}`);
        
        return { success: true, message: `⚠️ تم فتح نزاع! سيتم مراجعته خلال 24 ساعة` };
    }

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
        return { success: true, message: `⭐ تم التقييم! ${rating}/5` };
    }

    // ========== دوال الدردشة ==========
    
    async sendMessage(tradeId, senderId, receiverId, message, imageFileId = null) {
        const chatMessage = await ChatMessage.create({
            tradeId, senderId, receiverId, message,
            messageType: imageFileId ? 'image' : 'text',
            imageFileId: imageFileId || '',
            isRead: false,
            createdAt: new Date()
        });
        return chatMessage;
    }
    
    async sendSystemMessage(tradeId, senderId, receiverId, message) {
        const chatMessage = await ChatMessage.create({
            tradeId, senderId, receiverId, message,
            messageType: 'system',
            isRead: false,
            createdAt: new Date()
        });
        return chatMessage;
    }
    
    async getChatMessages(tradeId, userId, limit = 50, before = null) {
        const query = { tradeId };
        if (before) query.createdAt = { $lt: new Date(before) };
        
        const messages = await ChatMessage.find(query)
            .sort({ createdAt: -1 })
            .limit(limit)
            .sort({ createdAt: 1 });
        
        // تحديث حالة القراءة للرسائل المرسلة للمستخدم
        await ChatMessage.updateMany(
            { tradeId, receiverId: userId, isRead: false },
            { $set: { isRead: true, readAt: new Date() } }
        );
        
        return messages;
    }
    
    async getUnreadCount(userId) {
        return await ChatMessage.countDocuments({ receiverId: userId, isRead: false, messageType: { $ne: 'system' } });
    }
    
    async getTradeChatPartner(tradeId, userId) {
        const trade = await Trade.findById(tradeId);
        if (!trade) return null;
        return trade.buyerId === userId ? trade.sellerId : trade.buyerId;
    }
    
    async markMessagesAsRead(tradeId, userId) {
        await ChatMessage.updateMany(
            { tradeId, receiverId: userId, isRead: false },
            { $set: { isRead: true, readAt: new Date() } }
        );
    }

    // ========== الإيداع ==========
    async requestDeposit(userId, amount, currency, network) {
        if (amount < 1) {
            return { success: false, message: '⚠️ الحد الأدنى للإيداع هو 1 دولار' };
        }
        
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

    // ========== السحب مع رسوم الشبكة ==========
    async requestWithdraw(userId, amount, currency, network, address, twoFACode = null) {
        const wallet = await this.getUserWallet(userId);
        if (wallet.usdBalance < amount) {
            return { success: false, message: `❌ رصيد غير كافٍ! لديك ${wallet.usdBalance.toFixed(2)} USD` };
        }
        
        if (amount < 5) {
            return { success: false, message: '⚠️ الحد الأدنى للسحب هو 5 دولار' };
        }
        
        const user = await User.findOne({ userId });
        if (user.twoFAEnabled) {
            if (!twoFACode) {
                return { success: false, message: '🔐 يرجى إدخال رمز التحقق بخطوتين' };
            }
            const verified = await this.verify2FACode(userId, twoFACode);
            if (!verified) {
                await this.trackSuspiciousBehavior(userId, 'failed_2fa_withdraw', { amount, address });
                return { success: false, message: '❌ رمز التحقق غير صحيح' };
            }
        }
        
        const platformFee = this.platformWithdrawFee;
        const networkFee = this.getNetworkFee(network);
        const totalFees = platformFee + networkFee;
        const totalDeduct = amount + totalFees;
        
        if (wallet.usdBalance < totalDeduct) {
            return { success: false, message: `❌ رصيد غير كافٍ للرسوم! تحتاج ${totalDeduct.toFixed(2)} USD (المبلغ ${amount} + رسوم ${totalFees.toFixed(2)})` };
        }
        
        if (amount > 1000) {
            const request = await WithdrawRequest.create({ 
                userId, amount, currency, network, address, 
                fee: platformFee, networkFee: networkFee, 
                status: 'pending' 
            });
            await this.addAuditLog(userId, 'request_large_withdraw', { amount, address, networkFee, platformFee }, '', '');
            await this.updateLastSeen(userId);
            
            return {
                success: true,
                requestId: request._id,
                message: `✅ *تم استلام طلب السحب #${request._id.toString().slice(-6)}*\n\n` +
                         `💰 *المبلغ:* ${amount} USD\n` +
                         `🏢 *رسوم المنصة:* ${platformFee} $\n` +
                         `🌐 *رسوم الشبكة (${network.toUpperCase()}):* ${networkFee} $\n` +
                         `📊 *إجمالي الرسوم:* ${totalFees.toFixed(2)} $\n` +
                         `💎 *الإجمالي المخصوم:* ${totalDeduct.toFixed(2)} $\n` +
                         `📤 *العنوان:* \`${address}\`\n\n` +
                         `⏳ *سيتم مراجعة الطلب من قبل الإدارة خلال 24 ساعة*`
            };
        }
        
        const request = await WithdrawRequest.create({ 
            userId, amount, currency, network, address, 
            fee: platformFee, networkFee: networkFee, 
            twoFAVerified: user.twoFAEnabled,
            status: 'completed' 
        });
        
        await Wallet.updateOne({ userId }, { $inc: { usdBalance: -totalDeduct } });
        await this.addAuditLog(userId, 'request_withdraw', { amount, address, networkFee, platformFee }, '', '');
        await this.updateLastSeen(userId);
        
        return {
            success: true,
            requestId: request._id,
            message: `✅ *تم سحب ${amount} USD بنجاح!*\n\n` +
                     `💰 *المبلغ:* ${amount} USD\n` +
                     `🏢 *رسوم المنصة:* ${platformFee} $\n` +
                     `🌐 *رسوم الشبكة (${network.toUpperCase()}):* ${networkFee} $\n` +
                     `📊 *إجمالي الرسوم:* ${totalFees.toFixed(2)} $\n` +
                     `💎 *الإجمالي المخصوم:* ${totalDeduct.toFixed(2)} $\n` +
                     `📤 *العنوان:* \`${address}\`\n\n` +
                     `📋 *رقم الطلب:* #${request._id.toString().slice(-6)}`
        };
    }

    async confirmWithdraw(requestId, transactionHash, adminId) {
        const request = await WithdrawRequest.findOne({ _id: requestId, status: 'pending' });
        if (!request) return { success: false, message: 'الطلب غير موجود' };
        
        await WithdrawRequest.updateOne({ _id: requestId }, { 
            status: 'completed', 
            transactionHash, 
            approvedAt: new Date(), 
            approvedBy: adminId 
        });
        
        const totalFees = request.fee + (request.networkFee || 0);
        const totalDeduct = request.amount + totalFees;
        await Wallet.updateOne({ userId: request.userId }, { $inc: { usdBalance: -totalDeduct } });
        
        await this.addAuditLog(adminId, 'confirm_withdraw', { requestId, amount: request.amount }, '', '');
        
        return { success: true, message: `✅ تمت الموافقة على سحب ${request.amount} USD` };
    }

    // ========== الإحصائيات ==========
    async getLeaderboard(limit = 15) {
        return await User.find({}).sort({ totalTraded: -1 }).limit(limit).select('userId username firstName totalTraded completedTrades rating isVerified isMerchant').lean();
    }

    async getTopMerchants(limit = 10) {
        return await User.find({ completedTrades: { $gt: 0 } }).sort({ completedTrades: -1, rating: -1 }).limit(limit).select('userId firstName username completedTrades rating isVerified');
    }

    async getGlobalStats() {
        const stats = await User.aggregate([{ $group: { _id: null, totalUsers: { $sum: 1 }, verifiedUsers: { $sum: { $cond: ['$isVerified', 1, 0] } }, totalTraded: { $sum: '$totalTraded' }, avgRating: { $avg: '$rating' } } }]);
        const totalActiveOffers = await P2pOffer.countDocuments({ status: 'active' });
        const totalPendingTrades = await Trade.countDocuments({ status: { $in: ['pending', 'paid'] } });
        const pendingKyc = await KycRequest.countDocuments({ status: 'pending' });
        const totalReferralCommissions = await DailyStats.aggregate([{ $group: { _id: null, total: { $sum: '$totalReferralCommissions' } } }]);
        return {
            users: stats[0]?.totalUsers || 0, verifiedUsers: stats[0]?.verifiedUsers || 0,
            totalTraded: stats[0]?.totalTraded?.toFixed(2) || 0, avgRating: stats[0]?.avgRating?.toFixed(1) || 5.0,
            activeOffers: totalActiveOffers, pendingTrades: totalPendingTrades, pendingKyc: pendingKyc,
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
    
    async getPendingWithdraws() { return await WithdrawRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).lean(); }
    async getPendingDeposits() { return await DepositRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).lean(); }
    async getDisputedTrades() { return await Trade.find({ status: 'disputed' }).sort({ createdAt: -1 }).lean(); }
    
    async searchUsers(query) {
        const regex = new RegExp(query, 'i');
        return await User.find({ $or: [{ username: regex }, { firstName: regex }, { lastName: regex }, { phoneNumber: regex }, { email: regex }, { userId: !isNaN(query) ? parseInt(query) : -1 }] }).limit(20).select('userId username firstName lastName phoneNumber email rating isVerified isMerchant completedTrades isOnline lastSeen');
    }
    
    async setLanguage(userId, language) { await User.updateOne({ userId }, { language }); return true; }
    
    async updateBankDetails(userId, bankName, accountNumber, accountName) {
        await User.updateOne({ userId }, { bankName, bankAccountNumber: accountNumber, bankAccountName: accountName });
        await this.addAuditLog(userId, 'update_bank', { bankName }, '', '');
        await this.updateLastSeen(userId);
        return true;
    }
    
    async remindSeller(tradeId, buyerId) {
        const trade = await Trade.findOne({ _id: tradeId, buyerId, status: 'paid' });
        if (!trade) return { success: false, message: 'الصفقة غير موجودة' };
        return { success: true, trade, message: `✅ تم إرسال تذكير للبائع للصفقة #${tradeId}` };
    }
}

module.exports = new Database();
