const mongoose = require('mongoose');
const crypto = require('crypto');
const { ethers } = require('ethers');
const { Connection, Keypair } = require('@solana/web3.js');
const { AptosAccount } = require('aptos');
const CryptoJS = require('crypto-js');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { User, Wallet, KycRequest, Order, Trade, Candlestick, MarketPrice, DepositRequest, WithdrawRequest, AuditLog, DailyStats, ChatMessage } = require('./models');

class Database {
    constructor() {
        this.connected = false;
        this.encryptionKey = process.env.ENCRYPTION_KEY || 'default_key_32_bytes_long';
        
        // إعدادات عملة CRYSTAL
        this.totalCrystalSupply = 5000000;  // 5 مليون حبة
        this.openingPrice = 500;             // 500 حبة = 1 USDT (سعر الافتتاح 0.002 USDT)
        this.tradingFee = 0.001;             // 0.1% رسوم تداول
        
        // رسوم المنصة
        this.platformWithdrawFee = 0.05;     // 0.05 دولار للسحب
        this.referralCommissionRate = 10;     // 10%
        
        // رسوم الشبكة
        this.networkFees = {
            bnb: 0.15, polygon: 0.10, solana: 0.02, aptos: 0.05, trc20: 3.00, erc20: 15.00
        };
        
        // ربط النماذج
        this.User = User;
        this.Wallet = Wallet;
        this.Order = Order;
        this.Trade = Trade;
        this.Candlestick = Candlestick;
        this.MarketPrice = MarketPrice;
        this.ChatMessage = ChatMessage;
        
        // تهيئة السعر السوقي الافتتاحي
        this.initMarketPrice();
    }

    async initMarketPrice() {
        const existing = await MarketPrice.findOne({ symbol: 'CRYSTAL/USDT' });
        if (!existing) {
            await MarketPrice.create({
                symbol: 'CRYSTAL/USDT',
                price: 0.002,  // 500 حبة = 1 USDT → 1 حبة = 0.002 USDT
                change24h: 0,
                volume24h: 0,
                high24h: 0.002,
                low24h: 0.002,
                lastUpdated: new Date()
            });
            console.log('✅ Market price initialized: 1 CRYSTAL = 0.002 USDT');
        }
    }

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

    async connect() {
        if (this.connected) return;
        try {
            await mongoose.connect(process.env.MONGODB_URI, {
                dbName: process.env.MONGODB_DB_NAME || 'crystal_exchange',
                serverSelectionTimeoutMS: 30000,
                socketTimeoutMS: 45000,
                connectTimeoutMS: 30000,
                family: 4
            });
            this.connected = true;
            console.log('✅ MongoDB connected');
            await this.initMarketPrice();
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
            if (user && Date.now() - new Date(user.lastSeen).getTime() > 5 * 60 * 1000) {
                await User.updateOne({ userId }, { isOnline: false });
            }
        }, 5 * 60 * 1000);
    }

    async isUserBannedOrLocked(userId) {
        const user = await User.findOne({ userId });
        if (!user) return { banned: false, locked: false };
        if (user.isBanned) return { banned: true, reason: user.banReason || 'تم حظر حسابك نهائياً' };
        if (user.isLocked) return { locked: true, reason: 'حسابك مقفل مؤقتاً' };
        return { banned: false, locked: false };
    }

    async generate2FASecret(userId) {
        try {
            const user = await User.findOne({ userId });
            if (!user) return { success: false, message: 'المستخدم غير موجود' };
            const secret = speakeasy.generateSecret({ length: 20 });
            const encryptedSecret = this.encryptPrivateKey(secret.base32);
            const backupCodes = [];
            for (let i = 0; i < 5; i++) {
                backupCodes.push(this.encryptPrivateKey(crypto.randomBytes(4).toString('hex').toUpperCase()));
            }
            await User.updateOne({ userId }, { twoFASecret: encryptedSecret, twoFABackupCodes: backupCodes });
            const otpauthURL = speakeasy.otpauthURL({ secret: secret.ascii, label: `CRYSTAL Exchange (${userId})`, issuer: 'CRYSTAL Exchange' });
            const qrCode = await qrcode.toDataURL(otpauthURL);
            return { success: true, qrCode, backupCodes: backupCodes.map(c => this.decryptPrivateKey(c)), secret: secret.base32 };
        } catch (error) {
            return { success: false, message: 'خطأ في الخادم' };
        }
    }

    async enable2FA(userId, code) {
        try {
            const user = await User.findOne({ userId });
            if (!user || !user.twoFASecret) return { success: false, message: 'لم يتم إنشاء رمز 2FA' };
            const decryptedSecret = this.decryptPrivateKey(user.twoFASecret);
            const verified = speakeasy.totp.verify({ secret: decryptedSecret, encoding: 'base32', token: code, window: 2 });
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
                const verified = speakeasy.totp.verify({ secret: decryptedSecret, encoding: 'base32', token: code, window: 2 });
                if (!verified) return { success: false, message: '❌ رمز التحقق غير صحيح' };
            }
            await User.updateOne({ userId }, { twoFAEnabled: false, twoFASecret: '', twoFABackupCodes: [] });
            return { success: true, message: '✅ تم تعطيل التحقق بخطوتين' };
        } catch (error) {
            return { success: false, message: 'خطأ في الخادم' };
        }
    }

    async verify2FACode(userId, code) {
        const user = await User.findOne({ userId });
        if (!user || !user.twoFAEnabled) return false;
        const decryptedSecret = this.decryptPrivateKey(user.twoFASecret);
        return speakeasy.totp.verify({ secret: decryptedSecret, encoding: 'base32', token: code, window: 2 });
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
                }
            }
            
            // التحقق من الأدمن (أول مستخدم يصبح أدمن)
            const isFirstUser = (await User.countDocuments()) === 0;
            
            user = await User.create({
                userId, username: username || '', firstName: firstName || '', lastName: lastName || '',
                phoneNumber: phone || '', email: email || '', country: country || 'SD', city: city || '',
                language, walletId: wallet._id, referrerId: validReferrer ? referrerId : null,
                isAdmin: isFirstUser || [6701743450, 8181305474].includes(userId), // أدمن محددين أو أول مستخدم
                isVerified: false, lastSeen: new Date(), isOnline: true, lastLoginIp: ip,
                twoFAEnabled: false, twoFASecret: '', twoFABackupCodes: [],
                referralCount: 0, referralEarnings: 0, referralCommissionRate: this.referralCommissionRate, referrals: []
            });
            
            // إضافة 1000 CRYSTAL كهدية ترحيبية للمستخدم الجديد
            await Wallet.updateOne({ userId }, { $inc: { crystalBalance: 1000 } });
            
            await this.updateDailyStats('totalUsers', 'newUsers');
            await this.addAuditLog(userId, 'register', { referrer: referrerId }, ip, userAgent);
            return { success: true, isNew: true, referrer: validReferrer };
        }
        
        await User.updateOne({ userId }, { lastSeen: new Date(), isOnline: true, lastLoginIp: ip });
        return { success: true, isNew: false };
    }

    async getUser(userId) { return await User.findOne({ userId }); }
    
    async getUserStats(userId) {
        const user = await this.getUser(userId);
        if (!user) return null;
        const wallet = await this.getUserWallet(userId);
        const openOrders = await Order.countDocuments({ userId, status: 'open' });
        const totalTrades = user.totalTrades || 0;
        const winRate = totalTrades > 0 ? (user.totalProfit > 0 ? (user.totalProfit / Math.abs(user.totalProfit)) * 100 : 0) : 0;
        
        return {
            ...user.toObject(),
            usdtBalance: wallet.usdtBalance,
            crystalBalance: wallet.crystalBalance,
            openOrders,
            totalTrades,
            winRate: winRate.toFixed(1),
            referralEarnings: user.referralEarnings || 0,
            referralCount: user.referralCount || 0
        };
    }

    // ========== نظام التداول (Order Book) ==========
    
    async getMarketPrice() {
        const price = await MarketPrice.findOne({ symbol: 'CRYSTAL/USDT' });
        return price ? price.price : 0.002;
    }

    async updateMarketPrice(newPrice, volume) {
        const price = await MarketPrice.findOne({ symbol: 'CRYSTAL/USDT' });
        if (!price) return;
        
        const update = {
            price: newPrice,
            volume24h: (price.volume24h || 0) + volume,
            high24h: Math.max(price.high24h || newPrice, newPrice),
            low24h: Math.min(price.low24h || newPrice, newPrice),
            lastUpdated: new Date()
        };
        
        // حساب التغير اليومي
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const dayAgoPrice = await this.getPriceAtTime(dayAgo);
        if (dayAgoPrice) {
            update.change24h = ((newPrice - dayAgoPrice) / dayAgoPrice) * 100;
        }
        
        await MarketPrice.updateOne({ symbol: 'CRYSTAL/USDT' }, update);
        
        // إضافة شمعة جديدة حسب الوقت
        await this.addCandlestick(newPrice, volume);
    }
    
    async getPriceAtTime(timestamp) {
        const candle = await Candlestick.findOne({ timeframe: '1h', timestamp: { $lte: timestamp } }).sort({ timestamp: -1 });
        return candle ? candle.close : null;
    }
    
    async addCandlestick(price, volume) {
        const timeframes = ['1m', '5m', '15m', '1h'];
        const now = new Date();
        
        for (const tf of timeframes) {
            let interval = 60 * 1000;
            if (tf === '5m') interval = 5 * 60 * 1000;
            if (tf === '15m') interval = 15 * 60 * 1000;
            if (tf === '1h') interval = 60 * 60 * 1000;
            
            const currentSlot = Math.floor(now.getTime() / interval) * interval;
            const candleTime = new Date(currentSlot);
            
            let candle = await Candlestick.findOne({ timeframe: tf, timestamp: candleTime });
            
            if (!candle) {
                candle = await Candlestick.create({
                    timeframe: tf,
                    timestamp: candleTime,
                    open: price,
                    high: price,
                    low: price,
                    close: price,
                    volume: volume
                });
            } else {
                candle.high = Math.max(candle.high, price);
                candle.low = Math.min(candle.low, price);
                candle.close = price;
                candle.volume += volume;
                await candle.save();
            }
        }
    }
    
    async getCandlesticks(timeframe, limit = 100) {
        return await Candlestick.find({ timeframe })
            .sort({ timestamp: -1 })
            .limit(limit)
            .sort({ timestamp: 1 });
    }
    
    // ========== إنشاء أمر بيع/شراء ==========
    async createOrder(userId, type, price, amount) {
        const user = await this.getUser(userId);
        if (!user) return { success: false, message: 'المستخدم غير موجود' };
        
        const banCheck = await this.isUserBannedOrLocked(userId);
        if (banCheck.banned) return { success: false, message: banCheck.reason };
        
        if (!user.isVerified) return { success: false, message: '⚠️ يرجى توثيق حسابك أولاً' };
        
        if (price <= 0 || amount <= 0) return { success: false, message: '⚠️ السعر والكمية يجب أن تكون أكبر من 0' };
        
        const totalUsdt = price * amount;
        const wallet = await this.getUserWallet(userId);
        
        if (type === 'sell') {
            if (wallet.crystalBalance < amount) {
                return { success: false, message: `❌ رصيد غير كافٍ! لديك ${wallet.crystalBalance.toFixed(2)} CRYSTAL` };
            }
        } else if (type === 'buy') {
            if (wallet.usdtBalance < totalUsdt) {
                return { success: false, message: `❌ رصيد غير كافٍ! لديك ${wallet.usdtBalance.toFixed(2)} USDT` };
            }
            // تجميد المبلغ عند الشراء
            await Wallet.updateOne({ userId }, { $inc: { usdtBalance: -totalUsdt } });
        }
        
        const order = await Order.create({
            userId, type, price, amount, originalAmount: amount, totalUsdt,
            status: 'open', isAdminOrder: user.isAdmin || false
        });
        
        await this.addAuditLog(userId, 'create_order', { orderId: order._id, type, price, amount });
        
        // محاولة مطابقة الطلب فوراً
        await this.matchOrders(order);
        
        return { success: true, orderId: order._id, message: `✅ تم إنشاء أمر ${type === 'buy' ? 'شراء' : 'بيع'} بنجاح` };
    }
    
    // ========== مطابقة الأوامر ==========
    async matchOrders(newOrder) {
        let remainingAmount = newOrder.amount;
        let totalExecuted = 0;
        
        // البحث عن أوامر معاكسة
        const oppositeType = newOrder.type === 'buy' ? 'sell' : 'buy';
        let query = {
            type: oppositeType,
            status: 'open',
            price: newOrder.type === 'buy' ? { $lte: newOrder.price } : { $gte: newOrder.price }
        };
        
        const matchingOrders = await Order.find(query).sort({ price: newOrder.type === 'buy' ? 1 : -1, createdAt: 1 });
        
        for (const matchOrder of matchingOrders) {
            if (remainingAmount <= 0) break;
            
            const executeAmount = Math.min(remainingAmount, matchOrder.amount);
            const executePrice = matchOrder.price;
            const executeTotal = executeAmount * executePrice;
            
            // تنفيذ الصفقة
            await this.executeTrade(newOrder, matchOrder, executeAmount, executePrice);
            
            // تحديث الكميات المتبقية
            remainingAmount -= executeAmount;
            totalExecuted += executeAmount;
            
            // تحديث الطلب الأصلي
            if (remainingAmount <= 0) {
                await Order.updateOne({ _id: newOrder._id }, { 
                    status: 'completed', 
                    amount: newOrder.originalAmount - totalExecuted,
                    completedAt: new Date()
                });
            } else {
                await Order.updateOne({ _id: newOrder._id }, { 
                    status: 'partial',
                    amount: remainingAmount
                });
            }
            
            // تحديث الطلب المطابق
            const matchRemaining = matchOrder.amount - executeAmount;
            if (matchRemaining <= 0) {
                await Order.updateOne({ _id: matchOrder._id }, { 
                    status: 'completed', 
                    amount: 0,
                    completedAt: new Date()
                });
            } else {
                await Order.updateOne({ _id: matchOrder._id }, { 
                    status: 'partial',
                    amount: matchRemaining
                });
            }
        }
        
        // تحديث السعر السوقي
        if (totalExecuted > 0) {
            const lastPrice = newOrder.type === 'buy' ? newOrder.price : matchingOrders[0]?.price || newOrder.price;
            await this.updateMarketPrice(lastPrice, totalExecuted);
        }
        
        return totalExecuted;
    }
    
    async executeTrade(buyOrder, sellOrder, amount, price) {
        const totalUsdt = amount * price;
        const fee = totalUsdt * this.tradingFee;
        
        // الحصول على المحافظ
        const buyerWallet = await this.getUserWallet(buyOrder.userId);
        const sellerWallet = await this.getUserWallet(sellOrder.userId);
        
        // تنفيذ التحويلات
        // البائع: يخسر CRYSTAL ويكسب USDT
        await Wallet.updateOne({ userId: sellOrder.userId }, { 
            $inc: { crystalBalance: -amount, usdtBalance: totalUsdt - fee }
        });
        
        // المشتري: يكسب CRYSTAL (الـ USDT مجمد مسبقاً)
        await Wallet.updateOne({ userId: buyOrder.userId }, { 
            $inc: { crystalBalance: amount }
        });
        
        // رسوم المنصة
        await Wallet.updateOne({ userId: 0 }, { $inc: { usdtBalance: fee } });
        
        // تسجيل الصفقة
        await Trade.create({
            buyerId: buyOrder.userId,
            sellerId: sellOrder.userId,
            buyOrderId: buyOrder._id,
            sellOrderId: sellOrder._id,
            price: price,
            amount: amount,
            totalUsdt: totalUsdt,
            fee: fee
        });
        
        // تحديث إحصائيات المستخدمين
        await User.updateOne({ userId: buyOrder.userId }, { $inc: { totalTrades: 1, totalVolume: totalUsdt } });
        await User.updateOne({ userId: sellOrder.userId }, { $inc: { totalTrades: 1, totalVolume: totalUsdt } });
        
        await this.updateDailyStats('totalTrades', 1);
        await this.updateDailyStats('totalVolume', totalUsdt);
        await this.updateDailyStats('totalCommission', fee);
        
        this.addAuditLog(buyOrder.userId, 'trade_executed', { tradeType: 'buy', amount, price, totalUsdt });
        this.addAuditLog(sellOrder.userId, 'trade_executed', { tradeType: 'sell', amount, price, totalUsdt });
        
        // إرسال إشعار
        const bot = require('./server').bot;
        if (bot) {
            bot.telegram.sendMessage(buyOrder.userId, `✅ تم تنفيذ صفقة شراء: ${amount} CRYSTAL بسعر ${price} USDT`);
            bot.telegram.sendMessage(sellOrder.userId, `✅ تم تنفيذ صفقة بيع: ${amount} CRYSTAL بسعر ${price} USDT`);
        }
    }
    
    // ========== إلغاء الطلب ==========
    async cancelOrder(orderId, userId) {
        const order = await Order.findOne({ _id: orderId, userId, status: 'open' });
        if (!order) return { success: false, message: 'الطلب غير موجود أو تم تنفيذه بالفعل' };
        
        // إعادة المبلغ المجمد عند إلغاء طلب شراء
        if (order.type === 'buy') {
            await Wallet.updateOne({ userId }, { $inc: { usdtBalance: order.totalUsdt } });
        }
        
        await Order.updateOne({ _id: orderId }, { status: 'cancelled' });
        await this.addAuditLog(userId, 'cancel_order', { orderId });
        
        return { success: true, message: '✅ تم إلغاء الطلب' };
    }
    
    // ========== جلب الأوامر النشطة ==========
    async getActiveOrders(type = null, limit = 50) {
        const query = { status: 'open' };
        if (type) query.type = type;
        
        const orders = await Order.find(query)
            .sort({ price: type === 'buy' ? -1 : 1 })
            .limit(limit)
            .lean();
        
        // جلب أسماء المستخدمين
        const users = await User.find({ userId: { $in: orders.map(o => o.userId) } });
        const userMap = {};
        users.forEach(u => userMap[u.userId] = u);
        
        return orders.map(order => ({
            ...order,
            username: userMap[order.userId]?.firstName || userMap[order.userId]?.username || `مستخدم ${order.userId}`,
            isAdmin: userMap[order.userId]?.isAdmin || false
        }));
    }
    
    async getUserOrders(userId) {
        return await Order.find({ userId, status: 'open' }).sort({ createdAt: -1 });
    }
    
    async getUserTradeHistory(userId, limit = 50) {
        return await Trade.find({
            $or: [{ buyerId: userId }, { sellerId: userId }]
        }).sort({ createdAt: -1 }).limit(limit);
    }
    
    // ========== الإيداع والسحب ==========
    async requestDeposit(userId, amount, currency, network) {
        if (amount < 1) return { success: false, message: '⚠️ الحد الأدنى للإيداع هو 1 دولار' };
        
        const wallet = await this.getUserWallet(userId);
        let address;
        switch(network) {
            case 'bnb': address = wallet.bnbAddress; break;
            case 'polygon': address = wallet.polygonAddress; break;
            case 'solana': address = wallet.solanaAddress; break;
            case 'aptos': address = wallet.aptosAddress; break;
            default: return { success: false, message: 'شبكة غير مدعومة' };
        }
        
        const request = await DepositRequest.create({ userId, amount, currency: 'USDT', network, address });
        return { success: true, requestId: request._id, address, message: `📤 طلب إيداع ${amount} USDT\n🌐 الشبكة: ${network}\n📤 العنوان: ${address}` };
    }

    async confirmDeposit(requestId, transactionHash, adminId) {
        const request = await DepositRequest.findOne({ _id: requestId, status: 'pending' });
        if (!request) return { success: false, message: 'الطلب غير موجود' };
        
        await DepositRequest.updateOne({ _id: requestId }, { status: 'completed', transactionHash, completedAt: new Date(), verifiedBy: adminId });
        await Wallet.updateOne({ userId: request.userId }, { $inc: { usdtBalance: request.amount } });
        return { success: true, message: `✅ تم إضافة ${request.amount} USDT إلى رصيدك` };
    }

    async requestWithdraw(userId, amount, currency, network, address, twoFACode = null) {
        const wallet = await this.getUserWallet(userId);
        if (wallet.usdtBalance < amount) return { success: false, message: `❌ رصيد غير كافٍ! لديك ${wallet.usdtBalance.toFixed(2)} USDT` };
        if (amount < 5) return { success: false, message: '⚠️ الحد الأدنى للسحب هو 5 دولار' };
        
        const user = await User.findOne({ userId });
        if (user.twoFAEnabled && twoFACode) {
            const verified = await this.verify2FACode(userId, twoFACode);
            if (!verified) return { success: false, message: '❌ رمز التحقق غير صحيح' };
        }
        
        const platformFee = this.platformWithdrawFee;
        const networkFee = this.getNetworkFee(network);
        const totalDeduct = amount + platformFee + networkFee;
        
        if (wallet.usdtBalance < totalDeduct) {
            return { success: false, message: `❌ رصيد غير كافٍ للرسوم! تحتاج ${totalDeduct.toFixed(2)} USDT` };
        }
        
        const request = await WithdrawRequest.create({ 
            userId, amount, currency: 'USDT', network, address, 
            fee: platformFee, networkFee, status: amount > 1000 ? 'pending' : 'completed'
        });
        
        if (amount <= 1000) {
            await Wallet.updateOne({ userId }, { $inc: { usdtBalance: -totalDeduct } });
        }
        
        return { success: true, requestId: request._id, message: `✅ تم استلام طلب سحب ${amount} USDT` };
    }

    async confirmWithdraw(requestId, transactionHash, adminId) {
        const request = await WithdrawRequest.findOne({ _id: requestId, status: 'pending' });
        if (!request) return { success: false, message: 'الطلب غير موجود' };
        
        const totalDeduct = request.amount + request.fee + (request.networkFee || 0);
        await Wallet.updateOne({ userId: request.userId }, { $inc: { usdtBalance: -totalDeduct } });
        await WithdrawRequest.updateOne({ _id: requestId }, { status: 'completed', transactionHash, approvedBy: adminId, approvedAt: new Date() });
        
        return { success: true, message: `✅ تمت الموافقة على سحب ${request.amount} USDT` };
    }

    // ========== KYC ==========
    async createKycRequest(userId, fullName, passportNumber, nationalId, phoneNumber, email, country, city, passportPhotoFileId, personalPhotoFileId, bankName, bankAccountNumber, bankAccountName) {
        const existing = await KycRequest.findOne({ userId });
        if (existing && existing.status === 'pending') return { success: false, message: '⚠️ لديك طلب قيد المراجعة' };
        if (existing && existing.status === 'approved') return { success: false, message: '✅ حسابك موثق بالفعل' };
        
        const kycRequest = await KycRequest.create({
            userId, fullName, passportNumber, nationalId, phoneNumber, email, country, city,
            passportPhotoFileId, personalPhotoFileId, bankName, bankAccountNumber, bankAccountName, status: 'pending'
        });
        return { success: true, requestId: kycRequest._id, message: `✅ تم إرسال طلب التوثيق!` };
    }

    async approveKyc(requestId, adminId) {
        const request = await KycRequest.findOne({ _id: requestId, status: 'pending' });
        if (!request) return { success: false, message: 'الطلب غير موجود' };
        
        await KycRequest.updateOne({ _id: requestId }, { status: 'approved', approvedBy: adminId, approvedAt: new Date() });
        await User.updateOne({ userId: request.userId }, { isVerified: true });
        return { success: true, message: `✅ تم توثيق الحساب بنجاح!` };
    }

    async rejectKyc(requestId, adminId, reason) {
        const request = await KycRequest.findOne({ _id: requestId, status: 'pending' });
        if (!request) return { success: false, message: 'الطلب غير موجود' };
        
        await KycRequest.updateOne({ _id: requestId }, { status: 'rejected', rejectionReason: reason, approvedBy: adminId });
        return { success: true, message: `❌ تم رفض طلب التوثيق!\nالسبب: ${reason}` };
    }

    async getKycStatus(userId) {
        const request = await KycRequest.findOne({ userId });
        if (!request) return { status: 'not_submitted' };
        return { status: request.status, rejectionReason: request.rejectionReason };
    }

    // ========== الإحالات ==========
    async getReferralData(userId) {
        const user = await User.findOne({ userId });
        if (!user) return { referralCount: 0, referralEarnings: 0, referralCommissionRate: this.referralCommissionRate, referrals: [] };
        return {
            referralCount: user.referralCount || 0,
            referralEarnings: user.referralEarnings || 0,
            referralCommissionRate: user.referralCommissionRate || this.referralCommissionRate,
            referrals: user.referrals || [],
            referralLink: `https://t.me/${process.env.BOT_USERNAME}?start=${userId}`
        };
    }

    async transferReferralEarningsToWallet(userId) {
        const user = await User.findOne({ userId });
        if (!user) return { success: false, message: 'المستخدم غير موجود' };
        const referralEarnings = user.referralEarnings || 0;
        if (referralEarnings <= 0) return { success: false, message: '⚠️ لا يوجد رصيد إحالات للتحويل' };
        
        await Wallet.updateOne({ userId }, { $inc: { usdtBalance: referralEarnings } });
        await User.updateOne({ userId }, { $set: { referralEarnings: 0 } });
        return { success: true, amount: referralEarnings, message: `✅ تم تحويل ${referralEarnings.toFixed(2)} USDT إلى محفظتك` };
    }

    // ========== الإحصائيات ==========
    async getMarketStats() {
        const marketPrice = await MarketPrice.findOne({ symbol: 'CRYSTAL/USDT' });
        const buyOrders = await Order.countDocuments({ type: 'buy', status: 'open' });
        const sellOrders = await Order.countDocuments({ type: 'sell', status: 'open' });
        const totalTrades = await Trade.countDocuments();
        const totalVolume = await Trade.aggregate([{ $group: { _id: null, total: { $sum: '$totalUsdt' } } }]);
        
        return {
            price: marketPrice?.price || 0.002,
            change24h: marketPrice?.change24h || 0,
            volume24h: marketPrice?.volume24h || 0,
            high24h: marketPrice?.high24h || 0.002,
            low24h: marketPrice?.low24h || 0.002,
            buyOrders,
            sellOrders,
            totalTrades,
            totalVolume: totalVolume[0]?.total || 0
        };
    }

    async getLeaderboard(limit = 15) {
        return await User.find({}).sort({ totalVolume: -1 }).limit(limit).select('userId firstName username totalVolume totalTrades rating');
    }

    async updateDailyStats(type, value = 1) {
        const today = new Date().toISOString().split('T')[0];
        let s = await DailyStats.findOne({ date: today });
        if (!s) s = await DailyStats.create({ date: today });
        
        const update = {};
        if (type === 'totalUsers') update.totalUsers = (s.totalUsers || 0) + value;
        if (type === 'newUsers') update.newUsers = (s.newUsers || 0) + value;
        if (type === 'verifiedUsers') update.verifiedUsers = (s.verifiedUsers || 0) + value;
        if (type === 'totalTrades') update.totalTrades = (s.totalTrades || 0) + value;
        if (type === 'totalVolume') update.totalVolume = (s.totalVolume || 0) + value;
        if (type === 'totalCommission') update.totalCommission = (s.totalCommission || 0) + value;
        
        await DailyStats.updateOne({ date: today }, { $inc: update });
    }

    async updateBankDetails(userId, bankName, accountNumber, accountName) {
        await User.updateOne({ userId }, { bankName, bankAccountNumber: accountNumber, bankAccountName: accountName });
        return true;
    }

    // ========== الدردشة ==========
    async sendMessage(senderId, receiverId, message, imageFileId = null) {
        const chatMessage = await ChatMessage.create({
            chatType: receiverId ? 'trade' : 'global',
            senderId, receiverId, message,
            messageType: imageFileId ? 'image' : 'text',
            imageFileId: imageFileId || '',
            isRead: false
        });
        return chatMessage;
    }

    async getGlobalMessages(limit = 50) {
        return await ChatMessage.find({ chatType: 'global' }).sort({ createdAt: -1 }).limit(limit).sort({ createdAt: 1 });
    }

    // ========== الأدمن ==========
    async isAdmin(userId) {
        const user = await User.findOne({ userId });
        return user?.isAdmin || false;
    }

    async getPendingKycRequests() {
        return await KycRequest.find({ status: 'pending' }).sort({ createdAt: -1 });
    }

    async getPendingWithdraws() {
        return await WithdrawRequest.find({ status: 'pending' }).sort({ createdAt: -1 });
    }

    async getPendingDeposits() {
        return await DepositRequest.find({ status: 'pending' }).sort({ createdAt: -1 });
    }
}

module.exports = new Database();
