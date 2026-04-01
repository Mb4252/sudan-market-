const mongoose = require('mongoose');
const crypto = require('crypto');
const { ethers } = require('ethers');
const { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction: SolanaTransaction } = require('@solana/web3.js');
const { AptosClient, AptosAccount, HexString } = require('aptos');
const CryptoJS = require('crypto-js');
const cron = require('node-cron');
const { User, Wallet, Transaction, P2pLocalOffer, Trade, WithdrawRequest, Liquidity, DailyStats, Price } = require('./models');

class Database {
    constructor() {
        this.connected = false;
        this.encryptionKey = process.env.ENCRYPTION_KEY;
        this.commissionAddresses = {
            bnb: process.env.COMMISSION_ADDRESS_BNB,
            polygon: process.env.COMMISSION_ADDRESS_POLYGON,
            solana: process.env.COMMISSION_ADDRESS_SOLANA,
            aptos: process.env.COMMISSION_ADDRESS_APTOS
        };
        
        this.networks = {
            bnb: { name: 'BNB (BEP-20)', symbol: 'BNB', rpc: 'https://bsc-dataseed.binance.org/', explorer: 'https://bscscan.com/tx/', decimals: 18 },
            polygon: { name: 'POLYGON', symbol: 'MATIC', rpc: 'https://polygon-rpc.com/', explorer: 'https://polygonscan.com/tx/', decimals: 18 },
            solana: { name: 'SOLANA', symbol: 'SOL', rpc: 'https://api.mainnet-beta.solana.com', explorer: 'https://solscan.io/tx/', decimals: 9 },
            aptos: { name: 'APTOS', symbol: 'APT', rpc: 'https://fullnode.mainnet.aptoslabs.com/v1', explorer: 'https://explorer.aptoslabs.com/txn/', decimals: 8 }
        };
        
        // تحديث سعر الكريستال كل دقيقة بناءً على BTC
        cron.schedule('* * * * *', async () => {
            await this.updateCrystalPrice();
        });
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
            await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || 'krystal_trading', serverSelectionTimeoutMS: 5000 });
            this.connected = true;
            console.log('✅ MongoDB connected');
            
            let liquidity = await Liquidity.findOne();
            if (!liquidity) {
                liquidity = await Liquidity.create({
                    totalCrystalSupply: 30000000,
                    circulatingCrystal: 0,
                    totalUsdLiquidity: 300000,
                    crystalPrice: 0.01,
                    priceHistory: [{ price: 0.01, timestamp: new Date() }]
                });
                console.log('✅ Initial liquidity created');
            }
            
            // جلب أسعار العملات الأولية
            await this.fetchAllPrices();
        } catch (error) {
            console.error('❌ MongoDB error:', error);
            throw error;
        }
    }

    // ========== جلب الأسعار من Binance ==========
    async fetchBinancePrice(symbol) {
        try {
            const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}USDT`);
            const data = await response.json();
            return {
                price: parseFloat(data.lastPrice),
                change24h: parseFloat(data.priceChangePercent),
                high24h: parseFloat(data.highPrice),
                low24h: parseFloat(data.lowPrice),
                volume: parseFloat(data.volume)
            };
        } catch (error) {
            console.error('Binance API error:', error);
            const lastPrice = await Price.findOne({ symbol });
            return {
                price: lastPrice?.price || (symbol === 'BTC' ? 65000 : 3500),
                change24h: lastPrice?.change24h || 0,
                high24h: lastPrice?.high24h || 0,
                low24h: lastPrice?.low24h || 0,
                volume: 0
            };
        }
    }

    async fetchAllPrices() {
        const symbols = ['BTC', 'ETH', 'SOL', 'BNB', 'MATIC', 'APT'];
        for (const symbol of symbols) {
            const data = await this.fetchBinancePrice(symbol);
            await Price.findOneAndUpdate(
                { symbol },
                { 
                    price: data.price,
                    change24h: data.change24h,
                    high24h: data.high24h,
                    low24h: data.low24h,
                    volume: data.volume,
                    timestamp: new Date()
                },
                { upsert: true, new: true }
            );
        }
        console.log('✅ Prices updated');
    }

    // ========== تحديث سعر الكريستال بناءً على BTC ==========
    async updateCrystalPrice() {
        const btcPrice = await this.getPrice('BTC');
        const liquidity = await Liquidity.findOne();
        
        // سعر الكريستال = (سعر BTC / 1000000) * عامل التعديل
        // السعر الأساسي 0.01 دولار عندما BTC = 65000
        const baseBtcPrice = 65000;
        const baseCrystalPrice = 0.01;
        const newPrice = (btcPrice.price / baseBtcPrice) * baseCrystalPrice;
        
        liquidity.crystalPrice = newPrice;
        liquidity.priceHistory.push({ price: newPrice, timestamp: new Date() });
        if (liquidity.priceHistory.length > 1000) liquidity.priceHistory.shift();
        liquidity.lastUpdated = new Date();
        await liquidity.save();
        
        console.log(`💎 Crystal price updated: $${newPrice.toFixed(6)} (BTC: $${btcPrice.price})`);
        return newPrice;
    }

    async getPrice(symbol) {
        return await Price.findOne({ symbol }) || { price: symbol === 'BTC' ? 65000 : 3500, change24h: 0 };
    }

    async getAllPrices() {
        const symbols = ['BTC', 'ETH', 'SOL', 'BNB', 'MATIC', 'APT'];
        const prices = {};
        for (const s of symbols) {
            prices[s] = await this.getPrice(s);
        }
        const liquidity = await Liquidity.findOne();
        prices['CRYSTAL'] = { price: liquidity.crystalPrice, change24h: 0 };
        return prices;
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

    // ========== تسجيل المستخدم ==========
    async registerUser(userId, username, firstName, referrerId = null, language = 'ar') {
        await this.connect();
        let user = await User.findOne({ userId });
        if (!user) {
            const wallet = await this.getUserWallet(userId);
            user = await User.create({
                userId, username: username || '', firstName: firstName || '', language,
                referralSignature: this.generateSignature(`referral-${userId}`),
                referrerId, walletId: wallet._id,
                usdBalance: 0, crystalBalance: 0
            });
            await this.updateDailyStats('totalUsers');
            if (referrerId) await this.updateReferralReward(referrerId, userId);
            await this.addUsdBalance(userId, 10, 'مكافأة ترحيبية');
            return true;
        }
        return false;
    }

    async updateReferralReward(referrerId, referredUserId) {
        const referrer = await User.findOne({ userId: referrerId });
        if (!referrer) return false;
        const today = new Date().toISOString().split('T')[0];
        const todayReferrals = await Transaction.countDocuments({ 
            userId: referrerId, type: 'reward', 
            createdAt: { $gte: new Date(today) } 
        });
        if (todayReferrals >= 10) return false;
        
        const newCount = (referrer.referralCount || 0) + 1;
        await User.updateOne({ userId: referrerId }, { referralCount: newCount });
        await this.updateDailyStats('totalReferrals');
        
        if (newCount === 10) {
            await this.addUsdBalance(referrerId, 30, 'مكافأة إحالة 10 أشخاص');
        }
        return true;
    }

    async getUser(userId) { return await User.findOne({ userId }); }
    
    async addUsdBalance(userId, amount, reason) {
        await User.updateOne({ userId }, { $inc: { usdBalance: amount } });
        await Transaction.create({ userId, type: 'reward', amount, description: reason });
        return true;
    }

    async addCrystalBalance(userId, amount, reason) {
        await User.updateOne({ userId }, { $inc: { crystalBalance: amount } });
        const liquidity = await Liquidity.findOne();
        liquidity.circulatingCrystal += amount;
        await liquidity.save();
        await Transaction.create({ userId, type: 'reward', amount, description: reason });
        return true;
    }

    // ========== التداول ==========
    async trade(userId, type, currency, amountInUsd) {
        const user = await this.getUser(userId);
        if (!user) return { success: false, message: 'المستخدم غير موجود' };
        
        const priceData = await this.getPrice(currency);
        const crystalPrice = (await Liquidity.findOne()).crystalPrice;
        
        let fee = amountInUsd * 0.005; // 0.5% عمولة
        let totalCost = amountInUsd + fee;
        
        if (type === 'buy') {
            if (user.usdBalance < totalCost) {
                return { success: false, message: `❌ رصيد غير كافٍ! تحتاج ${totalCost.toFixed(2)} USD` };
            }
            
            const crystalAmount = amountInUsd / crystalPrice;
            
            await User.updateOne({ userId }, { $inc: { usdBalance: -totalCost, crystalBalance: crystalAmount, totalTraded: amountInUsd } });
            
            // تسجيل العمولة
            await Transaction.create({ userId, type: 'commission', amount: fee, description: `عمولة شراء ${currency}` });
            await this.updateDailyStats('totalCommission', fee);
            
            await Trade.create({ userId, type, currency, amount: crystalAmount, price: crystalPrice, totalUsd: amountInUsd, fee });
            await Transaction.create({ userId, type: 'trade', amount: amountInUsd, description: `شراء ${crystalAmount.toFixed(2)} CRYSTAL بـ ${amountInUsd} USD` });
            await this.updateDailyStats('totalTrades', 1);
            await this.updateDailyStats('totalVolume', amountInUsd);
            
            return { success: true, message: `✅ تم شراء ${crystalAmount.toFixed(2)} CRYSTAL\n💰 المبلغ: ${amountInUsd} USD\n💸 العمولة: ${fee.toFixed(2)} USD\n📊 سعر CRYSTAL: ${crystalPrice.toFixed(6)} USD` };
            
        } else if (type === 'sell') {
            const crystalToSell = amountInUsd / crystalPrice;
            if (user.crystalBalance < crystalToSell) {
                return { success: false, message: `❌ رصيد كريستال غير كافٍ! لديك ${user.crystalBalance.toFixed(2)} CRYSTAL` };
            }
            
            const usdAmount = amountInUsd;
            const totalReceive = usdAmount - fee;
            
            await User.updateOne({ userId }, { $inc: { usdBalance: totalReceive, crystalBalance: -crystalToSell, totalTraded: amountInUsd } });
            
            await Transaction.create({ userId, type: 'commission', amount: fee, description: `عمولة بيع ${currency}` });
            await this.updateDailyStats('totalCommission', fee);
            
            await Trade.create({ userId, type, currency, amount: crystalToSell, price: crystalPrice, totalUsd: amountInUsd, fee });
            await Transaction.create({ userId, type: 'trade', amount: amountInUsd, description: `بيع ${crystalToSell.toFixed(2)} CRYSTAL بـ ${amountInUsd} USD` });
            await this.updateDailyStats('totalTrades', 1);
            await this.updateDailyStats('totalVolume', amountInUsd);
            
            return { success: true, message: `✅ تم بيع ${crystalToSell.toFixed(2)} CRYSTAL\n💰 المبلغ: ${usdAmount} USD\n💸 العمولة: ${fee.toFixed(2)} USD\n📊 المستلم: ${totalReceive.toFixed(2)} USD` };
        }
        
        return { success: false, message: 'نوع غير صحيح' };
    }

    // ========== P2P محلي (مثل Binance P2P) ==========
    async createP2pOffer(userId, type, currency, fiatAmount, crystalAmount, paymentMethod, bankDetails) {
        const user = await this.getUser(userId);
        if (!user) return { success: false, message: 'المستخدم غير موجود' };
        
        const pricePerCrystal = fiatAmount / crystalAmount;
        const liquidity = await Liquidity.findOne();
        
        if (type === 'sell' && user.crystalBalance < crystalAmount) {
            return { success: false, message: '❌ رصيد كريستال غير كافٍ' };
        }
        
        const offer = await P2pLocalOffer.create({
            userId, type, currency, fiatAmount, crystalAmount,
            pricePerCrystal, paymentMethod, bankDetails
        });
        
        return { success: true, offerId: offer._id, message: `✅ عرض ${type === 'sell' ? 'بيع' : 'شراء'}!\n💎 ${crystalAmount} CRYSTAL\n💰 ${fiatAmount} ${currency}\n📊 السعر: ${pricePerCrystal.toFixed(4)} ${currency}/CRYSTAL\n🏦 طريقة الدفع: ${paymentMethod}` };
    }

    async getP2pOffers(type = null, currency = null) {
        const query = { status: 'active' };
        if (type) query.type = type;
        if (currency) query.currency = currency;
        
        const offers = await P2pLocalOffer.find(query)
            .sort({ pricePerCrystal: type === 'sell' ? 1 : -1 })
            .limit(50)
            .lean();
        
        const users = await User.find({ userId: { $in: offers.map(o => o.userId) } });
        const userMap = {};
        users.forEach(u => { userMap[u.userId] = u; });
        
        return offers.map(offer => ({
            ...offer,
            username: userMap[offer.userId]?.username,
            firstName: userMap[offer.userId]?.firstName
        }));
    }

    async startP2pTrade(offerId, buyerId) {
        const offer = await P2pLocalOffer.findOne({ _id: offerId, status: 'active' });
        if (!offer) return { success: false, message: 'العرض غير موجود' };
        
        const buyer = await this.getUser(buyerId);
        const seller = await this.getUser(offer.userId);
        
        if (!buyer || !seller) return { success: false, message: 'مستخدم غير موجود' };
        
        if (offer.type === 'sell') {
            if (seller.crystalBalance < offer.crystalAmount) {
                await P2pLocalOffer.updateOne({ _id: offerId }, { status: 'cancelled' });
                return { success: false, message: 'البائع ليس لديه الكمية الكافية' };
            }
        }
        
        await P2pLocalOffer.updateOne({ _id: offerId }, { status: 'pending', counterpartyId: buyerId });
        
        return {
            success: true,
            offerId: offer._id,
            crystalAmount: offer.crystalAmount,
            fiatAmount: offer.fiatAmount,
            currency: offer.currency,
            sellerId: offer.userId,
            sellerDetails: offer.bankDetails,
            paymentMethod: offer.paymentMethod,
            message: `🔄 بدء صفقة P2P\n💎 ${offer.crystalAmount} CRYSTAL\n💰 ${offer.fiatAmount} ${offer.currency}\n🏦 طريقة الدفع: ${offer.paymentMethod}\n📝 تفاصيل البائع: ${offer.bankDetails}\n\n✅ بعد التحويل، أرسل /send_p2p_proof ${offer._id} [رابط الصورة]`
        };
    }

    async confirmP2pTrade(offerId, buyerId, proofImage) {
        const offer = await P2pLocalOffer.findOne({ _id: offerId, status: 'pending', counterpartyId: buyerId });
        if (!offer) return { success: false, message: 'الطلب غير موجود' };
        
        const buyer = await this.getUser(buyerId);
        const seller = await this.getUser(offer.userId);
        
        if (offer.type === 'sell') {
            // تحويل الكريستال من البائع للمشتري
            await User.updateOne({ userId: seller.userId }, { $inc: { crystalBalance: -offer.crystalAmount } });
            await User.updateOne({ userId: buyer.userId }, { $inc: { crystalBalance: offer.crystalAmount } });
            
            await Transaction.create({
                userId: seller.userId, type: 'p2p_sale', amount: offer.crystalAmount,
                description: `بيع ${offer.crystalAmount} CRYSTAL مقابل ${offer.fiatAmount} ${offer.currency}`
            });
            await Transaction.create({
                userId: buyer.userId, type: 'p2p_buy', amount: offer.crystalAmount,
                description: `شراء ${offer.crystalAmount} CRYSTAL مقابل ${offer.fiatAmount} ${offer.currency}`
            });
        }
        
        await P2pLocalOffer.updateOne({ _id: offerId }, { status: 'completed', completedAt: new Date() });
        await this.updateDailyStats('p2pTrades');
        
        return { success: true, message: `✅ تمت الصفقة بنجاح!\n💎 +${offer.crystalAmount} CRYSTAL\n💰 ${offer.fiatAmount} ${offer.currency}` };
    }

    // ========== إيداع وسحب ==========
    async requestDeposit(userId, amount, currency, network) {
        const user = await this.getUser(userId);
        const wallet = await this.getUserWallet(userId);
        
        let address;
        switch(network) {
            case 'bnb': address = wallet.bnbAddress; break;
            case 'polygon': address = wallet.polygonAddress; break;
            case 'solana': address = wallet.solanaAddress; break;
            case 'aptos': address = wallet.aptosAddress; break;
            default: return { success: false, message: 'شبكة غير مدعومة' };
        }
        
        return {
            success: true,
            address,
            network,
            message: `📤 *إيداع ${currency}* 📤\n\n🌐 *الشبكة:* ${network.toUpperCase()}\n📤 *العنوان:*\n\`${address}\`\n\n⚠️ *ملاحظة:* أرسل فقط ${currency} على شبكة ${network.toUpperCase()}\n📎 بعد الإرسال، أرسل /confirm_deposit [رابط المعاملة]`
        };
    }

    async requestWithdraw(userId, amount, currency, network, address) {
        const user = await this.getUser(userId);
        const wallet = await this.getUserWallet(userId);
        
        let balance;
        switch(network) {
            case 'bnb': balance = wallet.bnbBalance; break;
            case 'polygon': balance = wallet.polygonBalance; break;
            case 'solana': balance = wallet.solanaBalance; break;
            case 'aptos': balance = wallet.aptosBalance; break;
            default: return { success: false, message: 'شبكة غير مدعومة' };
        }
        
        const fee = amount * 0.02; // 2% عمولة سحب
        const totalAmount = amount + fee;
        
        if (balance < totalAmount) {
            return { success: false, message: `❌ رصيد غير كافٍ! الرصيد: ${balance} ${currency}` };
        }
        
        const request = await WithdrawRequest.create({
            userId, amount, currency, network, address, fee
        });
        
        await Transaction.create({
            userId, type: 'withdraw', amount, usdtAmount: fee,
            description: `طلب سحب ${amount} ${currency} إلى ${address}`
        });
        
        return {
            success: true,
            requestId: request._id,
            message: `✅ تم إنشاء طلب سحب #${request._id.toString().slice(-6)}\n💰 ${amount} ${currency}\n💸 العمولة: ${fee.toFixed(4)} ${currency}\n📤 إلى: ${address}\n\n⏳ سيتم مراجعة الطلب من قبل الأدمن`
        };
    }

    async confirmWithdraw(requestId, transactionHash, adminId) {
        const request = await WithdrawRequest.findOne({ _id: requestId, status: 'pending' });
        if (!request) return { success: false, message: 'الطلب غير موجود' };
        
        await WithdrawRequest.updateOne({ _id: requestId }, {
            status: 'completed', transactionHash, approvedBy: adminId
        });
        
        // خصم الرصيد من المحفظة
        // سيتم تنفيذ التحويل الفعلي هنا
        
        return { success: true, message: `✅ تمت الموافقة على السحب #${requestId}` };
    }

    // ========== إحصائيات ==========
    async getLeaderboard(limit = 15) {
        return await User.find({}).sort({ crystalBalance: -1 }).limit(limit).select('userId username firstName crystalBalance usdBalance').lean();
    }

    async getUserStats(userId) {
        const user = await this.getUser(userId);
        if (!user) return null;
        const wallet = await this.getUserWallet(userId);
        const liquidity = await Liquidity.findOne();
        const crystalValue = user.crystalBalance * liquidity.crystalPrice;
        
        return {
            ...user.toObject(),
            usdtValue: user.usdBalance + crystalValue,
            crystalValue,
            crystalPrice: liquidity.crystalPrice,
            walletAddresses: {
                bnb: wallet.bnbAddress,
                polygon: wallet.polygonAddress,
                solana: wallet.solanaAddress,
                aptos: wallet.aptosAddress
            }
        };
    }

    async getLiquidity() {
        let l = await Liquidity.findOne();
        if (!l) l = await Liquidity.create({ totalCrystalSupply: 30000000, circulatingCrystal: 0, totalUsdLiquidity: 300000, crystalPrice: 0.01 });
        return l;
    }

    async getGlobalStats() {
        const stats = await User.aggregate([
            { $group: { _id: null, totalUsers: { $sum: 1 }, totalCrystals: { $sum: '$crystalBalance' }, totalUsd: { $sum: '$usdBalance' }, totalTraded: { $sum: '$totalTraded' } } }
        ]);
        const liquidity = await this.getLiquidity();
        return {
            users: stats[0]?.totalUsers || 0,
            totalCrystals: stats[0]?.totalCrystals?.toFixed(2) || 0,
            totalUsd: stats[0]?.totalUsd?.toFixed(2) || 0,
            totalTraded: stats[0]?.totalTraded?.toFixed(2) || 0,
            circulatingCrystal: liquidity.circulatingCrystal,
            totalSupply: liquidity.totalCrystalSupply,
            crystalPrice: liquidity.crystalPrice
        };
    }

    async getTodayStats() { return await DailyStats.findOne({ date: new Date().toISOString().split('T')[0] }); }
    
    async updateDailyStats(type, value = 1) {
        const today = new Date().toISOString().split('T')[0];
        let s = await DailyStats.findOne({ date: today });
        if (!s) s = await DailyStats.create({ date: today });
        const u = {};
        if (type === 'totalUsers') u.totalUsers = (s.totalUsers || 0) + 1;
        if (type === 'totalTrades') u.totalTrades = (s.totalTrades || 0) + value;
        if (type === 'totalVolume') u.totalVolume = (s.totalVolume || 0) + value;
        if (type === 'totalDeposits') u.totalDeposits = (s.totalDeposits || 0) + value;
        if (type === 'totalWithdraws') u.totalWithdraws = (s.totalWithdraws || 0) + value;
        if (type === 'totalCommission') u.totalCommission = (s.totalCommission || 0) + value;
        if (type === 'p2pTrades') u.p2pTrades = (s.p2pTrades || 0) + value;
        if (type === 'totalReferrals') u.totalReferrals = (s.totalReferrals || 0) + value;
        await DailyStats.updateOne({ date: today }, { $inc: u });
    }
    
    async getPendingWithdraws() { return await WithdrawRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).lean(); }
    async getPendingP2p() { return await P2pLocalOffer.find({ status: 'pending' }).sort({ createdAt: -1 }).lean(); }
    
    async searchUsers(query) {
        const regex = new RegExp(query, 'i');
        return await User.find({ $or: [{ username: regex }, { firstName: regex }, { userId: !isNaN(query) ? parseInt(query) : -1 }] }).limit(20).select('userId username firstName crystalBalance usdBalance');
    }
    
    async setLanguage(userId, language) { await User.updateOne({ userId }, { language }); return true; }
    
    // ========== المهام اليومية ==========
    async completeDailyTask(userId) {
        const user = await this.getUser(userId);
        const today = new Date().toISOString().split('T')[0];
        if (user.dailyTasks?.lastTaskDate === today) return { success: false, message: 'تم إكمال المهمة اليومية بالفعل' };
        let streak = user.dailyTasks?.streak || 0;
        if (user.dailyTasks?.lastTaskDate && new Date(user.dailyTasks.lastTaskDate) >= new Date(Date.now() - 86400000)) streak++; else streak = 1;
        const reward = 5 + (streak * 1); // 5-15 USD
        await this.addUsdBalance(userId, reward, `المهمة اليومية - سلسلة ${streak} أيام`);
        await User.updateOne({ userId }, { $set: { 'dailyTasks.completed': true, 'dailyTasks.lastTaskDate': today, 'dailyTasks.streak': streak } });
        return { success: true, reward, streak };
    }

    async completeTwitterTask(userId) {
        const user = await this.getUser(userId);
        if (user.twitterTaskCompleted) return { success: false, message: '⚠️ لقد أكملت هذه المهمة بالفعل!' };
        await this.addUsdBalance(userId, 15, 'مكافأة متابعة تويتر');
        await User.updateOne({ userId }, { twitterTaskCompleted: true });
        return { success: true, message: '✅ +15 USD\n🐦 شكراً لمتابعتنا!', reward: 15 };
    }
}

module.exports = new Database();
