const mongoose = require('mongoose');
const crypto = require('crypto');
const { ethers } = require('ethers');
const { Connection, Keypair } = require('@solana/web3.js');
const { AptosAccount } = require('aptos');
const CryptoJS = require('crypto-js');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { User, Wallet, KycRequest, Order, Trade, Candlestick, MarketPrice, DepositRequest, WithdrawRequest, AuditLog, DailyStats, ChatMessage } = require('./models');

const ADMIN_IDS = (process.env.ADMIN_IDS || '6701743450,8181305474').split(',').map(Number);

class Database {
    constructor() {
        this.connected = false;
        this.encryptionKey = process.env.ENCRYPTION_KEY || 'default_key_32_bytes_long_change_me';
        
        this.totalCrystalSupply = 5000000;
        this.openingPrice = 500;
        this.tradingFee = 0.001;
        this.platformWithdrawFee = 0.05;
        this.referralCommissionRate = 10;
        this.referralDepositReward = 1000; // ✅ مكافأة الإيداع للإحالة
        
        this.networkFees = {
            bnb: 0.15, polygon: 0.10, solana: 0.02, aptos: 0.05, trc20: 3.00, erc20: 15.00
        };
        
        this.matchTimeout = 15000;
        this.depositExpiryHours = 24;
        this.fakePriceInterval = null;
        this.lastFakePrice = 0.002;
    }

    // ====================================================================
    // وظائف مساعدة
    // ====================================================================
    
    getNetworkFee(network) {
        return this.networkFees[network] || 0.10;
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

    // ====================================================================
    // الاتصال بقاعدة البيانات
    // ====================================================================
    
    async connect() {
        if (this.connected) return;
        try {
            await mongoose.connect(process.env.MONGODB_URI, {
                dbName: process.env.MONGODB_DB_NAME || 'crystal_exchange',
                serverSelectionTimeoutMS: 30000,
                socketTimeoutMS: 45000,
                connectTimeoutMS: 30000,
                family: 4,
                maxPoolSize: 10,
                minPoolSize: 2
            });
            this.connected = true;
            console.log('✅ MongoDB connected successfully');
            
            await this.initMarketPrice();
            await this.createIndexes();
            
            const fixedOrders = await this.fixStuckOrders();
            if (fixedOrders > 0) console.log(`🔧 تم تصحيح ${fixedOrders} أوامر`);
            
            const balanceCheck = await this.validateBalances();
            if (!balanceCheck.isValid) {
                console.error('⚠️ تناقض في الأرصدة - جاري التصحيح...');
                await this.ensureAdminHasSupply();
            }
            
            await this.cancelExpiredDeposits();
            setInterval(() => this.cancelExpiredDeposits(), 6 * 60 * 60 * 1000);
            
        } catch (error) {
            console.error('❌ MongoDB connection error:', error);
            throw error;
        }
    }

    async createIndexes() {
        try {
            await User.collection.createIndex({ userId: 1 }, { unique: true });
            await Wallet.collection.createIndex({ userId: 1 }, { unique: true });
            await Order.collection.createIndex({ status: 1, type: 1, price: 1 });
            await Order.collection.createIndex({ userId: 1, status: 1 });
            await Trade.collection.createIndex({ createdAt: -1 });
            await ChatMessage.collection.createIndex({ chatType: 1, createdAt: -1 });
            await DepositRequest.collection.createIndex({ status: 1, address: 1 });
            await DepositRequest.collection.createIndex({ userId: 1, status: 1, referrerRewarded: 1 });
            await Candlestick.collection.createIndex({ timeframe: 1, timestamp: 1, isReal: 1 });
            console.log('✅ Database indexes created');
        } catch (e) {
            console.log('⚠️ Index creation warning:', e.message);
        }
    }

    async initMarketPrice() {
        try {
            const existing = await MarketPrice.findOne({ symbol: 'CRYSTAL/USDT' });
            if (!existing) {
                await MarketPrice.create({
                    symbol: 'CRYSTAL/USDT',
                    price: 0.002,
                    displayPrice: 0.002,
                    change24h: 0,
                    volume24h: 0,
                    high24h: 0.002,
                    low24h: 0.002,
                    lastUpdated: new Date(),
                    lastFakeUpdate: new Date()
                });
                console.log('✅ Market price initialized: 1 CRYSTAL = 0.002 USDT');
            }
        } catch (e) {
            console.error('⚠️ Market price init error:', e.message);
        }
    }

    async ensureAdminHasSupply() {
        try {
            for (const adminId of ADMIN_IDS) {
                const user = await User.findOne({ userId: adminId });
                if (user && user.isAdmin) {
                    const wallet = await Wallet.findOne({ userId: adminId });
                    if (!wallet) continue;
                    
                    const circulating = await this.getCirculatingSupply();
                    const openSellOrders = await Order.aggregate([
                        { $match: { type: 'sell', status: { $in: ['open', 'partial'] } } },
                        { $group: { _id: null, totalFrozen: { $sum: '$amount' } } }
                    ]);
                    const frozen = openSellOrders[0]?.totalFrozen || 0;
                    
                    const available = circulating + frozen + wallet.crystalBalance;
                    const diff = this.totalCrystalSupply - available;
                    
                    if (Math.abs(diff) > 0.01) {
                        if (diff > 0 && wallet.crystalBalance < this.totalCrystalSupply) {
                            await Wallet.updateOne(
                                { userId: adminId },
                                { $inc: { crystalBalance: diff } }
                            );
                            console.log(`👑 تم تصحيح رصيد الأدمن ${adminId}: ${diff > 0 ? '+' : ''}${diff.toFixed(2)} CRYSTAL`);
                        }
                    }
                }
            }
        } catch (e) {
            console.error('ensureAdminHasSupply error:', e.message);
        }
    }

    // ====================================================================
    // نظام الحركة الوهمية للسعر والشموع
    // ====================================================================

    async startFakePriceMovement() {
        if (this.fakePriceInterval) return;
        
        const marketPrice = await MarketPrice.findOne({ symbol: 'CRYSTAL/USDT' });
        if (marketPrice) {
            this.lastFakePrice = marketPrice.price;
        }
        
        console.log('📊 بدء حركة السعر والشموع الوهمية...');
        
        await this.fakePriceTick();
        
        this.fakePriceInterval = setInterval(async () => {
            await this.fakePriceTick();
        }, 5000);
    }

    async stopFakePriceMovement() {
        if (this.fakePriceInterval) {
            clearInterval(this.fakePriceInterval);
            this.fakePriceInterval = null;
            console.log('📊 توقف حركة السعر الوهمية');
        }
    }

    async fakePriceTick() {
        try {
            const marketPrice = await MarketPrice.findOne({ symbol: 'CRYSTAL/USDT' });
            if (!marketPrice) return;
            
            const realPrice = marketPrice.price;
            
            const maxChange = realPrice * 0.005;
            const randomChange = (Math.random() - 0.5) * 2 * maxChange;
            const fakePrice = Math.max(0.0001, realPrice + randomChange);
            
            const now = new Date();
            
            await MarketPrice.updateOne(
                { symbol: 'CRYSTAL/USDT' },
                { 
                    $set: { 
                        displayPrice: parseFloat(fakePrice.toFixed(6)),
                        lastFakeUpdate: now
                    } 
                }
            );
            
            await this.addFakeCandlestick(fakePrice, realPrice, now);
            
            this.lastFakePrice = fakePrice;
            
        } catch (e) {}
    }

    async addFakeCandlestick(fakePrice, realPrice, timestamp) {
        try {
            const timeframes = ['1m', '5m', '15m', '1h'];
            
            for (const tf of timeframes) {
                let interval = 60 * 1000;
                if (tf === '5m') interval = 5 * 60 * 1000;
                if (tf === '15m') interval = 15 * 60 * 1000;
                if (tf === '1h') interval = 60 * 60 * 1000;
                
                const currentSlot = Math.floor(timestamp.getTime() / interval) * interval;
                const candleTime = new Date(currentSlot);
                
                let candle = await Candlestick.findOne({ 
                    timeframe: tf, 
                    timestamp: candleTime,
                    isReal: false
                });
                
                if (!candle) {
                    const openPrice = this.lastFakePrice || fakePrice;
                    await Candlestick.create({
                        timeframe: tf,
                        timestamp: candleTime,
                        open: openPrice,
                        high: Math.max(openPrice, fakePrice),
                        low: Math.min(openPrice, fakePrice),
                        close: fakePrice,
                        volume: Math.random() * 10,
                        isReal: false
                    });
                } else {
                    candle.high = Math.max(candle.high, fakePrice);
                    candle.low = Math.min(candle.low, fakePrice);
                    candle.close = fakePrice;
                    candle.volume += Math.random() * 5;
                    await candle.save();
                }
            }
        } catch (e) {}
    }

    // ====================================================================
    // تصحيح الأوامر والأرصدة بعد الصيانة
    // ====================================================================

    async fixStuckOrders() {
        try {
            console.log('🔧 فحص الأوامر العالقة...');
            
            const openOrders = await Order.find({ status: { $in: ['open', 'partial'] } });
            let fixedCount = 0;
            
            for (const order of openOrders) {
                const wallet = await Wallet.findOne({ userId: order.userId });
                if (!wallet) continue;
                
                if (order.type === 'sell') {
                    if (wallet.crystalBalance >= order.amount) {
                        await Wallet.updateOne(
                            { userId: order.userId },
                            { $inc: { crystalBalance: -order.amount } }
                        );
                        console.log(`🔧 إعادة تجميد ${order.amount} CRYSTAL من ${order.userId}`);
                        fixedCount++;
                    }
                } else if (order.type === 'buy') {
                    const totalNeeded = (order.amount * order.price) * (1 + this.tradingFee);
                    if (wallet.usdtBalance >= totalNeeded) {
                        await Wallet.updateOne(
                            { userId: order.userId },
                            { $inc: { usdtBalance: -totalNeeded } }
                        );
                        console.log(`🔧 إعادة تجميد ${totalNeeded.toFixed(4)} USDT من ${order.userId}`);
                        fixedCount++;
                    }
                }
            }
            
            console.log(`✅ تم تصحيح ${fixedCount} أوامر`);
            return fixedCount;
            
        } catch (e) {
            console.error('fixStuckOrders error:', e.message);
            return 0;
        }
    }

    async validateBalances() {
        try {
            console.log('🔍 فحص تناقض الأرصدة...');
            
            const totalCrystal = await Wallet.aggregate([
                { $group: { _id: null, total: { $sum: '$crystalBalance' } } }
            ]);
            const totalInWallets = totalCrystal[0]?.total || 0;
            
            const openSellOrders = await Order.aggregate([
                { $match: { type: 'sell', status: { $in: ['open', 'partial'] } } },
                { $group: { _id: null, totalFrozen: { $sum: '$amount' } } }
            ]);
            const frozenInOrders = openSellOrders[0]?.totalFrozen || 0;
            
            const circulating = await this.getCirculatingSupply();
            
            let adminTotal = 0;
            for (const adminId of ADMIN_IDS) {
                const balance = await this.getAdminBalance(adminId);
                adminTotal += balance.crystalBalance;
            }
            
            const grandTotal = circulating + frozenInOrders + adminTotal;
            const isValid = Math.abs(grandTotal - this.totalCrystalSupply) <= 1;
            
            console.log(`📊 العرض الكلي: ${this.totalCrystalSupply.toLocaleString()}`);
            console.log(`📊 متداول: ${circulating.toFixed(2)}`);
            console.log(`📊 مجمد: ${frozenInOrders.toFixed(2)}`);
            console.log(`📊 أدمن: ${adminTotal.toFixed(2)}`);
            console.log(`📊 المجموع: ${grandTotal.toFixed(2)} - ${isValid ? '✅ سليم' : '❌ خطأ'}`);
            
            if (!isValid) {
                console.log('⚠️ تناقض في الأرصدة - جاري التصحيح...');
                await this.ensureAdminHasSupply();
            }
            
            return {
                totalSupply: this.totalCrystalSupply,
                circulating,
                frozen: frozenInOrders,
                adminBalance: adminTotal,
                total: grandTotal,
                isValid
            };
            
        } catch (e) {
            console.error('validateBalances error:', e.message);
            return { isValid: false, totalSupply: this.totalCrystalSupply };
        }
    }

    async cancelExpiredDeposits() {
        try {
            const result = await DepositRequest.updateMany(
                {
                    status: 'pending',
                    expiresAt: { $lt: new Date() }
                },
                {
                    $set: {
                        status: 'expired',
                        rejectionReason: 'انتهت صلاحية الطلب - لم يتم الإيداع خلال 24 ساعة'
                    }
                }
            );
            
            if (result.modifiedCount > 0) {
                console.log(`🔄 تم إلغاء ${result.modifiedCount} طلب إيداع منتهي`);
            }
        } catch (e) {
            console.error('cancelExpiredDeposits error:', e.message);
        }
    }

    // ====================================================================
    // سجلات التدقيق
    // ====================================================================
    
    async addAuditLog(userId, action, details = {}, ip = '', userAgent = '') {
        try {
            await AuditLog.create({ userId, action, details, ip, userAgent, timestamp: new Date() });
        } catch (e) {}
    }

    // ====================================================================
    // إدارة المستخدمين
    // ====================================================================
    
    async updateLastSeen(userId) {
        try {
            await User.updateOne({ userId }, { lastSeen: new Date(), isOnline: true });
        } catch (e) {}
    }

    async isUserBannedOrLocked(userId) {
        try {
            const user = await User.findOne({ userId });
            if (!user) return { banned: false, locked: false };
            if (user.isBanned) return { banned: true, reason: user.banReason || 'تم حظر حسابك نهائياً' };
            if (user.isLocked) return { locked: true, reason: 'حسابك مقفل مؤقتاً' };
            return { banned: false, locked: false };
        } catch (e) {
            return { banned: false, locked: false };
        }
    }

    async registerUser(userId, username, firstName, lastName, phone, email, country, city, referrerId = null, language = 'ar', ip = '', userAgent = '') {
        try {
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
                    }
                }
                
                const userCount = await User.countDocuments();
                const isFirstUser = userCount === 0;
                const isAdminUser = isFirstUser || ADMIN_IDS.includes(userId);
                
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
                    isAdmin: isAdminUser,
                    isVerified: false,
                    lastSeen: new Date(),
                    isOnline: true,
                    lastLoginIp: ip,
                    twoFAEnabled: false,
                    twoFASecret: '',
                    twoFABackupCodes: [],
                    referralCount: 0,
                    referralEarnings: 0,
                    referralCommissionRate: this.referralCommissionRate,
                    referrals: [],
                    totalTrades: 0,
                    totalVolume: 0,
                    totalProfit: 0,
                    rating: 5.0
                });
                
                if (isAdminUser) {
                    const adminWallet = await Wallet.findOne({ userId });
                    if (adminWallet && adminWallet.crystalBalance === 0) {
                        await Wallet.updateOne(
                            { userId },
                            { $inc: { crystalBalance: this.totalCrystalSupply } }
                        );
                        console.log(`👑 تم إعطاء الأدمن ${userId} كامل العرض: ${this.totalCrystalSupply.toLocaleString()} CRYSTAL`);
                    }
                }
                
                await this.updateDailyStats('totalUsers', 1);
                await this.updateDailyStats('newUsers', 1);
                
                this.addAuditLog(userId, 'register', { referrer: referrerId, isAdmin: isAdminUser }, ip, userAgent).catch(() => {});
                
                return {
                    success: true,
                    isNew: true,
                    referrer: validReferrer,
                    isAdmin: isAdminUser,
                    message: isAdminUser 
                        ? `👑 أهلاً بالأدمن! تم إعطاؤك ${this.totalCrystalSupply.toLocaleString()} CRYSTAL` 
                        : '✅ تم إنشاء حسابك بنجاح! يمكنك شراء CRYSTAL من السوق'
                };
            }
            
            await User.updateOne({ userId }, { lastSeen: new Date(), isOnline: true, lastLoginIp: ip });
            return { success: true, isNew: false, message: '👋 أهلاً بعودتك!' };
            
        } catch (error) {
            console.error('registerUser error:', error.message);
            return { success: false, message: '❌ حدث خطأ في التسجيل' };
        }
    }

    async getUser(userId) {
        try {
            return await User.findOne({ userId });
        } catch (e) {
            return null;
        }
    }

    async getUserStats(userId) {
        try {
            const user = await this.getUser(userId);
            if (!user) return null;
            
            const wallet = await this.getUserWallet(userId);
            const openOrders = await Order.countDocuments({ userId, status: { $in: ['open', 'partial'] } });
            
            return {
                ...user.toObject(),
                usdtBalance: wallet.usdtBalance || 0,
                crystalBalance: wallet.crystalBalance || 0,
                openOrders,
                totalTrades: user.totalTrades || 0,
                totalVolume: user.totalVolume || 0,
                referralEarnings: user.referralEarnings || 0,
                referralCount: user.referralCount || 0
            };
        } catch (e) {
            console.error('getUserStats error:', e.message);
            return null;
        }
    }

    async banUser(userId, reason) {
        try {
            await User.updateOne({ userId }, { isBanned: true, banReason: reason });
            const openOrders = await Order.find({ userId, status: { $in: ['open', 'partial'] } });
            for (const order of openOrders) {
                await this.cancelOrder(order._id, userId);
            }
            return { success: true, message: `🚫 تم حظر المستخدم ${userId}` };
        } catch (e) {
            return { success: false, message: '❌ حدث خطأ' };
        }
    }

    async unbanUser(userId) {
        try {
            await User.updateOne({ userId }, { isBanned: false, banReason: '' });
            return { success: true, message: `✅ تم فك حظر المستخدم ${userId}` };
        } catch (e) {
            return { success: false, message: '❌ حدث خطأ' };
        }
    }

    // ====================================================================
    // نظام 2FA
    // ====================================================================
    
    async generate2FASecret(userId) {
        try {
            const user = await User.findOne({ userId });
            if (!user) return { success: false, message: 'المستخدم غير موجود' };
            
            const secret = speakeasy.generateSecret({ length: 20 });
            const encryptedSecret = this.encryptPrivateKey(secret.base32);
            
            const backupCodes = [];
            for (let i = 0; i < 5; i++) {
                backupCodes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
            }
            const encryptedBackupCodes = backupCodes.map(c => this.encryptPrivateKey(c));
            
            await User.updateOne({ userId }, { twoFASecret: encryptedSecret, twoFABackupCodes: encryptedBackupCodes });
            
            const otpauthURL = speakeasy.otpauthURL({
                secret: secret.ascii,
                label: `CRYSTAL Exchange (${userId})`,
                issuer: 'CRYSTAL Exchange'
            });
            
            const qrCode = await qrcode.toDataURL(otpauthURL);
            
            return { success: true, qrCode, backupCodes, secret: secret.base32 };
        } catch (error) {
            return { success: false, message: 'خطأ في إنشاء رمز 2FA' };
        }
    }

    async enable2FA(userId, code) {
        try {
            const user = await User.findOne({ userId });
            if (!user || !user.twoFASecret) return { success: false, message: 'لم يتم إنشاء رمز 2FA بعد' };
            
            const decryptedSecret = this.decryptPrivateKey(user.twoFASecret);
            const verified = speakeasy.totp.verify({
                secret: decryptedSecret, encoding: 'base32', token: code, window: 2
            });
            
            if (!verified) return { success: false, message: '❌ رمز التحقق غير صحيح' };
            
            await User.updateOne({ userId }, { twoFAEnabled: true });
            return { success: true, message: '✅ تم تفعيل التحقق بخطوتين' };
        } catch (error) {
            return { success: false, message: 'خطأ في الخادم' };
        }
    }

    async disable2FA(userId, code) {
        try {
            const user = await User.findOne({ userId });
            if (!user) return { success: false, message: 'المستخدم غير موجود' };
            
            if (user.twoFAEnabled && user.twoFASecret) {
                const decryptedSecret = this.decryptPrivateKey(user.twoFASecret);
                const verified = speakeasy.totp.verify({
                    secret: decryptedSecret, encoding: 'base32', token: code, window: 2
                });
                if (!verified) return { success: false, message: '❌ رمز التحقق غير صحيح' };
            }
            
            await User.updateOne({ userId }, { twoFAEnabled: false, twoFASecret: '', twoFABackupCodes: [] });
            return { success: true, message: '✅ تم تعطيل التحقق بخطوتين' };
        } catch (error) {
            return { success: false, message: 'خطأ في الخادم' };
        }
    }

    async verify2FACode(userId, code) {
        try {
            const user = await User.findOne({ userId });
            if (!user || !user.twoFAEnabled) return true;
            
            const decryptedSecret = this.decryptPrivateKey(user.twoFASecret);
            return speakeasy.totp.verify({
                secret: decryptedSecret, encoding: 'base32', token: code, window: 2
            });
        } catch (e) {
            return false;
        }
    }

    // ====================================================================
    // إنشاء المحافظ
    // ====================================================================
    
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
        return {
            address: keypair.publicKey.toString(),
            encryptedPrivateKey: this.encryptPrivateKey(JSON.stringify(Array.from(keypair.secretKey)))
        };
    }

    async createAptosWallet() {
        const account = new AptosAccount();
        return {
            address: account.address().hex(),
            encryptedPrivateKey: this.encryptPrivateKey(account.toPrivateKeyObject().privateKeyHex)
        };
    }

    async getUserWallet(userId) {
        try {
            let wallet = await Wallet.findOne({ userId });
            if (!wallet) {
                const [bnb, polygon, solana, aptos] = await Promise.all([
                    this.createBnbWallet(), this.createPolygonWallet(),
                    this.createSolanaWallet(), this.createAptosWallet()
                ]);
                
                wallet = await Wallet.create({
                    userId,
                    usdtBalance: 0,
                    crystalBalance: 0,
                    bnbAddress: bnb.address,
                    bnbEncryptedPrivateKey: bnb.encryptedPrivateKey,
                    polygonAddress: polygon.address,
                    polygonEncryptedPrivateKey: polygon.encryptedPrivateKey,
                    solanaAddress: solana.address,
                    solanaEncryptedPrivateKey: solana.encryptedPrivateKey,
                    aptosAddress: aptos.address,
                    aptosEncryptedPrivateKey: aptos.encryptedPrivateKey,
                    walletSignature: this.generateSignature(`wallet-${userId}`)
                });
            }
            return wallet;
        } catch (e) {
            console.error('getUserWallet error:', e.message);
            throw e;
        }
    }

    // ====================================================================
    // نظام التداول - الأسعار
    // ====================================================================
    
    async getMarketPrice() {
        try {
            const price = await MarketPrice.findOne({ symbol: 'CRYSTAL/USDT' });
            if (!price) return 0.002;
            return price.displayPrice || price.price;
        } catch (e) {
            return 0.002;
        }
    }

    async getRealMarketPrice() {
        try {
            const price = await MarketPrice.findOne({ symbol: 'CRYSTAL/USDT' });
            return price ? price.price : 0.002;
        } catch (e) {
            return 0.002;
        }
    }

    async updateMarketPrice(newPrice, volume) {
        try {
            const price = await MarketPrice.findOne({ symbol: 'CRYSTAL/USDT' });
            if (!price) return;
            
            const update = {
                price: newPrice,
                displayPrice: newPrice,
                volume24h: (price.volume24h || 0) + volume,
                high24h: Math.max(price.high24h || newPrice, newPrice),
                low24h: Math.min(price.low24h || newPrice, newPrice),
                lastUpdated: new Date()
            };
            
            const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const dayAgoPrice = await this.getPriceAtTime(dayAgo);
            if (dayAgoPrice && dayAgoPrice > 0) {
                update.change24h = ((newPrice - dayAgoPrice) / dayAgoPrice) * 100;
            }
            
            await MarketPrice.updateOne({ symbol: 'CRYSTAL/USDT' }, update);
            this.addCandlestick(newPrice, volume, true).catch(() => {});
            
            console.log(`💰 السعر الحقيقي: ${newPrice} USDT (حجم: ${volume})`);
            
        } catch (e) {
            console.error('updateMarketPrice error:', e.message);
        }
    }

    async getPriceAtTime(timestamp) {
        try {
            const candle = await Candlestick.findOne({
                timeframe: '1h', 
                timestamp: { $lte: timestamp },
                isReal: true
            }).sort({ timestamp: -1 });
            
            if (candle) return candle.close;
            
            const anyCandle = await Candlestick.findOne({
                timeframe: '1h', 
                timestamp: { $lte: timestamp }
            }).sort({ timestamp: -1 });
            
            return anyCandle ? anyCandle.close : null;
        } catch (e) {
            return null;
        }
    }

    async addCandlestick(price, volume, isReal = true) {
        try {
            const timeframes = ['1m', '5m', '15m', '1h'];
            const now = new Date();
            
            for (const tf of timeframes) {
                let interval = 60 * 1000;
                if (tf === '5m') interval = 5 * 60 * 1000;
                if (tf === '15m') interval = 15 * 60 * 1000;
                if (tf === '1h') interval = 60 * 60 * 1000;
                
                const currentSlot = Math.floor(now.getTime() / interval) * interval;
                const candleTime = new Date(currentSlot);
                
                let candle = await Candlestick.findOne({ 
                    timeframe: tf, 
                    timestamp: candleTime,
                    isReal: true
                });
                
                if (!candle) {
                    candle = await Candlestick.findOne({ 
                        timeframe: tf, 
                        timestamp: candleTime,
                        isReal: false
                    });
                    
                    if (candle) {
                        candle.isReal = true;
                    }
                }
                
                if (!candle) {
                    await Candlestick.create({
                        timeframe: tf,
                        timestamp: candleTime,
                        open: price,
                        high: price,
                        low: price,
                        close: price,
                        volume: volume,
                        isReal: isReal
                    });
                } else {
                    candle.high = Math.max(candle.high, price);
                    candle.low = Math.min(candle.low, price);
                    candle.close = price;
                    candle.volume += volume;
                    await candle.save();
                }
            }
        } catch (e) {}
    }

    async getCandlesticks(timeframe, limit = 100) {
        try {
            const candles = await Candlestick.find({ timeframe })
                .sort({ timestamp: -1 })
                .limit(Math.min(limit, 200));
            return candles.reverse();
        } catch (e) {
            return [];
        }
    }

    // ====================================================================
    // إنشاء أمر تداول
    // ====================================================================
    
    async createOrder(userId, type, price, amount) {
        try {
            console.log('📥 createOrder called:', { userId, type, price, amount });
            
            const user = await this.getUser(userId);
            if (!user) {
                console.log('❌ User not found:', userId);
                return { success: false, message: '⚠️ المستخدم غير موجود' };
            }
            
            console.log('✅ User found:', user.firstName, 'isAdmin:', user.isAdmin);
            
            const banCheck = await this.isUserBannedOrLocked(userId);
            if (banCheck.banned) return { success: false, message: banCheck.reason };
            if (banCheck.locked) return { success: false, message: banCheck.reason };
            
            if (!user.isVerified) {
                console.log('❌ User not verified');
                return { success: false, message: '⚠️ يرجى توثيق حسابك أولاً للتمكن من التداول' };
            }
            
            if (price <= 0 || amount <= 0) {
                return { success: false, message: '⚠️ السعر والكمية يجب أن تكون أكبر من 0' };
            }
            
            if (amount < 1) {
                return { success: false, message: '⚠️ الحد الأدنى للكمية هو 1 CRYSTAL' };
            }
            
            const totalUsdt = price * amount;
            const wallet = await this.getUserWallet(userId);
            console.log('💰 Wallet balance:', { crystal: wallet.crystalBalance, usdt: wallet.usdtBalance });
            
            if (type === 'sell') {
                if (wallet.crystalBalance < amount) {
                    console.log('❌ Insufficient CRYSTAL');
                    return {
                        success: false,
                        message: `❌ رصيد غير كافٍ! لديك ${wallet.crystalBalance.toFixed(2)} CRYSTAL`
                    };
                }
                await Wallet.updateOne({ userId }, { $inc: { crystalBalance: -amount } });
                console.log('✅ Frozen', amount, 'CRYSTAL for sell order');
            } else if (type === 'buy') {
                const fee = totalUsdt * this.tradingFee;
                const totalNeeded = totalUsdt + fee;
                
                if (wallet.usdtBalance < totalNeeded) {
                    console.log('❌ Insufficient USDT');
                    return {
                        success: false,
                        message: `❌ رصيد غير كافٍ! تحتاج ${totalNeeded.toFixed(4)} USDT (السعر + الرسوم)`
                    };
                }
                await Wallet.updateOne({ userId }, { $inc: { usdtBalance: -totalNeeded } });
                console.log('✅ Frozen', totalNeeded, 'USDT for buy order');
            }
            
            const order = await Order.create({
                userId, type, price, amount, originalAmount: amount, totalUsdt,
                status: 'open', isAdminOrder: user.isAdmin || false, createdAt: new Date()
            });
            
            console.log('✅ Order created:', order._id.toString());
            
            try {
                const matchPromise = this.matchOrders(order);
                const timeoutPromise = new Promise(resolve =>
                    setTimeout(() => {
                        console.log('⏱️ Match timeout reached');
                        resolve(0);
                    }, this.matchTimeout)
                );
                const matched = await Promise.race([matchPromise, timeoutPromise]);
                console.log('🔄 Matched amount:', matched);
            } catch (matchError) {
                console.log('⚠️ Match warning:', matchError.message);
            }
            
            this.addAuditLog(userId, 'create_order', {
                orderId: order._id, type, price, amount
            }).catch(() => {});
            
            return {
                success: true,
                orderId: order._id,
                message: `✅ تم إنشاء أمر ${type === 'buy' ? 'شراء' : 'بيع'} ${amount} CRYSTAL بسعر ${price} USDT`
            };
            
        } catch (error) {
            console.error('❌ createOrder error:', error.message);
            console.error(error.stack);
            return { success: false, message: '❌ حدث خطأ في إنشاء الطلب: ' + error.message };
        }
    }

    // ====================================================================
    // مطابقة الأوامر - الأدمن فقط يمكنه التداول مع نفسه
    // ====================================================================
    
    async matchOrders(newOrder) {
        let remainingAmount = newOrder.amount;
        let totalExecuted = 0;
        
        try {
            const oppositeType = newOrder.type === 'buy' ? 'sell' : 'buy';
            const isUserAdmin = await this.isAdmin(newOrder.userId);
            
            let query = {
                type: oppositeType,
                status: { $in: ['open', 'partial'] }
            };
            
            // ✅ الأدمن فقط يمكنه مطابقة أوامره مع نفسه
            if (!isUserAdmin) {
                query.userId = { $ne: newOrder.userId };
            }
            
            if (newOrder.type === 'buy') {
                query.price = { $lte: newOrder.price };
            } else {
                query.price = { $gte: newOrder.price };
            }
            
            const matchingOrders = await Order.find(query)
                .sort({ price: newOrder.type === 'buy' ? 1 : -1, createdAt: 1 })
                .limit(20);
            
            for (const matchOrder of matchingOrders) {
                if (remainingAmount <= 0.0001) break;
                
                const executeAmount = Math.min(remainingAmount, matchOrder.amount);
                const executePrice = matchOrder.price;
                
                try {
                    await this.executeTrade(
                        newOrder.type === 'buy' ? newOrder : matchOrder,
                        newOrder.type === 'buy' ? matchOrder : newOrder,
                        executeAmount, executePrice
                    );
                    
                    remainingAmount -= executeAmount;
                    totalExecuted += executeAmount;
                    
                } catch (tradeError) {
                    console.error('Trade execution error:', tradeError.message);
                    continue;
                }
            }
            
            if (totalExecuted > 0) {
                const newStatus = remainingAmount <= 0.0001 ? 'completed' : 'partial';
                await Order.updateOne(
                    { _id: newOrder._id },
                    {
                        status: newStatus,
                        amount: Math.max(0, remainingAmount),
                        completedAt: newStatus === 'completed' ? new Date() : null
                    }
                );
                
                const lastPrice = matchingOrders[0]?.price || newOrder.price;
                await this.updateMarketPrice(lastPrice, totalExecuted);
            }
            
            return totalExecuted;
            
        } catch (error) {
            console.error('matchOrders error:', error.message);
            return totalExecuted;
        }
    }

    async executeTrade(buyOrder, sellOrder, amount, price) {
        const totalUsdt = amount * price;
        const fee = totalUsdt * this.tradingFee;
        const netUsdt = totalUsdt - fee;
        
        await Wallet.updateOne(
            { userId: buyOrder.userId },
            { $inc: { crystalBalance: amount } }
        );
        
        await Wallet.updateOne(
            { userId: sellOrder.userId },
            { $inc: { usdtBalance: netUsdt } }
        );
        
        if (buyOrder.type === 'buy' && buyOrder.price > price) {
            const refund = (buyOrder.price - price) * amount;
            if (refund > 0) {
                await Wallet.updateOne(
                    { userId: buyOrder.userId },
                    { $inc: { usdtBalance: refund } }
                );
            }
        }
        
        await Trade.create({
            buyerId: buyOrder.userId,
            sellerId: sellOrder.userId,
            buyOrderId: buyOrder._id,
            sellOrderId: sellOrder._id,
            price: price,
            amount: amount,
            totalUsdt: totalUsdt,
            fee: fee,
            createdAt: new Date()
        });
        
        const buyRemaining = buyOrder.amount - amount;
        const sellRemaining = sellOrder.amount - amount;
        
        if (buyRemaining <= 0.0001) {
            await Order.updateOne({ _id: buyOrder._id }, { status: 'completed', amount: 0, completedAt: new Date() });
        } else {
            await Order.updateOne({ _id: buyOrder._id }, { status: 'partial', amount: buyRemaining });
        }
        
        if (sellRemaining <= 0.0001) {
            await Order.updateOne({ _id: sellOrder._id }, { status: 'completed', amount: 0, completedAt: new Date() });
        } else {
            await Order.updateOne({ _id: sellOrder._id }, { status: 'partial', amount: sellRemaining });
        }
        
        await User.updateOne({ userId: buyOrder.userId }, { $inc: { totalTrades: 1, totalVolume: totalUsdt } });
        await User.updateOne({ userId: sellOrder.userId }, { $inc: { totalTrades: 1, totalVolume: totalUsdt } });
        
        this.updateDailyStats('totalTrades', 1).catch(() => {});
        this.updateDailyStats('totalVolume', totalUsdt).catch(() => {});
        this.updateDailyStats('totalCommission', fee).catch(() => {});
        
        this.sendTradeNotification(buyOrder.userId, 'buy', amount, price).catch(() => {});
        this.sendTradeNotification(sellOrder.userId, 'sell', amount, price).catch(() => {});
        
        this.addAuditLog(buyOrder.userId, 'trade_executed', { type: 'buy', amount, price, totalUsdt }).catch(() => {});
        this.addAuditLog(sellOrder.userId, 'trade_executed', { type: 'sell', amount, price, totalUsdt }).catch(() => {});
    }

    async sendTradeNotification(userId, type, amount, price) {
        try {
            if (global.botInstance) {
                let message;
                if (type === 'buy') {
                    message = `✅ تم شراء ${amount.toFixed(2)} CRYSTAL بسعر ${price} USDT`;
                } else if (type === 'sell') {
                    message = `✅ تم بيع ${amount.toFixed(2)} CRYSTAL بسعر ${price} USDT`;
                } else if (type === 'deposit') {
                    message = `✅ تم إيداع ${amount} USDT في حسابك`;
                } else if (type === 'withdraw') {
                    message = `✅ تم سحب ${amount} USDT من حسابك`;
                } else if (type === 'kyc_approved') {
                    message = `✅ تم توثيق حسابك بنجاح`;
                } else {
                    return;
                }
                
                await global.botInstance.telegram.sendMessage(userId, message);
            }
        } catch (e) {}
    }

    // ====================================================================
    // إلغاء الطلب
    // ====================================================================
    
    async cancelOrder(orderId, userId) {
        try {
            const order = await Order.findOne({
                _id: orderId, userId: userId, status: { $in: ['open', 'partial'] }
            });
            
            if (!order) {
                return { success: false, message: '⚠️ الطلب غير موجود أو تم تنفيذه بالكامل' };
            }
            
            if (order.type === 'buy') {
                const refundAmount = order.amount * order.price;
                const feeRefund = refundAmount * this.tradingFee;
                await Wallet.updateOne(
                    { userId },
                    { $inc: { usdtBalance: refundAmount + feeRefund } }
                );
            } else if (order.type === 'sell') {
                await Wallet.updateOne(
                    { userId },
                    { $inc: { crystalBalance: order.amount } }
                );
            }
            
            await Order.updateOne(
                { _id: orderId },
                { status: 'cancelled', cancelledAt: new Date() }
            );
            
            this.addAuditLog(userId, 'cancel_order', { orderId }).catch(() => {});
            
            return { success: true, message: '✅ تم إلغاء الطلب بنجاح' };
            
        } catch (error) {
            console.error('cancelOrder error:', error.message);
            return { success: false, message: '❌ حدث خطأ في إلغاء الطلب' };
        }
    }

    // ====================================================================
    // جلب الأوامر
    // ====================================================================
    
    async getActiveOrders(type = null, limit = 50) {
        try {
            const query = { status: { $in: ['open', 'partial'] } };
            if (type) query.type = type;
            
            const orders = await Order.find(query)
                .sort({ price: type === 'buy' ? -1 : 1, createdAt: -1 })
                .limit(Math.min(limit, 100))
                .lean();
            
            const aggregatedMap = new Map();
            
            for (const order of orders) {
                const key = `${order.price.toFixed(4)}_${order.type}`;
                
                if (aggregatedMap.has(key)) {
                    const existing = aggregatedMap.get(key);
                    existing.amount += order.amount;
                    existing.totalUsdt = existing.amount * existing.price;
                    existing.orderCount += 1;
                } else {
                    aggregatedMap.set(key, {
                        _id: order._id,
                        price: order.price,
                        type: order.type,
                        amount: order.amount,
                        totalUsdt: order.amount * order.price,
                        userId: order.userId,
                        status: order.status,
                        isAdminOrder: order.isAdminOrder || false,
                        orderCount: 1,
                        createdAt: order.createdAt
                    });
                }
            }
            
            let result = Array.from(aggregatedMap.values());
            
            if (type === 'buy') {
                result.sort((a, b) => b.price - a.price);
            } else if (type === 'sell') {
                result.sort((a, b) => a.price - b.price);
            }
            
            return result.slice(0, limit);
            
        } catch (e) {
            console.error('getActiveOrders error:', e.message);
            return [];
        }
    }

    async getUserOrders(userId) {
        try {
            return await Order.find({
                userId, status: { $in: ['open', 'partial'] }
            }).sort({ createdAt: -1 }).limit(50);
        } catch (e) {
            return [];
        }
    }

    async getUserTradeHistory(userId, limit = 50) {
        try {
            return await Trade.find({
                $or: [{ buyerId: userId }, { sellerId: userId }]
            }).sort({ createdAt: -1 }).limit(Math.min(limit, 100));
        } catch (e) {
            return [];
        }
    }

    // ====================================================================
    // الإيداع
    // ====================================================================
    
    async requestDeposit(userId, amount, currency, network) {
        try {
            if (amount < 1) {
                return { success: false, message: '⚠️ الحد الأدنى للإيداع هو 1 USDT' };
            }
            
            const existingPending = await DepositRequest.findOne({
                userId,
                status: 'pending',
                createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            });
            
            if (existingPending) {
                return {
                    success: false,
                    message: '⚠️ لديك طلب إيداع معلق! انتظر 24 ساعة أو اطلب من الأدمن إلغاءه'
                };
            }
            
            const pendingCount = await DepositRequest.countDocuments({
                userId,
                status: 'pending'
            });
            
            if (pendingCount >= 3) {
                return {
                    success: false,
                    message: '⚠️ لديك 3 طلبات إيداع معلقة! انتظر الموافقة عليها أولاً'
                };
            }
            
            const wallet = await this.getUserWallet(userId);
            let address;
            
            switch(network) {
                case 'bnb': address = wallet.bnbAddress; break;
                case 'polygon': address = wallet.polygonAddress; break;
                case 'solana': address = wallet.solanaAddress; break;
                case 'aptos': address = wallet.aptosAddress; break;
                default: return { success: false, message: '⚠️ شبكة غير مدعومة' };
            }
            
            const request = await DepositRequest.create({
                userId,
                amount,
                currency: 'USDT',
                network,
                address,
                status: 'pending',
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + this.depositExpiryHours * 60 * 60 * 1000)
            });
            
            console.log(`✅ طلب إيداع: ${userId} - ${amount} USDT - ${network} - ${address}`);
            
            return {
                success: true,
                requestId: request._id,
                address: address,
                message: `📤 أرسل ${amount} USDT عبر ${network} إلى:\n\`${address}\`\n\n⏳ صالح لمدة ${this.depositExpiryHours} ساعة\n✅ سيتم التأكيد تلقائياً`
            };
            
        } catch (e) {
            console.error('requestDeposit error:', e);
            return { success: false, message: '❌ حدث خطأ في طلب الإيداع' };
        }
    }

    async confirmDeposit(requestId, transactionHash, adminId = 0) {
        try {
            const request = await DepositRequest.findOne({ _id: requestId, status: 'pending' });
            if (!request) return { success: false, message: 'الطلب غير موجود' };
            
            await DepositRequest.updateOne(
                { _id: requestId },
                {
                    status: 'completed',
                    transactionHash,
                    completedAt: new Date(),
                    verifiedBy: adminId
                }
            );
            
            await Wallet.updateOne(
                { userId: request.userId },
                { $inc: { usdtBalance: request.amount } }
            );
            
            // ✅ مكافأة المحيل عند أول إيداع
            await this.checkAndRewardReferrer(request.userId, request.amount);
            
            const isAuto = adminId === 0;
            this.sendTradeNotification(request.userId, 'deposit', request.amount, 0).catch(() => {});
            
            console.log(`✅ إيداع ${isAuto ? 'تلقائي' : 'يدوي'}: ${request.userId} - ${request.amount} USDT`);
            
            return {
                success: true,
                message: `✅ تم ${isAuto ? 'تأكيد' : 'إيداع'} ${request.amount} USDT${isAuto ? ' تلقائياً' : ''}`
            };
            
        } catch (e) {
            return { success: false, message: '❌ حدث خطأ في تأكيد الإيداع' };
        }
    }

    // ====================================================================
    // مكافأة الإيداع للإحالات
    // ====================================================================

    async checkAndRewardReferrer(userId, depositAmount) {
        try {
            const user = await User.findOne({ userId });
            if (!user || !user.referrerId) return;
            
            const referrerId = user.referrerId;
            const referrer = await User.findOne({ userId: referrerId });
            if (!referrer) return;
            
            // التحقق من أن هذا المستخدم لم يتم مكافأة إحالته من قبل
            const alreadyRewarded = await DepositRequest.findOne({
                userId: userId,
                status: 'completed',
                referrerRewarded: true
            });
            
            if (alreadyRewarded) {
                console.log(`⚠️ المستخدم ${userId} تمت مكافأة محيله مسبقاً`);
                return;
            }
            
            // ✅ إضافة 1000 CRYSTAL للمحيل
            await Wallet.updateOne(
                { userId: referrerId },
                { $inc: { crystalBalance: this.referralDepositReward } }
            );
            
            // ✅ تحديث أرباح الإحالة
            await User.updateOne(
                { userId: referrerId },
                { $inc: { referralEarnings: this.referralDepositReward } }
            );
            
            // ✅ تحديث الإحالة في قائمة الإحالات
            await User.updateOne(
                { 
                    userId: referrerId, 
                    'referrals.userId': userId 
                },
                { 
                    $set: { 
                        'referrals.$.earned': this.referralDepositReward,
                        'referrals.$.totalCommission': this.referralDepositReward
                    } 
                }
            );
            
            // ✅ تعليم أن هذا الإيداع تمت مكافأة المحيل عنه
            await DepositRequest.updateMany(
                { userId: userId, status: 'completed' },
                { $set: { referrerRewarded: true } }
            );
            
            console.log(`🎁 مكافأة إحالة: ${referrerId} حصل على ${this.referralDepositReward} CRYSTAL من إيداع ${userId}`);
            
            // إشعار المحيل
            if (global.botInstance) {
                try {
                    await global.botInstance.telegram.sendMessage(
                        referrerId,
                        `🎁 *مبروك!*\n\n` +
                        `حصلت على *${this.referralDepositReward} CRYSTAL* كمكافأة إحالة!\n` +
                        `👤 المدعو: \`${userId}\` قام بأول إيداع له\n` +
                        `💰 تمت إضافة ${this.referralDepositReward} CRYSTAL إلى رصيدك`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (e) {}
            }
            
        } catch (e) {
            console.error('checkAndRewardReferrer error:', e.message);
        }
    }

    // ====================================================================
    // السحب
    // ====================================================================
    
    async requestWithdraw(userId, amount, currency, network, address, twoFACode = null) {
        try {
            const wallet = await this.getUserWallet(userId);
            
            if (amount < 5) {
                return { success: false, message: '⚠️ الحد الأدنى للسحب هو 5 USDT' };
            }
            
            const user = await User.findOne({ userId });
            if (user && user.twoFAEnabled) {
                if (!twoFACode) {
                    return { success: false, message: '⚠️ يرجى إدخال رمز التحقق بخطوتين' };
                }
                const verified = await this.verify2FACode(userId, twoFACode);
                if (!verified) {
                    return { success: false, message: '❌ رمز التحقق غير صحيح' };
                }
            }
            
            const platformFee = this.platformWithdrawFee;
            const networkFee = this.getNetworkFee(network);
            const totalDeduct = amount + platformFee + networkFee;
            
            if (wallet.usdtBalance < totalDeduct) {
                return {
                    success: false,
                    message: `❌ رصيد غير كافٍ! تحتاج ${totalDeduct.toFixed(2)} USDT`
                };
            }
            
            const request = await WithdrawRequest.create({
                userId, amount, currency: 'USDT', network, address,
                fee: platformFee, networkFee,
                status: amount > 1000 ? 'pending' : 'processing'
            });
            
            if (amount <= 1000) {
                await Wallet.updateOne({ userId }, { $inc: { usdtBalance: -totalDeduct } });
            }
            
            console.log(`✅ طلب سحب: ${userId} - ${amount} USDT - ${network}`);
            
            return {
                success: true,
                requestId: request._id,
                message: `✅ تم استلام طلب سحب ${amount} USDT${amount > 1000 ? ' (يتطلب موافقة)' : ''}`
            };
            
        } catch (e) {
            console.error('requestWithdraw error:', e);
            return { success: false, message: '❌ حدث خطأ في طلب السحب' };
        }
    }

    async confirmWithdraw(requestId, transactionHash, adminId) {
        try {
            const request = await WithdrawRequest.findOne({
                _id: requestId, status: { $in: ['pending', 'processing'] }
            });
            
            if (!request) return { success: false, message: 'الطلب غير موجود' };
            
            const totalDeduct = request.amount + request.fee + (request.networkFee || 0);
            
            if (request.status === 'pending') {
                await Wallet.updateOne(
                    { userId: request.userId },
                    { $inc: { usdtBalance: -totalDeduct } }
                );
            }
            
            await WithdrawRequest.updateOne(
                { _id: requestId },
                { status: 'completed', transactionHash, approvedBy: adminId, approvedAt: new Date() }
            );
            
            this.sendTradeNotification(request.userId, 'withdraw', request.amount, 0).catch(() => {});
            
            return { success: true, message: `✅ تم تأكيد سحب ${request.amount} USDT` };
            
        } catch (e) {
            return { success: false, message: '❌ حدث خطأ في تأكيد السحب' };
        }
    }

    // ====================================================================
    // KYC
    // ====================================================================
    
    async createKycRequest(userId, fullName, passportNumber, nationalId, phoneNumber, email, country, city, passportPhotoFileId, personalPhotoFileId, bankName, bankAccountNumber, bankAccountName) {
        try {
            const existing = await KycRequest.findOne({ userId });
            
            if (existing && existing.status === 'pending') {
                return { success: false, message: '⚠️ لديك طلب قيد المراجعة' };
            }
            if (existing && existing.status === 'approved') {
                return { success: false, message: '✅ حسابك موثق بالفعل' };
            }
            
            const kycRequest = await KycRequest.create({
                userId, fullName, passportNumber, nationalId, phoneNumber, email, country, city,
                passportPhotoFileId, personalPhotoFileId, bankName, bankAccountNumber, bankAccountName,
                status: 'pending', createdAt: new Date()
            });
            
            console.log(`✅ طلب KYC: ${userId} - ${fullName}`);
            
            return {
                success: true,
                requestId: kycRequest._id,
                message: '✅ تم إرسال طلب التوثيق بنجاح!'
            };
            
        } catch (e) {
            console.error('createKycRequest error:', e);
            return { success: false, message: '❌ حدث خطأ في إرسال طلب التوثيق' };
        }
    }

    async approveKyc(requestId, adminId) {
        try {
            const request = await KycRequest.findOne({ _id: requestId, status: 'pending' });
            if (!request) return { success: false, message: 'الطلب غير موجود' };
            
            await KycRequest.updateOne(
                { _id: requestId },
                { status: 'approved', approvedBy: adminId, approvedAt: new Date() }
            );
            
            await User.updateOne({ userId: request.userId }, { isVerified: true });
            
            this.updateDailyStats('verifiedUsers', 1).catch(() => {});
            this.sendTradeNotification(request.userId, 'kyc_approved', 0, 0).catch(() => {});
            
            console.log(`✅ KYC approved: ${request.userId}`);
            
            return { success: true, message: '✅ تم توثيق الحساب بنجاح' };
            
        } catch (e) {
            return { success: false, message: '❌ حدث خطأ في توثيق الحساب' };
        }
    }

    async rejectKyc(requestId, adminId, reason) {
        try {
            const request = await KycRequest.findOne({ _id: requestId, status: 'pending' });
            if (!request) return { success: false, message: 'الطلب غير موجود' };
            
            await KycRequest.updateOne(
                { _id: requestId },
                { status: 'rejected', rejectionReason: reason, approvedBy: adminId }
            );
            
            return { success: true, message: `❌ تم رفض طلب التوثيق\nالسبب: ${reason}` };
            
        } catch (e) {
            return { success: false, message: '❌ حدث خطأ في رفض الطلب' };
        }
    }

    async getKycStatus(userId) {
        try {
            const request = await KycRequest.findOne({ userId }).sort({ createdAt: -1 });
            if (!request) return { status: 'not_submitted' };
            return {
                status: request.status,
                rejectionReason: request.rejectionReason,
                fullName: request.fullName,
                submittedAt: request.createdAt
            };
        } catch (e) {
            return { status: 'not_submitted' };
        }
    }

    // ====================================================================
    // الإحالات
    // ====================================================================
    
    async getReferralData(userId) {
        try {
            const user = await User.findOne({ userId });
            const botUsername = process.env.BOT_USERNAME || 'TradeCrystalBot';
            
            if (!user) {
                return {
                    referralCount: 0, referralEarnings: 0,
                    referralCommissionRate: this.referralCommissionRate,
                    referrals: [],
                    referralLink: `https://t.me/${botUsername}?start=${userId}`
                };
            }
            
            return {
                referralCount: user.referralCount || 0,
                referralEarnings: user.referralEarnings || 0,
                referralCommissionRate: user.referralCommissionRate || this.referralCommissionRate,
                referrals: user.referrals || [],
                referralLink: `https://t.me/${botUsername}?start=${userId}`
            };
        } catch (e) {
            return {
                referralCount: 0, referralEarnings: 0,
                referralCommissionRate: this.referralCommissionRate,
                referrals: [], referralLink: ''
            };
        }
    }

    async transferReferralEarningsToWallet(userId) {
        try {
            const user = await User.findOne({ userId });
            if (!user) return { success: false, message: 'المستخدم غير موجود' };
            
            const referralEarnings = user.referralEarnings || 0;
            if (referralEarnings <= 0) return { success: false, message: '⚠️ لا يوجد رصيد إحالات للتحويل' };
            
            await Wallet.updateOne({ userId }, { $inc: { usdtBalance: referralEarnings } });
            await User.updateOne({ userId }, { $set: { referralEarnings: 0 } });
            
            return {
                success: true,
                amount: referralEarnings,
                message: `✅ تم تحويل ${referralEarnings.toFixed(2)} USDT إلى محفظتك`
            };
            
        } catch (e) {
            return { success: false, message: '❌ حدث خطأ في التحويل' };
        }
    }

    // ====================================================================
    // دوال العرض والتداول
    // ====================================================================
    
    async getCirculatingSupply() {
        try {
            const result = await Wallet.aggregate([
                { $match: { userId: { $nin: ADMIN_IDS } } },
                { $group: { _id: null, total: { $sum: '$crystalBalance' } } }
            ]);
            return result[0]?.total || 0;
        } catch (e) {
            return 0;
        }
    }

    async getAdminBalance(adminId) {
        try {
            const wallet = await Wallet.findOne({ userId: adminId });
            return {
                crystalBalance: wallet?.crystalBalance || 0,
                usdtBalance: wallet?.usdtBalance || 0
            };
        } catch (e) {
            return { crystalBalance: 0, usdtBalance: 0 };
        }
    }

    async validateTotalSupply() {
        try {
            const circulating = await this.getCirculatingSupply();
            let adminTotal = 0;
            for (const adminId of ADMIN_IDS) {
                const balance = await this.getAdminBalance(adminId);
                adminTotal += balance.crystalBalance;
            }
            
            const openSellOrders = await Order.aggregate([
                { $match: { type: 'sell', status: { $in: ['open', 'partial'] } } },
                { $group: { _id: null, totalFrozen: { $sum: '$amount' } } }
            ]);
            const frozen = openSellOrders[0]?.totalFrozen || 0;
            
            const totalInMarket = circulating + frozen + adminTotal;
            
            return {
                isValid: Math.abs(totalInMarket - this.totalCrystalSupply) <= 1,
                totalSupply: this.totalCrystalSupply,
                circulating: circulating,
                frozen: frozen,
                adminBalance: adminTotal,
                remaining: this.totalCrystalSupply - totalInMarket
            };
        } catch (e) {
            return {
                isValid: true,
                totalSupply: this.totalCrystalSupply,
                circulating: 0,
                frozen: 0,
                adminBalance: this.totalCrystalSupply,
                remaining: 0
            };
        }
    }

    // ====================================================================
    // الإحصائيات
    // ====================================================================
    
    async getMarketStats() {
        try {
            const marketPrice = await MarketPrice.findOne({ symbol: 'CRYSTAL/USDT' });
            const buyOrders = await Order.countDocuments({ type: 'buy', status: { $in: ['open', 'partial'] } });
            const sellOrders = await Order.countDocuments({ type: 'sell', status: { $in: ['open', 'partial'] } });
            const totalTrades = await Trade.countDocuments();
            
            const totalVolumeResult = await Trade.aggregate([
                { $group: { _id: null, total: { $sum: '$totalUsdt' } } }
            ]);
            
            const supplyCheck = await this.validateTotalSupply();
            
            return {
                price: marketPrice?.displayPrice || marketPrice?.price || 0.002,
                change24h: marketPrice?.change24h || 0,
                volume24h: marketPrice?.volume24h || 0,
                high24h: marketPrice?.high24h || 0.002,
                low24h: marketPrice?.low24h || 0.002,
                buyOrders, sellOrders, totalTrades,
                totalVolume: totalVolumeResult[0]?.total || 0,
                totalSupply: supplyCheck.totalSupply,
                circulatingSupply: supplyCheck.circulating,
                lastUpdated: marketPrice?.lastUpdated || new Date()
            };
        } catch (e) {
            return {
                price: 0.002, change24h: 0, volume24h: 0,
                high24h: 0.002, low24h: 0.002,
                buyOrders: 0, sellOrders: 0, totalTrades: 0, totalVolume: 0,
                totalSupply: this.totalCrystalSupply, circulatingSupply: 0
            };
        }
    }

    async getLeaderboard(limit = 15) {
        try {
            return await User.find({})
                .sort({ totalVolume: -1 })
                .limit(Math.min(limit, 50))
                .select('userId firstName username totalVolume totalTrades rating');
        } catch (e) {
            return [];
        }
    }

    async updateDailyStats(type, value = 1) {
        try {
            const today = new Date().toISOString().split('T')[0];
            let stats = await DailyStats.findOne({ date: today });
            
            if (!stats) {
                stats = await DailyStats.create({
                    date: today,
                    totalUsers: 0, newUsers: 0, verifiedUsers: 0,
                    totalTrades: 0, totalVolume: 0, totalCommission: 0,
                    activeOffers: 0, pendingKyc: 0
                });
            }
            
            const fieldMap = {
                'totalUsers': 'totalUsers', 'newUsers': 'newUsers', 'verifiedUsers': 'verifiedUsers',
                'totalTrades': 'totalTrades', 'totalVolume': 'totalVolume',
                'totalCommission': 'totalCommission', 'activeOffers': 'activeOffers', 'pendingKyc': 'pendingKyc'
            };
            
            if (fieldMap[type]) {
                const update = { [fieldMap[type]]: (stats[fieldMap[type]] || 0) + value };
                await DailyStats.updateOne({ date: today }, { $set: update });
            }
        } catch (e) {}
    }

    // ====================================================================
    // الدردشة
    // ====================================================================
    
    async sendMessage(senderId, receiverId, message, imageFileId = null) {
        try {
            const chatMessage = await ChatMessage.create({
                chatType: receiverId ? 'trade' : 'global',
                senderId, receiverId,
                message: message || '',
                messageType: imageFileId ? 'image' : 'text',
                imageFileId: imageFileId || '',
                isRead: false,
                createdAt: new Date()
            });
            return chatMessage;
        } catch (e) {
            return null;
        }
    }

    async getGlobalMessages(limit = 50) {
        try {
            const messages = await ChatMessage.find({ chatType: 'global' })
                .sort({ createdAt: -1 })
                .limit(Math.min(limit, 100));
            return messages.reverse();
        } catch (e) {
            return [];
        }
    }

    // ====================================================================
    // صلاحيات الأدمن
    // ====================================================================
    
    async isAdmin(userId) {
        try {
            const user = await User.findOne({ userId });
            return user?.isAdmin || false;
        } catch (e) {
            return false;
        }
    }

    async getPendingKycRequests() {
        try {
            return await KycRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(50);
        } catch (e) {
            return [];
        }
    }

    async getPendingWithdraws() {
        try {
            return await WithdrawRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(50);
        } catch (e) {
            return [];
        }
    }

    async getPendingDeposits() {
        try {
            return await DepositRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(50);
        } catch (e) {
            return [];
        }
    }
}

module.exports = new Database();
