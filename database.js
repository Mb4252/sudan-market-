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
        this.referralDepositReward = 1000;
        
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
            const timeframes = ['1m', '5m', '15m', '1h', '4h', '1d'];
            
            for (const tf of timeframes) {
                let interval = 60 * 1000;
                if (tf === '5m') interval = 5 * 60 * 1000;
                if (tf === '15m') interval = 15 * 60 * 1000;
                if (tf === '1h') interval = 60 * 60 * 1000;
                if (tf === '4h') interval = 4 * 60 * 60 * 1000;
                if (tf === '1d') interval = 24 * 60 * 60 * 1000;
                
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
    // تصحيح الأوامر والأرصدة
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
                        await Wallet.updateOne({ userId: order.userId }, { $inc: { crystalBalance: -order.amount } });
                        fixedCount++;
                    }
                } else if (order.type === 'buy') {
                    const totalNeeded = (order.amount * order.price) * (1 + this.tradingFee);
                    if (wallet.usdtBalance >= totalNeeded) {
                        await Wallet.updateOne({ userId: order.userId }, { $inc: { usdtBalance: -totalNeeded } });
                        fixedCount++;
                    }
                }
            }
            console.log(`✅ تم تصحيح ${fixedCount} أوامر`);
            return fixedCount;
        } catch (e) { return 0; }
    }

    async validateBalances() {
        try {
            const circulating = await this.getCirculatingSupply();
            const openSellOrders = await Order.aggregate([
                { $match: { type: 'sell', status: { $in: ['open', 'partial'] } } },
                { $group: { _id: null, totalFrozen: { $sum: '$amount' } } }
            ]);
            const frozen = openSellOrders[0]?.totalFrozen || 0;
            
            let adminTotal = 0;
            for (const adminId of ADMIN_IDS) {
                const balance = await this.getAdminBalance(adminId);
                adminTotal += balance.crystalBalance;
            }
            
            const grandTotal = circulating + frozen + adminTotal;
            const isValid = Math.abs(grandTotal - this.totalCrystalSupply) <= 1;
            
            if (!isValid) await this.ensureAdminHasSupply();
            
            return { totalSupply: this.totalCrystalSupply, circulating, frozen, adminBalance: adminTotal, total: grandTotal, isValid };
        } catch (e) {
            return { isValid: false, totalSupply: this.totalCrystalSupply };
        }
    }

    async cancelExpiredDeposits() {
        try {
            await DepositRequest.updateMany(
                { status: 'pending', expiresAt: { $lt: new Date() } },
                { $set: { status: 'expired', rejectionReason: 'انتهت صلاحية الطلب' } }
            );
        } catch (e) {}
    }

    // ====================================================================
    // سجلات
    // ====================================================================
    
    async addAuditLog(userId, action, details = {}, ip = '', userAgent = '') {
        try { await AuditLog.create({ userId, action, details, ip, userAgent, timestamp: new Date() }); } catch (e) {}
    }

    // ====================================================================
    // مستخدمين
    // ====================================================================
    
    async isUserBannedOrLocked(userId) {
        try {
            const user = await User.findOne({ userId });
            if (!user) return { banned: false, locked: false };
            if (user.isBanned) return { banned: true, reason: user.banReason || 'تم حظر حسابك' };
            if (user.isLocked) return { locked: true, reason: 'حسابك مقفل مؤقتاً' };
            return { banned: false, locked: false };
        } catch (e) { return { banned: false, locked: false }; }
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
                        await User.updateOne({ userId: referrerId }, { $inc: { referralCount: 1 }, $push: { referrals: { userId, joinedAt: new Date(), totalCommission: 0, earned: 0 } } });
                    }
                }
                const isFirstUser = (await User.countDocuments()) === 0;
                const isAdminUser = isFirstUser || ADMIN_IDS.includes(userId);
                
                user = await User.create({
                    userId, username: username || '', firstName: firstName || '', lastName: lastName || '',
                    phoneNumber: phone || '', email: email || '', country: country || 'SD', city: city || '',
                    language, walletId: wallet._id, referrerId: validReferrer ? referrerId : null,
                    isAdmin: isAdminUser, isVerified: false, lastSeen: new Date(), isOnline: true,
                    lastLoginIp: ip, twoFAEnabled: false, twoFASecret: '', twoFABackupCodes: [],
                    referralCount: 0, referralEarnings: 0, referralCommissionRate: this.referralCommissionRate,
                    referrals: [], totalTrades: 0, totalVolume: 0, totalProfit: 0, rating: 5.0
                });
                
                if (isAdminUser) {
                    const aw = await Wallet.findOne({ userId });
                    if (aw && aw.crystalBalance === 0) {
                        await Wallet.updateOne({ userId }, { $inc: { crystalBalance: this.totalCrystalSupply } });
                        console.log(`👑 تم إعطاء الأدمن ${userId}: ${this.totalCrystalSupply.toLocaleString()} CRYSTAL`);
                    }
                }
                
                await this.updateDailyStats('totalUsers', 1);
                await this.updateDailyStats('newUsers', 1);
                
                return { success: true, isNew: true, isAdmin: isAdminUser, message: isAdminUser ? `👑 أهلاً بالأدمن!` : '✅ تم إنشاء حسابك بنجاح!' };
            }
            await User.updateOne({ userId }, { lastSeen: new Date(), isOnline: true, lastLoginIp: ip });
            return { success: true, isNew: false, message: '👋 أهلاً بعودتك!' };
        } catch (error) { return { success: false, message: '❌ حدث خطأ في التسجيل' }; }
    }

    async getUser(userId) { try { return await User.findOne({ userId }); } catch (e) { return null; } }

    async getUserStats(userId) {
        try {
            const user = await this.getUser(userId); if (!user) return null;
            const wallet = await this.getUserWallet(userId);
            const openOrders = await Order.countDocuments({ userId, status: { $in: ['open', 'partial'] } });
            return { ...user.toObject(), usdtBalance: wallet.usdtBalance || 0, crystalBalance: wallet.crystalBalance || 0, openOrders, totalTrades: user.totalTrades || 0, totalVolume: user.totalVolume || 0, referralEarnings: user.referralEarnings || 0, referralCount: user.referralCount || 0 };
        } catch (e) { return null; }
    }

    async banUser(userId, reason) {
        try {
            await User.updateOne({ userId }, { isBanned: true, banReason: reason });
            const openOrders = await Order.find({ userId, status: { $in: ['open', 'partial'] } });
            for (const order of openOrders) await this.cancelOrder(order._id, userId);
            return { success: true, message: `🚫 تم حظر المستخدم ${userId}` };
        } catch (e) { return { success: false, message: '❌ حدث خطأ' }; }
    }

    async unbanUser(userId) {
        try { await User.updateOne({ userId }, { isBanned: false, banReason: '' }); return { success: true, message: `✅ تم فك حظر المستخدم ${userId}` }; } catch (e) { return { success: false, message: '❌ حدث خطأ' }; }
    }

    // ====================================================================
    // 2FA
    // ====================================================================
    
    async generate2FASecret(userId) {
        try {
            const user = await User.findOne({ userId }); if (!user) return { success: false, message: 'المستخدم غير موجود' };
            const secret = speakeasy.generateSecret({ length: 20 });
            const encryptedSecret = this.encryptPrivateKey(secret.base32);
            const backupCodes = []; for (let i = 0; i < 5; i++) backupCodes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
            await User.updateOne({ userId }, { twoFASecret: encryptedSecret, twoFABackupCodes: backupCodes.map(c => this.encryptPrivateKey(c)) });
            const otpauthURL = speakeasy.otpauthURL({ secret: secret.ascii, label: `CRYSTAL Exchange (${userId})`, issuer: 'CRYSTAL Exchange' });
            const qr = await qrcode.toDataURL(otpauthURL);
            return { success: true, qrCode: qr, backupCodes, secret: secret.base32 };
        } catch (error) { return { success: false, message: 'خطأ في إنشاء رمز 2FA' }; }
    }

    async enable2FA(userId, code) {
        try {
            const user = await User.findOne({ userId }); if (!user || !user.twoFASecret) return { success: false, message: 'لم يتم إنشاء رمز 2FA' };
            const verified = speakeasy.totp.verify({ secret: this.decryptPrivateKey(user.twoFASecret), encoding: 'base32', token: code, window: 2 });
            if (!verified) return { success: false, message: '❌ رمز التحقق غير صحيح' };
            await User.updateOne({ userId }, { twoFAEnabled: true });
            return { success: true, message: '✅ تم تفعيل التحقق بخطوتين' };
        } catch (error) { return { success: false, message: 'خطأ في الخادم' }; }
    }

    async disable2FA(userId, code) {
        try {
            const user = await User.findOne({ userId }); if (!user) return { success: false, message: 'المستخدم غير موجود' };
            if (user.twoFAEnabled && user.twoFASecret) {
                const verified = speakeasy.totp.verify({ secret: this.decryptPrivateKey(user.twoFASecret), encoding: 'base32', token: code, window: 2 });
                if (!verified) return { success: false, message: '❌ رمز التحقق غير صحيح' };
            }
            await User.updateOne({ userId }, { twoFAEnabled: false, twoFASecret: '', twoFABackupCodes: [] });
            return { success: true, message: '✅ تم تعطيل التحقق بخطوتين' };
        } catch (error) { return { success: false, message: 'خطأ في الخادم' }; }
    }

    async verify2FACode(userId, code) {
        try {
            const user = await User.findOne({ userId }); if (!user || !user.twoFAEnabled) return true;
            return speakeasy.totp.verify({ secret: this.decryptPrivateKey(user.twoFASecret), encoding: 'base32', token: code, window: 2 });
        } catch (e) { return false; }
    }

    // ====================================================================
    // محافظ
    // ====================================================================
    
    async createBnbWallet() { const w = ethers.Wallet.createRandom(); return { address: w.address, encryptedPrivateKey: this.encryptPrivateKey(w.privateKey) }; }
    async createPolygonWallet() { const w = ethers.Wallet.createRandom(); return { address: w.address, encryptedPrivateKey: this.encryptPrivateKey(w.privateKey) }; }
    async createSolanaWallet() { const k = Keypair.generate(); return { address: k.publicKey.toString(), encryptedPrivateKey: this.encryptPrivateKey(JSON.stringify(Array.from(k.secretKey))) }; }
    async createAptosWallet() { const a = new AptosAccount(); return { address: a.address().hex(), encryptedPrivateKey: this.encryptPrivateKey(a.toPrivateKeyObject().privateKeyHex) }; }

    async getUserWallet(userId) {
        try {
            let wallet = await Wallet.findOne({ userId });
            if (!wallet) {
                const [bnb, polygon, solana, aptos] = await Promise.all([this.createBnbWallet(), this.createPolygonWallet(), this.createSolanaWallet(), this.createAptosWallet()]);
                wallet = await Wallet.create({ userId, usdtBalance: 0, crystalBalance: 0, bnbAddress: bnb.address, bnbEncryptedPrivateKey: bnb.encryptedPrivateKey, polygonAddress: polygon.address, polygonEncryptedPrivateKey: polygon.encryptedPrivateKey, solanaAddress: solana.address, solanaEncryptedPrivateKey: solana.encryptedPrivateKey, aptosAddress: aptos.address, aptosEncryptedPrivateKey: aptos.encryptedPrivateKey, walletSignature: this.generateSignature(`wallet-${userId}`) });
            }
            return wallet;
        } catch (e) { throw e; }
    }

    // ====================================================================
    // أسعار
    // ====================================================================
    
    async getMarketPrice() { try { const p = await MarketPrice.findOne({ symbol: 'CRYSTAL/USDT' }); return p ? (p.displayPrice || p.price) : 0.002; } catch (e) { return 0.002; } }
    async getRealMarketPrice() { try { const p = await MarketPrice.findOne({ symbol: 'CRYSTAL/USDT' }); return p ? p.price : 0.002; } catch (e) { return 0.002; } }

    async updateMarketPrice(newPrice, volume) {
        try {
            const price = await MarketPrice.findOne({ symbol: 'CRYSTAL/USDT' }); if (!price) return;
            const update = { price: newPrice, displayPrice: newPrice, volume24h: (price.volume24h || 0) + volume, high24h: Math.max(price.high24h || newPrice, newPrice), low24h: Math.min(price.low24h || newPrice, newPrice), lastUpdated: new Date() };
            const dayAgoPrice = await this.getPriceAtTime(new Date(Date.now() - 24*60*60*1000));
            if (dayAgoPrice && dayAgoPrice > 0) update.change24h = ((newPrice - dayAgoPrice) / dayAgoPrice) * 100;
            await MarketPrice.updateOne({ symbol: 'CRYSTAL/USDT' }, update);
            this.addCandlestick(newPrice, volume, true).catch(() => {});
        } catch (e) {}
    }

    async getPriceAtTime(timestamp) { try { const c = await Candlestick.findOne({ timeframe: '1h', timestamp: { $lte: timestamp }, isReal: true }).sort({ timestamp: -1 }); return c ? c.close : null; } catch (e) { return null; } }

    async addCandlestick(price, volume, isReal = true) {
        try {
            const timeframes = ['1m', '5m', '15m', '1h', '4h', '1d']; const now = new Date();
            for (const tf of timeframes) {
                let interval = 60*1000; if (tf==='5m') interval=5*60*1000; if (tf==='15m') interval=15*60*1000; if (tf==='1h') interval=60*60*1000; if (tf==='4h') interval=4*60*60*1000; if (tf==='1d') interval=24*60*60*1000;
                const candleTime = new Date(Math.floor(now.getTime()/interval)*interval);
                let candle = await Candlestick.findOne({ timeframe: tf, timestamp: candleTime, isReal: true });
                if (!candle) candle = await Candlestick.findOne({ timeframe: tf, timestamp: candleTime, isReal: false });
                if (!candle) await Candlestick.create({ timeframe: tf, timestamp: candleTime, open: price, high: price, low: price, close: price, volume, isReal });
                else { candle.high = Math.max(candle.high, price); candle.low = Math.min(candle.low, price); candle.close = price; candle.volume += volume; if (isReal) candle.isReal = true; await candle.save(); }
            }
        } catch (e) {}
    }

    async getCandlesticks(timeframe, limit = 100) { try { return (await Candlestick.find({ timeframe }).sort({ timestamp: -1 }).limit(Math.min(limit, 200))).reverse(); } catch (e) { return []; } }

    // ====================================================================
    // أوامر
    // ====================================================================
    
    async createOrder(userId, type, price, amount) {
        try {
            const user = await this.getUser(userId); if (!user) return { success: false, message: '⚠️ المستخدم غير موجود' };
            const banCheck = await this.isUserBannedOrLocked(userId); if (banCheck.banned) return { success: false, message: banCheck.reason }; if (banCheck.locked) return { success: false, message: banCheck.reason };
            if (!user.isVerified) return { success: false, message: '⚠️ يرجى توثيق حسابك أولاً' };
            if (price <= 0 || amount <= 0) return { success: false, message: '⚠️ السعر والكمية يجب أن تكون أكبر من 0' };
            if (amount < 1) return { success: false, message: '⚠️ الحد الأدنى للكمية هو 1 CRYSTAL' };
            
            const totalUsdt = price * amount; const wallet = await this.getUserWallet(userId);
            
            if (type === 'sell') {
                if (wallet.crystalBalance < amount) return { success: false, message: `❌ رصيد غير كافٍ! لديك ${wallet.crystalBalance.toFixed(2)} CRYSTAL` };
                await Wallet.updateOne({ userId }, { $inc: { crystalBalance: -amount } });
            } else {
                const fee = totalUsdt * this.tradingFee; const totalNeeded = totalUsdt + fee;
                if (wallet.usdtBalance < totalNeeded) return { success: false, message: `❌ رصيد غير كافٍ! تحتاج ${totalNeeded.toFixed(4)} USDT` };
                await Wallet.updateOne({ userId }, { $inc: { usdtBalance: -totalNeeded } });
            }
            
            const order = await Order.create({ userId, type, price, amount, originalAmount: amount, totalUsdt, status: 'open', isAdminOrder: user.isAdmin || false, createdAt: new Date() });
            
            try { await Promise.race([this.matchOrders(order), new Promise(r => setTimeout(() => r(0), this.matchTimeout))]); } catch (e) {}
            
            return { success: true, orderId: order._id, message: `✅ تم إنشاء أمر ${type==='buy'?'شراء':'بيع'} ${amount} CRYSTAL بسعر ${price} USDT` };
        } catch (error) { return { success: false, message: '❌ حدث خطأ في إنشاء الطلب' }; }
    }

    async matchOrders(newOrder) {
        let remainingAmount = newOrder.amount, totalExecuted = 0;
        try {
            const isUserAdmin = await this.isAdmin(newOrder.userId);
            let query = { type: newOrder.type==='buy'?'sell':'buy', status: { $in: ['open', 'partial'] } };
            if (!isUserAdmin) query.userId = { $ne: newOrder.userId };
            query.price = newOrder.type==='buy' ? { $lte: newOrder.price } : { $gte: newOrder.price };
            
            const matchingOrders = await Order.find(query).sort({ price: newOrder.type==='buy'?1:-1, createdAt: 1 }).limit(20);
            for (const matchOrder of matchingOrders) {
                if (remainingAmount <= 0.0001) break;
                const executeAmount = Math.min(remainingAmount, matchOrder.amount);
                try { await this.executeTrade(newOrder.type==='buy'?newOrder:matchOrder, newOrder.type==='buy'?matchOrder:newOrder, executeAmount, matchOrder.price); remainingAmount -= executeAmount; totalExecuted += executeAmount; } catch (e) { continue; }
            }
            if (totalExecuted > 0) {
                await Order.updateOne({ _id: newOrder._id }, { status: remainingAmount<=0.0001?'completed':'partial', amount: Math.max(0, remainingAmount), completedAt: remainingAmount<=0.0001?new Date():null });
                await this.updateMarketPrice(matchingOrders[0]?.price || newOrder.price, totalExecuted);
            }
            return totalExecuted;
        } catch (error) { return totalExecuted; }
    }

    async executeTrade(buyOrder, sellOrder, amount, price) {
        const totalUsdt = amount * price, fee = totalUsdt * this.tradingFee, netUsdt = totalUsdt - fee;
        await Wallet.updateOne({ userId: buyOrder.userId }, { $inc: { crystalBalance: amount } });
        await Wallet.updateOne({ userId: sellOrder.userId }, { $inc: { usdtBalance: netUsdt } });
        if (buyOrder.type==='buy' && buyOrder.price > price) { const refund = (buyOrder.price-price)*amount; if (refund>0) await Wallet.updateOne({ userId: buyOrder.userId }, { $inc: { usdtBalance: refund } }); }
        await Trade.create({ buyerId: buyOrder.userId, sellerId: sellOrder.userId, buyOrderId: buyOrder._id, sellOrderId: sellOrder._id, price, amount, totalUsdt, fee, createdAt: new Date() });
        
        const buyRem = buyOrder.amount - amount, sellRem = sellOrder.amount - amount;
        await Order.updateOne({ _id: buyOrder._id }, { status: buyRem<=0.0001?'completed':'partial', amount: Math.max(0, buyRem), completedAt: buyRem<=0.0001?new Date():null });
        await Order.updateOne({ _id: sellOrder._id }, { status: sellRem<=0.0001?'completed':'partial', amount: Math.max(0, sellRem), completedAt: sellRem<=0.0001?new Date():null });
        
        await User.updateOne({ userId: buyOrder.userId }, { $inc: { totalTrades: 1, totalVolume: totalUsdt } });
        await User.updateOne({ userId: sellOrder.userId }, { $inc: { totalTrades: 1, totalVolume: totalUsdt } });
        
        this.updateDailyStats('totalTrades', 1).catch(()=>{});
        this.updateDailyStats('totalVolume', totalUsdt).catch(()=>{});
        this.updateDailyStats('totalCommission', fee).catch(()=>{});
        this.sendTradeNotification(buyOrder.userId, 'buy', amount, price).catch(()=>{});
        this.sendTradeNotification(sellOrder.userId, 'sell', amount, price).catch(()=>{});
    }

    async sendTradeNotification(userId, type, amount, price) {
        try { if (global.botInstance) { let m=''; if (type==='buy') m=`✅ تم شراء ${amount.toFixed(2)} CRYSTAL بسعر ${price} USDT`; else if (type==='sell') m=`✅ تم بيع ${amount.toFixed(2)} CRYSTAL بسعر ${price} USDT`; else if (type==='deposit') m=`✅ تم إيداع ${amount} USDT`; else if (type==='withdraw') m=`✅ تم سحب ${amount} USDT`; else if (type==='kyc_approved') m='✅ تم توثيق حسابك'; if (m) await global.botInstance.telegram.sendMessage(userId, m); } } catch (e) {}
    }

    async cancelOrder(orderId, userId) {
        try {
            const order = await Order.findOne({ _id: orderId, userId, status: { $in: ['open', 'partial'] } }); if (!order) return { success: false, message: '⚠️ الطلب غير موجود' };
            if (order.type==='buy') { await Wallet.updateOne({ userId }, { $inc: { usdtBalance: order.amount*order.price*(1+this.tradingFee) } }); }
            else { await Wallet.updateOne({ userId }, { $inc: { crystalBalance: order.amount } }); }
            await Order.updateOne({ _id: orderId }, { status: 'cancelled', cancelledAt: new Date() });
            return { success: true, message: '✅ تم إلغاء الطلب' };
        } catch (error) { return { success: false, message: '❌ حدث خطأ' }; }
    }

    async getActiveOrders(type = null, limit = 50) {
        try {
            const query = { status: { $in: ['open', 'partial'] } }; if (type) query.type = type;
            const orders = await Order.find(query).sort({ price: type==='buy'?-1:1, createdAt: -1 }).limit(Math.min(limit, 100)).lean();
            const map = new Map();
            for (const o of orders) { const k = `${o.price.toFixed(4)}_${o.type}`; if (map.has(k)) { const e = map.get(k); e.amount += o.amount; e.totalUsdt = e.amount*e.price; e.orderCount++; } else map.set(k, { ...o, orderCount: 1 }); }
            let result = Array.from(map.values());
            if (type==='buy') result.sort((a,b)=>b.price-a.price); else if (type==='sell') result.sort((a,b)=>a.price-b.price);
            return result.slice(0, limit);
        } catch (e) { return []; }
    }

    async getUserOrders(userId) { try { return await Order.find({ userId, status: { $in: ['open', 'partial'] } }).sort({ createdAt: -1 }).limit(50); } catch (e) { return []; } }
    async getUserTradeHistory(userId, limit = 50) { try { return await Trade.find({ $or: [{ buyerId: userId }, { sellerId: userId }] }).sort({ createdAt: -1 }).limit(Math.min(limit, 100)); } catch (e) { return []; } }

    // ====================================================================
    // إيداع
    // ====================================================================
    
    async requestDeposit(userId, amount, currency, network) {
        try {
            if (amount < 1) return { success: false, message: '⚠️ الحد الأدنى للإيداع هو 1 USDT' };
            const existing = await DepositRequest.findOne({ userId, status: 'pending', createdAt: { $gte: new Date(Date.now()-24*60*60*1000) } });
            if (existing) return { success: false, message: '⚠️ لديك طلب إيداع معلق!' };
            const pendingCount = await DepositRequest.countDocuments({ userId, status: 'pending' });
            if (pendingCount >= 3) return { success: false, message: '⚠️ لديك 3 طلبات معلقة!' };
            
            const wallet = await this.getUserWallet(userId); let address;
            switch(network) { case 'bnb': address=wallet.bnbAddress; break; case 'polygon': address=wallet.polygonAddress; break; case 'solana': address=wallet.solanaAddress; break; case 'aptos': address=wallet.aptosAddress; break; default: return { success: false, message: '⚠️ شبكة غير مدعومة' }; }
            
            const request = await DepositRequest.create({ userId, amount, currency: 'USDT', network, address, status: 'pending', createdAt: new Date(), expiresAt: new Date(Date.now()+this.depositExpiryHours*60*60*1000) });
            console.log(`✅ طلب إيداع: ${userId} - ${amount} USDT - ${network}`);
            return { success: true, requestId: request._id, address, message: `📤 أرسل ${amount} USDT عبر ${network} إلى العنوان` };
        } catch (e) { return { success: false, message: '❌ حدث خطأ' }; }
    }

    async confirmDeposit(requestId, transactionHash, adminId = 0) {
        try {
            const request = await DepositRequest.findOne({ _id: requestId, status: 'pending' }); if (!request) return { success: false, message: 'الطلب غير موجود' };
            await DepositRequest.updateOne({ _id: requestId }, { status: 'completed', transactionHash, completedAt: new Date(), verifiedBy: adminId });
            await Wallet.updateOne({ userId: request.userId }, { $inc: { usdtBalance: request.amount } });
            await this.checkAndRewardReferrer(request.userId, request.amount);
            this.sendTradeNotification(request.userId, 'deposit', request.amount, 0).catch(()=>{});
            return { success: true, message: `✅ تم إيداع ${request.amount} USDT` };
        } catch (e) { return { success: false, message: '❌ حدث خطأ' }; }
    }

    async checkAndRewardReferrer(userId, depositAmount) {
        try {
            const user = await User.findOne({ userId }); if (!user || !user.referrerId) return;
            const alreadyRewarded = await DepositRequest.findOne({ userId, status: 'completed', referrerRewarded: true });
            if (alreadyRewarded) return;
            await Wallet.updateOne({ userId: user.referrerId }, { $inc: { crystalBalance: this.referralDepositReward } });
            await User.updateOne({ userId: user.referrerId }, { $inc: { referralEarnings: this.referralDepositReward } });
            await User.updateOne({ userId: user.referrerId, 'referrals.userId': userId }, { $set: { 'referrals.$.earned': this.referralDepositReward, 'referrals.$.totalCommission': this.referralDepositReward } });
            await DepositRequest.updateMany({ userId, status: 'completed' }, { $set: { referrerRewarded: true } });
            console.log(`🎁 مكافأة إحالة: ${user.referrerId} +${this.referralDepositReward} CRYSTAL`);
            if (global.botInstance) { try { await global.botInstance.telegram.sendMessage(user.referrerId, `🎁 حصلت على ${this.referralDepositReward} CRYSTAL كمكافأة إحالة!`); } catch(e){} }
        } catch (e) {}
    }

    // ====================================================================
    // سحب
    // ====================================================================
    
    async requestWithdraw(userId, amount, currency, network, address, twoFACode = null) {
        try {
            const wallet = await this.getUserWallet(userId);
            if (amount < 5) return { success: false, message: '⚠️ الحد الأدنى للسحب هو 5 USDT' };
            const user = await User.findOne({ userId });
            if (user && user.twoFAEnabled) { if (!twoFACode) return { success: false, message: '⚠️ يرجى إدخال رمز 2FA' }; if (!await this.verify2FACode(userId, twoFACode)) return { success: false, message: '❌ رمز 2FA غير صحيح' }; }
            
            const platformFee = this.platformWithdrawFee, networkFee = this.getNetworkFee(network), totalDeduct = amount + platformFee + networkFee;
            if (wallet.usdtBalance < totalDeduct) return { success: false, message: `❌ رصيد غير كافٍ! تحتاج ${totalDeduct.toFixed(2)} USDT` };
            
            const request = await WithdrawRequest.create({ userId, amount, currency: 'USDT', network, address, fee: platformFee, networkFee, status: 'pending' });
            console.log(`✅ طلب سحب: ${userId} - ${amount} USDT - ${network}`);
            return { success: true, requestId: request._id, message: `✅ تم استلام طلب سحب ${amount} USDT (يتطلب موافقة الأدمن)` };
        } catch (e) { return { success: false, message: '❌ حدث خطأ' }; }
    }

    // ✅ سحب حقيقي - يرسل USDT على البلوكشين
    async confirmWithdraw(requestId, transactionHash, adminId) {
        try {
            const request = await WithdrawRequest.findOne({ _id: requestId, status: 'pending' });
            if (!request) return { success: false, message: 'الطلب غير موجود' };
            
            const totalDeduct = request.amount + request.fee + (request.networkFee || 0);
            const wallet = await Wallet.findOne({ userId: request.userId });
            
            // ✅ إرسال USDT حقيقي على البلوكشين
            let txHash = transactionHash;
            
            if (!txHash || txHash === 'manual_confirm') {
                try {
                    const result = await this.sendBlockchainUSDT(request.userId, request.address, request.amount, request.network);
                    if (result.success) {
                        txHash = result.txHash;
                        console.log(`✅ تم الإرسال على البلوكشين: ${txHash}`);
                    } else {
                        return { success: false, message: `❌ فشل الإرسال: ${result.error}` };
                    }
                } catch (sendError) {
                    return { success: false, message: `❌ خطأ في الإرسال: ${sendError.message}` };
                }
            }
            
            // خصم من رصيد المستخدم
            await Wallet.updateOne({ userId: request.userId }, { $inc: { usdtBalance: -totalDeduct } });
            
            // تحديث حالة الطلب
            await WithdrawRequest.updateOne({ _id: requestId }, { status: 'completed', transactionHash: txHash, approvedBy: adminId, approvedAt: new Date() });
            
            this.sendTradeNotification(request.userId, 'withdraw', request.amount, 0).catch(()=>{});
            
            return { success: true, message: `✅ تم سحب ${request.amount} USDT بنجاح!\n🔗 TX: ${txHash.slice(0,20)}...` };
        } catch (e) { return { success: false, message: '❌ حدث خطأ في تأكيد السحب' }; }
    }

    // ✅ إرسال USDT حقيقي على البلوكشين
    async sendBlockchainUSDT(userId, toAddress, amount, network) {
        try {
            console.log(`📤 إرسال ${amount} USDT على ${network} إلى ${toAddress}`);
            
            const wallet = await Wallet.findOne({ userId: userId });
            if (!wallet) return { success: false, error: 'المحفظة غير موجودة' };
            
            if (network === 'bnb') {
                const privateKey = this.decryptPrivateKey(wallet.bnbEncryptedPrivateKey);
                const provider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org');
                const signer = new ethers.Wallet(privateKey, provider);
                
                const usdtContract = new ethers.Contract(
                    '0x55d398326f99059fF775485246999027B3197955',
                    ['function transfer(address to, uint256 amount) returns (bool)'],
                    signer
                );
                
                const tx = await usdtContract.transfer(toAddress, ethers.utils.parseUnits(amount.toString(), 18));
                await tx.wait();
                return { success: true, txHash: tx.hash };
            }
            
            if (network === 'polygon') {
                const privateKey = this.decryptPrivateKey(wallet.polygonEncryptedPrivateKey);
                const provider = new ethers.providers.JsonRpcProvider('https://polygon-rpc.com');
                const signer = new ethers.Wallet(privateKey, provider);
                
                const usdtContract = new ethers.Contract(
                    '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
                    ['function transfer(address to, uint256 amount) returns (bool)'],
                    signer
                );
                
                const tx = await usdtContract.transfer(toAddress, ethers.utils.parseUnits(amount.toString(), 6));
                await tx.wait();
                return { success: true, txHash: tx.hash };
            }
            
            return { success: false, error: `شبكة ${network} غير مدعومة للسحب التلقائي` };
            
        } catch (e) {
            console.error('sendBlockchainUSDT error:', e.message);
            return { success: false, error: e.message };
        }
    }

    // ====================================================================
    // KYC
    // ====================================================================
    
    async createKycRequest(userId, fullName, passportNumber, nationalId, phoneNumber, email, country, city, passportPhotoFileId, personalPhotoFileId, bankName, bankAccountNumber, bankAccountName) {
        try {
            const existing = await KycRequest.findOne({ userId });
            if (existing && existing.status==='pending') return { success: false, message: '⚠️ لديك طلب قيد المراجعة' };
            if (existing && existing.status==='approved') return { success: false, message: '✅ حسابك موثق بالفعل' };
            await KycRequest.create({ userId, fullName, passportNumber, nationalId, phoneNumber, email, country, city, passportPhotoFileId, personalPhotoFileId, bankName, bankAccountNumber, bankAccountName, status: 'pending', createdAt: new Date() });
            return { success: true, message: '✅ تم إرسال طلب التوثيق' };
        } catch (e) { return { success: false, message: '❌ حدث خطأ' }; }
    }

    async approveKyc(requestId, adminId) {
        try {
            const request = await KycRequest.findOne({ _id: requestId, status: 'pending' }); if (!request) return { success: false, message: 'الطلب غير موجود' };
            await KycRequest.updateOne({ _id: requestId }, { status: 'approved', approvedBy: adminId, approvedAt: new Date() });
            await User.updateOne({ userId: request.userId }, { isVerified: true });
            this.sendTradeNotification(request.userId, 'kyc_approved', 0, 0).catch(()=>{});
            return { success: true, message: '✅ تم توثيق الحساب' };
        } catch (e) { return { success: false, message: '❌ حدث خطأ' }; }
    }

    async rejectKyc(requestId, adminId, reason) {
        try { await KycRequest.updateOne({ _id: requestId, status: 'pending' }, { status: 'rejected', rejectionReason: reason, approvedBy: adminId }); return { success: true, message: `❌ تم الرفض` }; } catch (e) { return { success: false, message: '❌ حدث خطأ' }; }
    }

    async getKycStatus(userId) { try { const r = await KycRequest.findOne({ userId }).sort({ createdAt: -1 }); return r ? { status: r.status } : { status: 'not_submitted' }; } catch (e) { return { status: 'not_submitted' }; } }

    // ====================================================================
    // إحالات
    // ====================================================================
    
    async getReferralData(userId) {
        try {
            const user = await User.findOne({ userId }); const bot = process.env.BOT_USERNAME || 'TradeCrystalBot';
            return { referralCount: user?.referralCount||0, referralEarnings: user?.referralEarnings||0, referralCommissionRate: user?.referralCommissionRate||this.referralCommissionRate, referrals: user?.referrals||[], referralLink: `https://t.me/${bot}?start=${userId}` };
        } catch (e) { return { referralCount:0, referralEarnings:0, referrals:[], referralLink:'' }; }
    }

    async transferReferralEarningsToWallet(userId) {
        try {
            const user = await User.findOne({ userId }); if (!user) return { success: false, message: 'المستخدم غير موجود' };
            const earnings = user.referralEarnings || 0; if (earnings <= 0) return { success: false, message: '⚠️ لا يوجد رصيد' };
            await Wallet.updateOne({ userId }, { $inc: { usdtBalance: earnings } });
            await User.updateOne({ userId }, { $set: { referralEarnings: 0 } });
            return { success: true, amount: earnings, message: `✅ تم تحويل ${earnings.toFixed(2)} USDT` };
        } catch (e) { return { success: false, message: '❌ حدث خطأ' }; }
    }

    // ====================================================================
    // عرض
    // ====================================================================
    
    async getCirculatingSupply() { try { const r = await Wallet.aggregate([{ $match: { userId: { $nin: ADMIN_IDS } } }, { $group: { _id: null, total: { $sum: '$crystalBalance' } } }]); return r[0]?.total || 0; } catch (e) { return 0; } }
    async getAdminBalance(adminId) { try { const w = await Wallet.findOne({ userId: adminId }); return { crystalBalance: w?.crystalBalance||0, usdtBalance: w?.usdtBalance||0 }; } catch (e) { return { crystalBalance:0, usdtBalance:0 }; } }

    async validateTotalSupply() {
        try {
            const circulating = await this.getCirculatingSupply(); let adminTotal = 0;
            for (const id of ADMIN_IDS) { const b = await this.getAdminBalance(id); adminTotal += b.crystalBalance; }
            const frozen = (await Order.aggregate([{ $match: { type:'sell', status:{$in:['open','partial']} } }, { $group: { _id:null, total:{$sum:'$amount'} } }]))[0]?.total || 0;
            const total = circulating + frozen + adminTotal;
            return { isValid: Math.abs(total-this.totalCrystalSupply)<=1, totalSupply: this.totalCrystalSupply, circulating, frozen, adminBalance: adminTotal, remaining: this.totalCrystalSupply-total };
        } catch (e) { return { isValid:true, totalSupply:this.totalCrystalSupply, circulating:0, frozen:0, adminBalance:this.totalCrystalSupply, remaining:0 }; }
    }

    async getMarketStats() {
        try {
            const mp = await MarketPrice.findOne({ symbol:'CRYSTAL/USDT' });
            const bo = await Order.countDocuments({ type:'buy', status:{$in:['open','partial']} });
            const so = await Order.countDocuments({ type:'sell', status:{$in:['open','partial']} });
            const tt = await Trade.countDocuments();
            const tv = (await Trade.aggregate([{ $group:{ _id:null, total:{$sum:'$totalUsdt'} } }]))[0]?.total || 0;
            const sc = await this.validateTotalSupply();
            return { price: mp?.displayPrice||mp?.price||0.002, change24h: mp?.change24h||0, volume24h: mp?.volume24h||0, high24h: mp?.high24h||0.002, low24h: mp?.low24h||0.002, buyOrders:bo, sellOrders:so, totalTrades:tt, totalVolume:tv, totalSupply:sc.totalSupply, circulatingSupply:sc.circulating };
        } catch (e) { return { price:0.002, change24h:0, volume24h:0, high24h:0.002, low24h:0.002, buyOrders:0, sellOrders:0, totalTrades:0, totalVolume:0, totalSupply:this.totalCrystalSupply, circulatingSupply:0 }; }
    }

    async getLeaderboard(limit=15) { try { return await User.find({}).sort({ totalVolume:-1 }).limit(Math.min(limit,50)).select('userId firstName username totalVolume totalTrades rating'); } catch(e) { return []; } }

    async updateDailyStats(type, value=1) {
        try {
            const today = new Date().toISOString().split('T')[0]; let s = await DailyStats.findOne({ date:today });
            if (!s) s = await DailyStats.create({ date:today, totalUsers:0, newUsers:0, verifiedUsers:0, totalTrades:0, totalVolume:0, totalCommission:0, activeOffers:0, pendingKyc:0 });
            const m = { totalUsers:'totalUsers', newUsers:'newUsers', verifiedUsers:'verifiedUsers', totalTrades:'totalTrades', totalVolume:'totalVolume', totalCommission:'totalCommission', activeOffers:'activeOffers', pendingKyc:'pendingKyc' };
            if (m[type]) { const u = {}; u[m[type]] = (s[m[type]]||0)+value; await DailyStats.updateOne({ date:today }, { $set:u }); }
        } catch(e) {}
    }

    // ====================================================================
    // دردشة
    // ====================================================================
    
    async sendMessage(senderId, receiverId, message, imageFileId=null) { try { return await ChatMessage.create({ chatType: receiverId?'trade':'global', senderId, receiverId, message: message||'', messageType: imageFileId?'image':'text', imageFileId: imageFileId||'', isRead:false, createdAt: new Date() }); } catch(e) { return null; } }
    async getGlobalMessages(limit=50) { try { return (await ChatMessage.find({ chatType:'global' }).sort({ createdAt:-1 }).limit(Math.min(limit,100))).reverse(); } catch(e) { return []; } }

    // ====================================================================
    // أدمن
    // ====================================================================
    
    async isAdmin(userId) { try { const u = await User.findOne({ userId }); return u?.isAdmin || false; } catch(e) { return false; } }
    async getPendingKycRequests() { try { return await KycRequest.find({ status:'pending' }).sort({ createdAt:-1 }).limit(50); } catch(e) { return []; } }
    async getPendingWithdraws() { try { return await WithdrawRequest.find({ status:'pending' }).sort({ createdAt:-1 }).limit(50); } catch(e) { return []; } }
    async getPendingDeposits() { try { return await DepositRequest.find({ status:'pending' }).sort({ createdAt:-1 }).limit(50); } catch(e) { return []; } }
}

module.exports = new Database();
