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
        this.referralDepositReward = 2000; // مكافأة 5 مدعوين يودعون
        this.channelReward = 100; // مكافأة القناة
        
        this.networkFees = {
            bnb: 0.15, polygon: 0.10, solana: 0.02, aptos: 0.05, trc20: 3.00, erc20: 15.00
        };
        
        this.matchTimeout = 15000;
        this.depositExpiryHours = 24;
        this.fakePriceInterval = null;
        this.lastFakePrice = 0.002;
    }

    getNetworkFee(network) { return this.networkFees[network] || 0.10; }
    generateSignature(data) { return crypto.createHash('sha256').update(`${data}-${Date.now()}-${Math.random()}`).digest('hex'); }
    encryptPrivateKey(privateKey) { return CryptoJS.AES.encrypt(privateKey, this.encryptionKey).toString(); }
    decryptPrivateKey(encryptedKey) { const bytes = CryptoJS.AES.decrypt(encryptedKey, this.encryptionKey); return bytes.toString(CryptoJS.enc.Utf8); }

    async connect() {
        if (this.connected) return;
        try {
            await mongoose.connect(process.env.MONGODB_URI, {
                dbName: process.env.MONGODB_DB_NAME || 'crystal_exchange',
                serverSelectionTimeoutMS: 30000, socketTimeoutMS: 45000, connectTimeoutMS: 30000,
                family: 4, maxPoolSize: 10, minPoolSize: 2
            });
            this.connected = true;
            console.log('✅ MongoDB connected');
            await this.initMarketPrice();
            await this.createIndexes();
            const fixedOrders = await this.fixStuckOrders();
            if (fixedOrders > 0) console.log(`🔧 تم تصحيح ${fixedOrders} أوامر`);
            const balanceCheck = await this.validateBalances();
            if (!balanceCheck.isValid) { console.error('⚠️ تناقض في الأرصدة'); await this.ensureAdminHasSupply(); }
            await this.cancelExpiredDeposits();
            setInterval(() => this.cancelExpiredDeposits(), 6 * 60 * 60 * 1000);
        } catch (error) { console.error('❌ MongoDB error:', error); throw error; }
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
            console.log('✅ Indexes created');
        } catch (e) { console.log('⚠️ Index warning:', e.message); }
    }

    async initMarketPrice() {
        try {
            const existing = await MarketPrice.findOne({ symbol: 'CRYSTAL/USDT' });
            if (!existing) {
                await MarketPrice.create({ symbol: 'CRYSTAL/USDT', price: 0.002, displayPrice: 0.002, change24h: 0, volume24h: 0, high24h: 0.002, low24h: 0.002, lastUpdated: new Date(), lastFakeUpdate: new Date() });
                console.log('✅ Market price initialized');
            }
        } catch (e) { console.error('⚠️ Market price error:', e.message); }
    }

    async ensureAdminHasSupply() {
        try {
            for (const adminId of ADMIN_IDS) {
                const user = await User.findOne({ userId: adminId });
                if (user && user.isAdmin) {
                    const wallet = await Wallet.findOne({ userId: adminId });
                    if (!wallet) continue;
                    const circulating = await this.getCirculatingSupply();
                    const frozen = (await Order.aggregate([{ $match: { type: 'sell', status: { $in: ['open', 'partial'] } } }, { $group: { _id: null, totalFrozen: { $sum: '$amount' } } }]))[0]?.totalFrozen || 0;
                    const available = circulating + frozen + wallet.crystalBalance;
                    const diff = this.totalCrystalSupply - available;
                    if (Math.abs(diff) > 0.01 && diff > 0 && wallet.crystalBalance < this.totalCrystalSupply) {
                        await Wallet.updateOne({ userId: adminId }, { $inc: { crystalBalance: diff } });
                        console.log(`👑 تم تصحيح رصيد الأدمن ${adminId}: +${diff.toFixed(2)} CRYSTAL`);
                    }
                }
            }
        } catch (e) { console.error('ensureAdminHasSupply error:', e.message); }
    }

    // ====================================================================
    // مكافأة الاشتراك في القناة
    // ====================================================================

    async giveChannelReward(userId) {
        try {
            const user = await User.findOne({ userId });
            if (!user) return { success: false, message: '⚠️ سجل أولاً' };
            
            if (user.channelRewardClaimed) {
                return { success: false, message: '⚠️ لقد حصلت على المكافأة مسبقاً!' };
            }
            
            await Wallet.updateOne({ userId }, { $inc: { crystalBalance: this.channelReward } });
            await User.updateOne({ userId }, { channelRewardClaimed: true });
            
            console.log(`🎁 مكافأة قناة: ${userId} +${this.channelReward} CRYSTAL`);
            
            if (global.botInstance) {
                try {
                    await global.botInstance.telegram.sendMessage(userId, 
                        `🎁 *تمت إضافة ${this.channelReward} CRYSTAL* إلى رصيدك!\n📢 شكراً لاشتراكك في القناة`,
                        { parse_mode: 'Markdown' }
                    );
                } catch(e) {}
            }
            
            return { success: true, message: `🎁 تمت إضافة ${this.channelReward} CRYSTAL إلى رصيدك!` };
        } catch (e) { return { success: false, message: '❌ حدث خطأ' }; }
    }

    // ====================================================================
    // حركة وهمية
    // ====================================================================

    async startFakePriceMovement() {
        if (this.fakePriceInterval) return;
        const mp = await MarketPrice.findOne({ symbol: 'CRYSTAL/USDT' });
        if (mp) this.lastFakePrice = mp.price;
        console.log('📊 بدء حركة السعر الوهمية...');
        await this.fakePriceTick();
        this.fakePriceInterval = setInterval(() => this.fakePriceTick(), 5000);
    }

    async stopFakePriceMovement() { if (this.fakePriceInterval) { clearInterval(this.fakePriceInterval); this.fakePriceInterval = null; } }

    async fakePriceTick() {
        try {
            const mp = await MarketPrice.findOne({ symbol: 'CRYSTAL/USDT' }); if (!mp) return;
            const fakePrice = Math.max(0.0001, mp.price + (Math.random() - 0.5) * 2 * mp.price * 0.005);
            await MarketPrice.updateOne({ symbol: 'CRYSTAL/USDT' }, { $set: { displayPrice: parseFloat(fakePrice.toFixed(6)), lastFakeUpdate: new Date() } });
            await this.addFakeCandlestick(fakePrice, mp.price, new Date());
            this.lastFakePrice = fakePrice;
        } catch (e) {}
    }

    async addFakeCandlestick(fakePrice, realPrice, timestamp) {
        try {
            const timeframes = ['1m', '5m', '15m', '1h', '4h', '1d'];
            for (const tf of timeframes) {
                let interval = 60*1000; if (tf==='5m') interval=5*60*1000; if (tf==='15m') interval=15*60*1000; if (tf==='1h') interval=60*60*1000; if (tf==='4h') interval=4*60*60*1000; if (tf==='1d') interval=24*60*60*1000;
                const candleTime = new Date(Math.floor(timestamp.getTime()/interval)*interval);
                let candle = await Candlestick.findOne({ timeframe: tf, timestamp: candleTime, isReal: false });
                if (!candle) {
                    await Candlestick.create({ timeframe: tf, timestamp: candleTime, open: this.lastFakePrice||fakePrice, high: Math.max(this.lastFakePrice||fakePrice, fakePrice), low: Math.min(this.lastFakePrice||fakePrice, fakePrice), close: fakePrice, volume: Math.random()*10, isReal: false });
                } else {
                    candle.high = Math.max(candle.high, fakePrice); candle.low = Math.min(candle.low, fakePrice); candle.close = fakePrice; candle.volume += Math.random()*5; await candle.save();
                }
            }
        } catch (e) {}
    }

    // ====================================================================
    // تصحيح
    // ====================================================================

    async fixStuckOrders() {
        try {
            const openOrders = await Order.find({ status: { $in: ['open', 'partial'] } }); let fixed = 0;
            for (const o of openOrders) {
                const w = await Wallet.findOne({ userId: o.userId }); if (!w) continue;
                if (o.type==='sell' && w.crystalBalance >= o.amount) { await Wallet.updateOne({ userId: o.userId }, { $inc: { crystalBalance: -o.amount } }); fixed++; }
                else if (o.type==='buy') { const tn = (o.amount*o.price)*(1+this.tradingFee); if (w.usdtBalance >= tn) { await Wallet.updateOne({ userId: o.userId }, { $inc: { usdtBalance: -tn } }); fixed++; } }
            }
            return fixed;
        } catch (e) { return 0; }
    }

    async validateBalances() {
        try {
            const circulating = await this.getCirculatingSupply();
            const frozen = (await Order.aggregate([{ $match: { type:'sell', status:{$in:['open','partial']} } }, { $group: { _id:null, total:{$sum:'$amount'} } }]))[0]?.total || 0;
            let adminTotal = 0; for (const id of ADMIN_IDS) { const b = await this.getAdminBalance(id); adminTotal += b.crystalBalance; }
            const total = circulating + frozen + adminTotal;
            if (Math.abs(total-this.totalCrystalSupply) > 1) await this.ensureAdminHasSupply();
            return { totalSupply: this.totalCrystalSupply, circulating, frozen, adminBalance: adminTotal, total, isValid: Math.abs(total-this.totalCrystalSupply)<=1 };
        } catch (e) { return { isValid: false, totalSupply: this.totalCrystalSupply }; }
    }

    async cancelExpiredDeposits() { try { await DepositRequest.updateMany({ status:'pending', expiresAt:{$lt:new Date()} }, { $set:{ status:'expired', rejectionReason:'انتهت الصلاحية' } }); } catch(e) {} }

    async addAuditLog(userId, action, details = {}, ip = '', userAgent = '') { try { await AuditLog.create({ userId, action, details, ip, userAgent, timestamp: new Date() }); } catch(e) {} }

    // ====================================================================
    // مستخدمين
    // ====================================================================
    
    async isUserBannedOrLocked(userId) { try { const u = await User.findOne({ userId }); if (!u) return { banned:false, locked:false }; if (u.isBanned) return { banned:true, reason:u.banReason||'تم حظرك' }; if (u.isLocked) return { locked:true, reason:'حسابك مقفل' }; return { banned:false, locked:false }; } catch(e) { return { banned:false, locked:false }; } }

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
                    isAdmin: isAdminUser, isVerified: false, channelRewardClaimed: false,
                    referralDepositCount: 0, referralMilestoneReached: false,
                    lastSeen: new Date(), isOnline: true, lastLoginIp: ip,
                    twoFAEnabled: false, twoFASecret: '', twoFABackupCodes: [],
                    referralCount: 0, referralEarnings: 0, referralCommissionRate: this.referralCommissionRate,
                    referrals: [], totalTrades: 0, totalVolume: 0, totalProfit: 0, rating: 5.0
                });
                
                if (isAdminUser) {
                    const aw = await Wallet.findOne({ userId });
                    if (aw && aw.crystalBalance === 0) {
                        await Wallet.updateOne({ userId }, { $inc: { crystalBalance: this.totalCrystalSupply } });
                    }
                }
                
                await this.updateDailyStats('totalUsers', 1);
                return { success: true, isNew: true, isAdmin: isAdminUser, message: isAdminUser ? '👑 أهلاً بالأدمن!' : '✅ تم إنشاء حسابك!' };
            }
            await User.updateOne({ userId }, { lastSeen: new Date(), isOnline: true, lastLoginIp: ip });
            return { success: true, isNew: false, message: '👋 أهلاً بعودتك!' };
        } catch (error) { return { success: false, message: '❌ حدث خطأ في التسجيل' }; }
    }

    async getUser(userId) { try { return await User.findOne({ userId }); } catch(e) { return null; } }

    async getUserStats(userId) {
        try { const u = await this.getUser(userId); if (!u) return null; const w = await this.getUserWallet(userId); const oo = await Order.countDocuments({ userId, status:{$in:['open','partial']} }); return { ...u.toObject(), usdtBalance: w.usdtBalance||0, crystalBalance: w.crystalBalance||0, openOrders: oo, totalTrades: u.totalTrades||0 }; } catch(e) { return null; }
    }

    async banUser(userId, reason) { try { await User.updateOne({ userId }, { isBanned:true, banReason:reason }); const oo = await Order.find({ userId, status:{$in:['open','partial']} }); for (const o of oo) await this.cancelOrder(o._id, userId); return { success:true, message:`🚫 تم حظر ${userId}` }; } catch(e) { return { success:false, message:'❌ خطأ' }; } }
    async unbanUser(userId) { try { await User.updateOne({ userId }, { isBanned:false, banReason:'' }); return { success:true, message:`✅ تم فك حظر ${userId}` }; } catch(e) { return { success:false, message:'❌ خطأ' }; } }

    // ====================================================================
    // 2FA
    // ====================================================================
    
    async generate2FASecret(userId) { try { const u = await User.findOne({ userId }); if (!u) return { success:false, message:'غير موجود' }; const s = speakeasy.generateSecret({ length:20 }); const bc = []; for (let i=0;i<5;i++) bc.push(crypto.randomBytes(4).toString('hex').toUpperCase()); await User.updateOne({ userId }, { twoFASecret: this.encryptPrivateKey(s.base32), twoFABackupCodes: bc.map(c=>this.encryptPrivateKey(c)) }); const qr = await qrcode.toDataURL(speakeasy.otpauthURL({ secret:s.ascii, label:`CRYSTAL (${userId})`, issuer:'CRYSTAL Exchange' })); return { success:true, qrCode:qr, backupCodes:bc, secret:s.base32 }; } catch(e) { return { success:false, message:'خطأ' }; } }
    async enable2FA(userId, code) { try { const u = await User.findOne({ userId }); if (!u||!u.twoFASecret) return { success:false, message:'لم يتم إنشاء 2FA' }; if (!speakeasy.totp.verify({ secret:this.decryptPrivateKey(u.twoFASecret), encoding:'base32', token:code, window:2 })) return { success:false, message:'❌ رمز خطأ' }; await User.updateOne({ userId }, { twoFAEnabled:true }); return { success:true, message:'✅ تم التفعيل' }; } catch(e) { return { success:false, message:'خطأ' }; } }
    async disable2FA(userId, code) { try { const u = await User.findOne({ userId }); if (!u) return { success:false, message:'غير موجود' }; if (u.twoFAEnabled && u.twoFASecret && !speakeasy.totp.verify({ secret:this.decryptPrivateKey(u.twoFASecret), encoding:'base32', token:code, window:2 })) return { success:false, message:'❌ رمز خطأ' }; await User.updateOne({ userId }, { twoFAEnabled:false, twoFASecret:'', twoFABackupCodes:[] }); return { success:true, message:'✅ تم التعطيل' }; } catch(e) { return { success:false, message:'خطأ' }; } }
    async verify2FACode(userId, code) { try { const u = await User.findOne({ userId }); if (!u||!u.twoFAEnabled) return true; return speakeasy.totp.verify({ secret:this.decryptPrivateKey(u.twoFASecret), encoding:'base32', token:code, window:2 }); } catch(e) { return false; } }

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
                wallet = await Wallet.create({ userId, usdtBalance:0, crystalBalance:0, bnbAddress:bnb.address, bnbEncryptedPrivateKey:bnb.encryptedPrivateKey, polygonAddress:polygon.address, polygonEncryptedPrivateKey:polygon.encryptedPrivateKey, solanaAddress:solana.address, solanaEncryptedPrivateKey:solana.encryptedPrivateKey, aptosAddress:aptos.address, aptosEncryptedPrivateKey:aptos.encryptedPrivateKey, walletSignature:this.generateSignature(`wallet-${userId}`) });
            }
            return wallet;
        } catch(e) { throw e; }
    }

    // ====================================================================
    // أسعار وشموع
    // ====================================================================
    
    async getMarketPrice() { try { const p = await MarketPrice.findOne({ symbol:'CRYSTAL/USDT' }); return p ? (p.displayPrice||p.price) : 0.002; } catch(e) { return 0.002; } }
    async getRealMarketPrice() { try { const p = await MarketPrice.findOne({ symbol:'CRYSTAL/USDT' }); return p ? p.price : 0.002; } catch(e) { return 0.002; } }

    async updateMarketPrice(newPrice, volume) {
        try { const p = await MarketPrice.findOne({ symbol:'CRYSTAL/USDT' }); if (!p) return; const u = { price:newPrice, displayPrice:newPrice, volume24h:(p.volume24h||0)+volume, high24h:Math.max(p.high24h||newPrice,newPrice), low24h:Math.min(p.low24h||newPrice,newPrice), lastUpdated:new Date() }; const dp = await this.getPriceAtTime(new Date(Date.now()-24*60*60*1000)); if (dp&&dp>0) u.change24h = ((newPrice-dp)/dp)*100; await MarketPrice.updateOne({ symbol:'CRYSTAL/USDT' }, u); this.addCandlestick(newPrice, volume, true).catch(()=>{}); } catch(e) {}
    }

    async getPriceAtTime(ts) { try { const c = await Candlestick.findOne({ timeframe:'1h', timestamp:{$lte:ts}, isReal:true }).sort({ timestamp:-1 }); return c ? c.close : null; } catch(e) { return null; } }

    async addCandlestick(price, volume, isReal=true) {
        try { const tfs = ['1m','5m','15m','1h','4h','1d']; const now = new Date(); for (const tf of tfs) { let iv=60*1000; if (tf==='5m') iv=5*60*1000; if (tf==='15m') iv=15*60*1000; if (tf==='1h') iv=60*60*1000; if (tf==='4h') iv=4*60*60*1000; if (tf==='1d') iv=24*60*60*1000; const ct = new Date(Math.floor(now.getTime()/iv)*iv); let c = await Candlestick.findOne({ timeframe:tf, timestamp:ct, isReal:true }); if (!c) c = await Candlestick.findOne({ timeframe:tf, timestamp:ct, isReal:false }); if (!c) await Candlestick.create({ timeframe:tf, timestamp:ct, open:price, high:price, low:price, close:price, volume, isReal }); else { c.high=Math.max(c.high,price); c.low=Math.min(c.low,price); c.close=price; c.volume+=volume; if (isReal) c.isReal=true; await c.save(); } } } catch(e) {}
    }

    async getCandlesticks(timeframe, limit=100) { try { return (await Candlestick.find({ timeframe }).sort({ timestamp:-1 }).limit(Math.min(limit,200))).reverse(); } catch(e) { return []; } }

    // ====================================================================
    // أوامر
    // ====================================================================
    
    async createOrder(userId, type, price, amount) {
        try {
            const user = await this.getUser(userId); if (!user) return { success:false, message:'⚠️ المستخدم غير موجود' };
            const bc = await this.isUserBannedOrLocked(userId); if (bc.banned) return { success:false, message:bc.reason };
            if (!user.isVerified) return { success:false, message:'⚠️ وثق حسابك أولاً' };
            if (price<=0||amount<=0||amount<1) return { success:false, message:'⚠️ سعر أو كمية غير صالحة' };
            
            const totalUsdt = price*amount; const wallet = await this.getUserWallet(userId);
            
            if (type==='sell') { if (wallet.crystalBalance<amount) return { success:false, message:`❌ رصيد غير كافٍ` }; await Wallet.updateOne({ userId }, { $inc:{ crystalBalance:-amount } }); }
            else { const fee=totalUsdt*this.tradingFee, tn=totalUsdt+fee; if (wallet.usdtBalance<tn) return { success:false, message:`❌ رصيد غير كافٍ` }; await Wallet.updateOne({ userId }, { $inc:{ usdtBalance:-tn } }); }
            
            const order = await Order.create({ userId, type, price, amount, originalAmount:amount, totalUsdt, status:'open', isAdminOrder:user.isAdmin||false, createdAt:new Date() });
            try { await Promise.race([this.matchOrders(order), new Promise(r=>setTimeout(()=>r(0),this.matchTimeout))]); } catch(e) {}
            return { success:true, orderId:order._id, message:`✅ تم إنشاء أمر ${type==='buy'?'شراء':'بيع'}` };
        } catch(e) { return { success:false, message:'❌ حدث خطأ' }; }
    }

    async matchOrders(newOrder) {
        let ra = newOrder.amount, te = 0;
        try {
            const isAdmin = await this.isAdmin(newOrder.userId);
            let q = { type:newOrder.type==='buy'?'sell':'buy', status:{$in:['open','partial']} };
            if (!isAdmin) q.userId = { $ne: newOrder.userId };
            q.price = newOrder.type==='buy' ? { $lte:newOrder.price } : { $gte:newOrder.price };
            const mo = await Order.find(q).sort({ price:newOrder.type==='buy'?1:-1, createdAt:1 }).limit(20);
            for (const m of mo) { if (ra<=0.0001) break; const ea = Math.min(ra, m.amount); try { await this.executeTrade(newOrder.type==='buy'?newOrder:m, newOrder.type==='buy'?m:newOrder, ea, m.price); ra-=ea; te+=ea; } catch(e) { continue; } }
            if (te>0) { await Order.updateOne({ _id:newOrder._id }, { status:ra<=0.0001?'completed':'partial', amount:Math.max(0,ra), completedAt:ra<=0.0001?new Date():null }); await this.updateMarketPrice(mo[0]?.price||newOrder.price, te); }
            return te;
        } catch(e) { return te; }
    }

    async executeTrade(bo, so, amount, price) {
        const tu = amount*price, fee = tu*this.tradingFee, nu = tu-fee;
        await Wallet.updateOne({ userId:bo.userId }, { $inc:{ crystalBalance:amount } });
        await Wallet.updateOne({ userId:so.userId }, { $inc:{ usdtBalance:nu } });
        if (bo.type==='buy'&&bo.price>price) { const ref = (bo.price-price)*amount; if (ref>0) await Wallet.updateOne({ userId:bo.userId }, { $inc:{ usdtBalance:ref } }); }
        await Trade.create({ buyerId:bo.userId, sellerId:so.userId, buyOrderId:bo._id, sellOrderId:so._id, price, amount, totalUsdt:tu, fee, createdAt:new Date() });
        const br = bo.amount-amount, sr = so.amount-amount;
        await Order.updateOne({ _id:bo._id }, { status:br<=0.0001?'completed':'partial', amount:Math.max(0,br), completedAt:br<=0.0001?new Date():null });
        await Order.updateOne({ _id:so._id }, { status:sr<=0.0001?'completed':'partial', amount:Math.max(0,sr), completedAt:sr<=0.0001?new Date():null });
        await User.updateOne({ userId:bo.userId }, { $inc:{ totalTrades:1, totalVolume:tu } });
        await User.updateOne({ userId:so.userId }, { $inc:{ totalTrades:1, totalVolume:tu } });
        this.updateDailyStats('totalTrades',1).catch(()=>{}); this.updateDailyStats('totalVolume',tu).catch(()=>{}); this.updateDailyStats('totalCommission',fee).catch(()=>{});
        this.sendTradeNotification(bo.userId,'buy',amount,price).catch(()=>{}); this.sendTradeNotification(so.userId,'sell',amount,price).catch(()=>{});
    }

    async sendTradeNotification(userId, type, amount, price) { try { if (global.botInstance) { let m=''; if (type==='buy') m=`✅ شراء ${amount.toFixed(2)} CRYSTAL`; else if (type==='sell') m=`✅ بيع ${amount.toFixed(2)} CRYSTAL`; else if (type==='deposit') m=`✅ إيداع ${amount} USDT`; else if (type==='withdraw') m=`✅ سحب ${amount} USDT`; else if (type==='kyc_approved') m='✅ تم توثيق حسابك'; if (m) await global.botInstance.telegram.sendMessage(userId, m); } } catch(e) {} }

    async cancelOrder(orderId, userId) { try { const o = await Order.findOne({ _id:orderId, userId, status:{$in:['open','partial']} }); if (!o) return { success:false, message:'⚠️ غير موجود' }; if (o.type==='buy') await Wallet.updateOne({ userId }, { $inc:{ usdtBalance:o.amount*o.price*(1+this.tradingFee) } }); else await Wallet.updateOne({ userId }, { $inc:{ crystalBalance:o.amount } }); await Order.updateOne({ _id:orderId }, { status:'cancelled', cancelledAt:new Date() }); return { success:true, message:'✅ تم الإلغاء' }; } catch(e) { return { success:false, message:'❌ خطأ' }; } }

    async getActiveOrders(type=null, limit=50) { try { const q = { status:{$in:['open','partial']} }; if (type) q.type=type; const orders = await Order.find(q).sort({ price:type==='buy'?-1:1, createdAt:-1 }).limit(Math.min(limit,100)).lean(); const map = new Map(); for (const o of orders) { const k=`${o.price.toFixed(4)}_${o.type}`; if (map.has(k)) { const e=map.get(k); e.amount+=o.amount; e.totalUsdt=e.amount*e.price; e.orderCount++; } else map.set(k,{...o,orderCount:1}); } let r=Array.from(map.values()); if (type==='buy') r.sort((a,b)=>b.price-a.price); else if (type==='sell') r.sort((a,b)=>a.price-b.price); return r.slice(0,limit); } catch(e) { return []; } }
    async getUserOrders(userId) { try { return await Order.find({ userId, status:{$in:['open','partial']} }).sort({ createdAt:-1 }).limit(50); } catch(e) { return []; } }
    async getUserTradeHistory(userId, limit=50) { try { return await Trade.find({ $or:[{ buyerId:userId },{ sellerId:userId }] }).sort({ createdAt:-1 }).limit(Math.min(limit,100)); } catch(e) { return []; } }

    // ====================================================================
    // إيداع
    // ====================================================================
    
    async requestDeposit(userId, amount, currency, network) { try { if (amount<1) return { success:false, message:'⚠️ الحد الأدنى 1 USDT' }; const ex = await DepositRequest.findOne({ userId, status:'pending', createdAt:{$gte:new Date(Date.now()-24*60*60*1000)} }); if (ex) return { success:false, message:'⚠️ لديك طلب معلق' }; const pc = await DepositRequest.countDocuments({ userId, status:'pending' }); if (pc>=3) return { success:false, message:'⚠️ 3 طلبات معلقة' }; const w = await this.getUserWallet(userId); let ad; switch(network) { case 'bnb': ad=w.bnbAddress; break; case 'polygon': ad=w.polygonAddress; break; case 'solana': ad=w.solanaAddress; break; case 'aptos': ad=w.aptosAddress; break; default: return { success:false, message:'⚠️ شبكة غير مدعومة' }; } const r = await DepositRequest.create({ userId, amount, currency:'USDT', network, address:ad, status:'pending', createdAt:new Date(), expiresAt:new Date(Date.now()+this.depositExpiryHours*60*60*1000) }); return { success:true, requestId:r._id, address:ad, message:`📤 أرسل ${amount} USDT` }; } catch(e) { return { success:false, message:'❌ خطأ' }; } }

    async confirmDeposit(requestId, transactionHash, adminId=0) { try { const r = await DepositRequest.findOne({ _id:requestId, status:'pending' }); if (!r) return { success:false, message:'غير موجود' }; await DepositRequest.updateOne({ _id:requestId }, { status:'completed', transactionHash, completedAt:new Date(), verifiedBy:adminId }); await Wallet.updateOne({ userId:r.userId }, { $inc:{ usdtBalance:r.amount } }); await this.checkAndRewardReferrer(r.userId, r.amount); this.sendTradeNotification(r.userId,'deposit',r.amount,0).catch(()=>{}); return { success:true, message:`✅ تم إيداع ${r.amount} USDT` }; } catch(e) { return { success:false, message:'❌ خطأ' }; } }

    // ====================================================================
    // مكافأة الإحالة - 5 مدعوين يودعون = 2000 CRYSTAL
    // ====================================================================

    async checkAndRewardReferrer(userId, depositAmount) {
        try {
            const user = await User.findOne({ userId });
            if (!user || !user.referrerId) return;
            
            const referrerId = user.referrerId;
            const referrer = await User.findOne({ userId: referrerId });
            if (!referrer) return;
            
            // التحقق من أن هذا المستخدم لم تتم مكافأة محيله من قبل
            const alreadyRewarded = await DepositRequest.findOne({
                userId: userId,
                status: 'completed',
                referrerRewarded: true
            });
            
            if (alreadyRewarded) {
                console.log(`⚠️ المستخدم ${userId} تمت مكافأة محيله مسبقاً`);
                return;
            }
            
            // زيادة عدد المدعوين الذين أودعوا
            await User.updateOne(
                { userId: referrerId },
                { $inc: { referralDepositCount: 1 } }
            );
            
            // تعليم أن هذا الإيداع تمت مكافأة المحيل عنه
            await DepositRequest.updateMany(
                { userId: userId, status: 'completed' },
                { $set: { referrerRewarded: true } }
            );
            
            // جلب عدد المدعوين الذين أودعوا
            const updatedReferrer = await User.findOne({ userId: referrerId });
            const depositCount = updatedReferrer.referralDepositCount || 0;
            
            // إذا وصل إلى 5 مدعوين مودعين، يعطى 2000 CRYSTAL
            if (depositCount >= 5 && !updatedReferrer.referralMilestoneReached) {
                await Wallet.updateOne(
                    { userId: referrerId },
                    { $inc: { crystalBalance: this.referralDepositReward } }
                );
                
                await User.updateOne(
                    { userId: referrerId },
                    { 
                        $set: { referralMilestoneReached: true },
                        $inc: { referralEarnings: this.referralDepositReward }
                    }
                );
                
                console.log(`🎁 مكافأة الإحالة: ${referrerId} حصل على ${this.referralDepositReward} CRYSTAL (5 مدعوين أودعوا)`);
                
                // إشعار المحيل
                if (global.botInstance) {
                    try {
                        await global.botInstance.telegram.sendMessage(
                            referrerId,
                            `🎉 *مبروك!*\n\n` +
                            `لقد دعوت *5 أشخاص* وقاموا جميعاً بالإيداع!\n\n` +
                            `🎁 حصلت على *${this.referralDepositReward} CRYSTAL* كمكافأة!\n` +
                            `💰 تمت إضافتها إلى رصيدك`,
                            { parse_mode: 'Markdown' }
                        );
                    } catch(e) {}
                }
            }
        } catch (e) {
            console.error('checkAndRewardReferrer error:', e.message);
        }
    }

    // ====================================================================
    // سحب
    // ====================================================================
    
    async requestWithdraw(userId, amount, currency, network, address, twoFACode=null) { try { const w = await this.getUserWallet(userId); if (amount<5) return { success:false, message:'⚠️ الحد الأدنى 5 USDT' }; const u = await User.findOne({ userId }); if (u&&u.twoFAEnabled) { if (!twoFACode) return { success:false, message:'⚠️ أدخل 2FA' }; if (!await this.verify2FACode(userId, twoFACode)) return { success:false, message:'❌ 2FA خطأ' }; } const pf=this.platformWithdrawFee, nf=this.getNetworkFee(network), td=amount+pf+nf; if (w.usdtBalance<td) return { success:false, message:`❌ رصيد غير كافٍ` }; const r = await WithdrawRequest.create({ userId, amount, currency:'USDT', network, address, fee:pf, networkFee:nf, status:'pending' }); return { success:true, requestId:r._id, message:`✅ طلب سحب ${amount} USDT` }; } catch(e) { return { success:false, message:'❌ خطأ' }; } }

    async confirmWithdraw(requestId, transactionHash, adminId) { try { const r = await WithdrawRequest.findOne({ _id:requestId, status:'pending' }); if (!r) return { success:false, message:'غير موجود' }; const td = r.amount+r.fee+(r.networkFee||0); let tx = transactionHash; if (!tx||tx==='manual_confirm') { try { const sr = await this.sendBlockchainUSDT(r.userId, r.address, r.amount, r.network); if (sr.success) tx=sr.txHash; else return { success:false, message:`❌ ${sr.error}` }; } catch(se) { return { success:false, message:`❌ ${se.message}` }; } } await Wallet.updateOne({ userId:r.userId }, { $inc:{ usdtBalance:-td } }); await WithdrawRequest.updateOne({ _id:requestId }, { status:'completed', transactionHash:tx, approvedBy:adminId, approvedAt:new Date() }); this.sendTradeNotification(r.userId,'withdraw',r.amount,0).catch(()=>{}); return { success:true, message:`✅ سحب ${r.amount} USDT\nTX: ${tx.slice(0,20)}...` }; } catch(e) { return { success:false, message:'❌ خطأ' }; } }

    async sendBlockchainUSDT(userId, toAddress, amount, network) { try { const w = await Wallet.findOne({ userId }); if (!w) return { success:false, error:'محفظة غير موجودة' }; if (network==='bnb') { const pk=this.decryptPrivateKey(w.bnbEncryptedPrivateKey); const p=new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org'); const s=new ethers.Wallet(pk,p); const c=new ethers.Contract('0x55d398326f99059fF775485246999027B3197955',['function transfer(address to, uint256 amount) returns (bool)'],s); const tx=await c.transfer(toAddress, ethers.utils.parseUnits(amount.toString(),18)); await tx.wait(); return { success:true, txHash:tx.hash }; } if (network==='polygon') { const pk=this.decryptPrivateKey(w.polygonEncryptedPrivateKey); const p=new ethers.providers.JsonRpcProvider('https://polygon-rpc.com'); const s=new ethers.Wallet(pk,p); const c=new ethers.Contract('0xc2132D05D31c914a87C6611C10748AEb04B58e8F',['function transfer(address to, uint256 amount) returns (bool)'],s); const tx=await c.transfer(toAddress, ethers.utils.parseUnits(amount.toString(),6)); await tx.wait(); return { success:true, txHash:tx.hash }; } return { success:false, error:`شبكة ${network} غير مدعومة` }; } catch(e) { return { success:false, error:e.message }; } }

    // ====================================================================
    // KYC
    // ====================================================================
    
    async createKycRequest(userId, fullName, passportNumber, nationalId, phoneNumber, email, country, city, passportPhotoFileId, personalPhotoFileId, bankName, bankAccountNumber, bankAccountName) { try { const ex = await KycRequest.findOne({ userId }); if (ex&&ex.status==='pending') return { success:false, message:'⚠️ لديك طلب قيد المراجعة' }; if (ex&&ex.status==='approved') return { success:false, message:'✅ موثق بالفعل' }; await KycRequest.create({ userId, fullName, passportNumber, nationalId, phoneNumber, email, country, city, passportPhotoFileId, personalPhotoFileId, bankName, bankAccountNumber, bankAccountName, status:'pending', createdAt:new Date() }); return { success:true, message:'✅ تم إرسال طلب التوثيق' }; } catch(e) { return { success:false, message:'❌ خطأ' }; } }
    async approveKyc(requestId, adminId) {
    try {
        const r = await KycRequest.findOne({ _id: requestId, status: 'pending' });
        if (!r) return { success: false, message: 'غير موجود' };
        
        await KycRequest.updateOne({ _id: requestId }, { status: 'approved', approvedBy: adminId, approvedAt: new Date() });
        await User.updateOne({ userId: r.userId }, { isVerified: true });
        
        // ✅ مكافأة التوثيق: 100 CRYSTAL
        const user = await User.findOne({ userId: r.userId });
        if (user && !user.kycRewardClaimed) {
            await Wallet.updateOne({ userId: r.userId }, { $inc: { crystalBalance: 100 } });
            await User.updateOne({ userId: r.userId }, { kycRewardClaimed: true });
            console.log(`🎁 مكافأة توثيق: ${r.userId} +100 CRYSTAL`);
        }
        
        this.sendTradeNotification(r.userId, 'kyc_approved', 0, 0).catch(() => {});
        return { success: true, message: '✅ تم التوثيق + 100 CRYSTAL مكافأة!' };
    } catch(e) { return { success: false, message: '❌ خطأ' }; }
}
    async rejectKyc(requestId, adminId, reason) { try { await KycRequest.updateOne({ _id:requestId, status:'pending' }, { status:'rejected', rejectionReason:reason, approvedBy:adminId }); return { success:true, message:'❌ تم الرفض' }; } catch(e) { return { success:false, message:'❌ خطأ' }; } }
    async getKycStatus(userId) { try { const r = await KycRequest.findOne({ userId }).sort({ createdAt:-1 }); return r ? { status:r.status } : { status:'not_submitted' }; } catch(e) { return { status:'not_submitted' }; } }

    // ====================================================================
    // إحالات
    // ====================================================================
    
    async getReferralData(userId) { try { const u = await User.findOne({ userId }); const bot = process.env.BOT_USERNAME||'TradeCrystalBot'; return { referralCount:u?.referralCount||0, referralDepositCount:u?.referralDepositCount||0, referralMilestoneReached:u?.referralMilestoneReached||false, referralEarnings:u?.referralEarnings||0, referrals:u?.referrals||[], referralLink:`https://t.me/${bot}?start=${userId}` }; } catch(e) { return { referralCount:0, referralDepositCount:0, referralMilestoneReached:false, referralEarnings:0, referrals:[], referralLink:'' }; } }
    async transferReferralEarningsToWallet(userId) { try { const u = await User.findOne({ userId }); if (!u) return { success:false, message:'غير موجود' }; const e = u.referralEarnings||0; if (e<=0) return { success:false, message:'⚠️ لا يوجد رصيد' }; await Wallet.updateOne({ userId }, { $inc:{ usdtBalance:e } }); await User.updateOne({ userId }, { $set:{ referralEarnings:0 } }); return { success:true, message:`✅ تم تحويل ${e.toFixed(2)} USDT` }; } catch(e) { return { success:false, message:'❌ خطأ' }; } }

    // ====================================================================
    // عرض وإحصائيات
    // ====================================================================
    
    async getCirculatingSupply() { try { const r = await Wallet.aggregate([{ $match:{ userId:{$nin:ADMIN_IDS} } }, { $group:{ _id:null, total:{$sum:'$crystalBalance'} } }]); return r[0]?.total||0; } catch(e) { return 0; } }
    async getAdminBalance(adminId) { try { const w = await Wallet.findOne({ userId:adminId }); return { crystalBalance:w?.crystalBalance||0, usdtBalance:w?.usdtBalance||0 }; } catch(e) { return { crystalBalance:0, usdtBalance:0 }; } }

    async validateTotalSupply() { try { const c = await this.getCirculatingSupply(); let at=0; for (const id of ADMIN_IDS) { const b=await this.getAdminBalance(id); at+=b.crystalBalance; } const f=(await Order.aggregate([{ $match:{ type:'sell', status:{$in:['open','partial']} } }, { $group:{ _id:null, total:{$sum:'$amount'} } }]))[0]?.total||0; const t=c+f+at; return { isValid:Math.abs(t-this.totalCrystalSupply)<=1, totalSupply:this.totalCrystalSupply, circulating:c, frozen:f, adminBalance:at, remaining:this.totalCrystalSupply-t }; } catch(e) { return { isValid:true, totalSupply:this.totalCrystalSupply, circulating:0, frozen:0, adminBalance:this.totalCrystalSupply, remaining:0 }; } }

    async getMarketStats() { try { const mp=await MarketPrice.findOne({ symbol:'CRYSTAL/USDT' }); const bo=await Order.countDocuments({ type:'buy', status:{$in:['open','partial']} }); const so=await Order.countDocuments({ type:'sell', status:{$in:['open','partial']} }); const tt=await Trade.countDocuments(); const tv=(await Trade.aggregate([{ $group:{ _id:null, total:{$sum:'$totalUsdt'} } }]))[0]?.total||0; const sc=await this.validateTotalSupply(); return { price:mp?.displayPrice||mp?.price||0.002, change24h:mp?.change24h||0, volume24h:mp?.volume24h||0, high24h:mp?.high24h||0.002, low24h:mp?.low24h||0.002, buyOrders:bo, sellOrders:so, totalTrades:tt, totalVolume:tv, totalSupply:sc.totalSupply, circulatingSupply:sc.circulating }; } catch(e) { return { price:0.002, change24h:0, volume24h:0, high24h:0.002, low24h:0.002, buyOrders:0, sellOrders:0, totalTrades:0, totalVolume:0, totalSupply:this.totalCrystalSupply, circulatingSupply:0 }; } }

    async getLeaderboard(limit=15) { try { return await User.find({}).sort({ totalVolume:-1 }).limit(Math.min(limit,50)).select('userId firstName username totalVolume totalTrades rating'); } catch(e) { return []; } }

    async updateDailyStats(type, value=1) { try { const today=new Date().toISOString().split('T')[0]; let s=await DailyStats.findOne({ date:today }); if (!s) s=await DailyStats.create({ date:today, totalUsers:0, newUsers:0, verifiedUsers:0, totalTrades:0, totalVolume:0, totalCommission:0, activeOffers:0, pendingKyc:0 }); const m={ totalUsers:'totalUsers', newUsers:'newUsers', verifiedUsers:'verifiedUsers', totalTrades:'totalTrades', totalVolume:'totalVolume', totalCommission:'totalCommission', activeOffers:'activeOffers', pendingKyc:'pendingKyc' }; if (m[type]) { const u={}; u[m[type]]=(s[m[type]]||0)+value; await DailyStats.updateOne({ date:today }, { $set:u }); } } catch(e) {} }

    async sendMessage(senderId, receiverId, message, imageFileId=null) { try { return await ChatMessage.create({ chatType:receiverId?'trade':'global', senderId, receiverId, message:message||'', messageType:imageFileId?'image':'text', imageFileId:imageFileId||'', isRead:false, createdAt:new Date() }); } catch(e) { return null; } }
    async getGlobalMessages(limit=50) { try { return (await ChatMessage.find({ chatType:'global' }).sort({ createdAt:-1 }).limit(Math.min(limit,100))).reverse(); } catch(e) { return []; } }

    async isAdmin(userId) { try { const u=await User.findOne({ userId }); return u?.isAdmin||false; } catch(e) { return false; } }
    async getPendingKycRequests() { try { return await KycRequest.find({ status:'pending' }).sort({ createdAt:-1 }).limit(50); } catch(e) { return []; } }
    async getPendingWithdraws() { try { return await WithdrawRequest.find({ status:'pending' }).sort({ createdAt:-1 }).limit(50); } catch(e) { return []; } }
    async getPendingDeposits() { try { return await DepositRequest.find({ status:'pending' }).sort({ createdAt:-1 }).limit(50); } catch(e) { return []; } }
}

module.exports = new Database();
