const mongoose = require('mongoose');
const crypto = require('crypto');
const { ethers } = require('ethers');
const { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction: SolanaTransaction } = require('@solana/web3.js');
const { AptosClient, AptosAccount, HexString } = require('aptos');
const CryptoJS = require('crypto-js');
const { User, Wallet, Transaction, UpgradeRequest, PurchaseRequest, P2pOffer, TradeBet, PriceLog, Liquidity, DailyStats, DailyReferralLog } = require('./models');

class Database {
    constructor() {
        this.connected = false;
        this.encryptionKey = process.env.ENCRYPTION_KEY || 'default_key_32_bytes_long!!!';
        this.commissionAddress = '0x2a2548117C7113eB807298D74A44d451E330AC95';
        
        this.networks = {
            bnb: { name: 'BNB (BEP-20)', symbol: 'BNB', rpc: 'https://bsc-dataseed.binance.org/', explorer: 'https://bscscan.com/tx/', decimals: 18 },
            polygon: { name: 'POLYGON', symbol: 'MATIC', rpc: 'https://polygon-rpc.com/', explorer: 'https://polygonscan.com/tx/', decimals: 18 },
            solana: { name: 'SOLANA', symbol: 'SOL', rpc: 'https://api.mainnet-beta.solana.com', explorer: 'https://solscan.io/tx/', decimals: 9 },
            aptos: { name: 'APTOS', symbol: 'APT', rpc: 'https://fullnode.mainnet.aptoslabs.com/v1', explorer: 'https://explorer.aptoslabs.com/txn/', decimals: 8 }
        };
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
            await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || 'krystal_mining', serverSelectionTimeoutMS: 5000 });
            this.connected = true;
            console.log('✅ MongoDB connected');
            const liquidity = await Liquidity.findOne();
            if (!liquidity) await Liquidity.create({ totalLiquidity: 1000000, totalSold: 0, commissionAddress: this.commissionAddress });
        } catch (error) {
            console.error('❌ MongoDB error:', error);
            throw error;
        }
    }

    // ========== جلب الأسعار الحقيقية من Binance ==========
    async fetchBinancePrice(symbol) {
        try {
            const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}USDT`);
            const data = await response.json();
            return {
                price: parseFloat(data.lastPrice),
                open: parseFloat(data.openPrice),
                high: parseFloat(data.highPrice),
                low: parseFloat(data.lowPrice),
                volume: parseFloat(data.volume),
                change24h: parseFloat(data.priceChangePercent)
            };
        } catch (error) {
            console.error('Binance API error:', error);
            const lastPrice = await PriceLog.findOne({ currency: symbol }).sort({ timestamp: -1 });
            return {
                price: lastPrice ? lastPrice.price : symbol === 'BTC' ? 65000 : 3500,
                open: lastPrice ? lastPrice.open : symbol === 'BTC' ? 64500 : 3450,
                high: lastPrice ? lastPrice.high : symbol === 'BTC' ? 65500 : 3550,
                low: lastPrice ? lastPrice.low : symbol === 'BTC' ? 64000 : 3400,
                volume: 0,
                change24h: 0
            };
        }
    }

    // جلب الشموع اللحظية (1m, 5m, 15m)
    async fetchCandles(symbol, interval = '1m', limit = 20) {
        try {
            const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=${interval}&limit=${limit}`);
            const data = await response.json();
            return data.map(candle => ({
                time: candle[0],
                open: parseFloat(candle[1]),
                high: parseFloat(candle[2]),
                low: parseFloat(candle[3]),
                close: parseFloat(candle[4]),
                volume: parseFloat(candle[5])
            }));
        } catch (error) {
            console.error('Candles API error:', error);
            return [];
        }
    }

    async getCurrentPrice(currency) {
        const data = await this.fetchBinancePrice(currency);
        await this.logPrice(currency, data.price, data.open, data.high, data.low, data.volume);
        return data.price;
    }

    async getFullPriceData(currency) {
        const data = await this.fetchBinancePrice(currency);
        await this.logPrice(currency, data.price, data.open, data.high, data.low, data.volume);
        return data;
    }

    async logPrice(currency, price, open, high, low, volume) {
        await PriceLog.create({ currency, price, open, high, low, volume, timestamp: new Date() });
    }

    async getCandles(currency, interval = '1m', limit = 20) {
        return await this.fetchCandles(currency, interval, limit);
    }

    // ========== نظام التداول ==========
    async createTradeBet(userId, currency, type, amount, durationSeconds) {
        const user = await this.getUser(userId);
        if (!user) return { success: false, message: 'المستخدم غير موجود' };
        
        const minBet = 10;
        if (amount < minBet) return { success: false, message: `الحد الأدنى للرهان ${minBet} كريستال` };
        
        const feeRate = 0.05; // 5% عمولة
        const fee = amount * feeRate;
        const totalCost = amount + fee;
        
        if (user.crystalBalance < totalCost) {
            return { success: false, message: `❌ رصيد غير كافٍ! تحتاج ${totalCost.toFixed(2)} كريستال (شامل 5% عمولة)` };
        }
        
        const priceData = await this.getFullPriceData(currency);
        const currentPrice = priceData.price;
        const endTime = new Date(Date.now() + (durationSeconds * 1000));
        
        await User.updateOne({ userId }, { $inc: { crystalBalance: -totalCost } });
        
        // تسجيل العمولة
        await Transaction.create({
            userId, type: 'commission', amount: fee,
            description: `عمولة رهان ${currency} - ${amount} كريستال`
        });
        await Liquidity.updateOne({}, { $inc: { totalCommission: fee } });
        await this.updateDailyStats('totalCommission', fee);
        
        const bet = await TradeBet.create({
            userId, type, currency, amount, usdtAmount: amount * 0.01,
            fee, startPrice: currentPrice, duration: durationSeconds, endTime
        });
        
        await Transaction.create({
            userId, type: 'trade_bet', amount: totalCost,
            description: `رهان ${type === 'up' ? 'صاعد ⬆️' : 'هابط ⬇️'} على ${currency} - ${amount} كريستال`
        });
        await this.updateDailyStats('totalBets');
        
        return {
            success: true, betId: bet._id, currency, type, amount, fee, totalCost,
            startPrice: currentPrice, endTime,
            message: `✅ *تم إنشاء رهان!*\n\n💰 *العملة:* ${currency}\n📈 *الاتجاه:* ${type === 'up' ? 'صاعد ⬆️' : 'هابط ⬇️'}\n💎 *المبلغ:* ${amount} CRYSTAL\n💸 *العمولة:* ${fee.toFixed(2)} CRYSTAL\n⏱️ *المدة:* ${durationSeconds} ثانية\n📊 *سعر الافتتاح:* ${currentPrice.toFixed(2)} USDT\n🎯 *نسبة الربح:* 80%\n💰 *الربح المتوقع:* ${(amount * 0.8).toFixed(2)} CRYSTAL`
        };
    }

    async checkActiveBets() {
        const activeBets = await TradeBet.find({ status: 'active', endTime: { $lt: new Date() } });
        let results = [];
        
        for (const bet of activeBets) {
            const priceData = await this.getFullPriceData(bet.currency);
            const currentPrice = priceData.price;
            const isUp = currentPrice > bet.startPrice;
            
            let won = false;
            if (bet.type === 'up' && isUp) won = true;
            if (bet.type === 'down' && !isUp) won = true;
            
            if (won) {
                const profitRate = 0.8; // 80% ربح
                const profit = bet.amount * profitRate;
                const totalWin = bet.amount + profit;
                await User.updateOne({ userId: bet.userId }, { $inc: { crystalBalance: totalWin } });
                
                await TradeBet.updateOne({ _id: bet._id }, {
                    status: 'won', endPrice: currentPrice, result: 'win',
                    profit: profit, completedAt: new Date()
                });
                
                await Transaction.create({
                    userId: bet.userId, type: 'trade_win', amount: totalWin,
                    description: `فوز رهان ${bet.currency} ${bet.type === 'up' ? 'صاعد' : 'هابط'} - ربح ${profit.toFixed(2)} كريستال`
                });
                results.push({ bet, result: 'win', profit });
            } else {
                await TradeBet.updateOne({ _id: bet._id }, {
                    status: 'lost', endPrice: currentPrice, result: 'loss',
                    profit: -bet.amount, completedAt: new Date()
                });
                
                await Transaction.create({
                    userId: bet.userId, type: 'trade_loss', amount: bet.amount,
                    description: `خسارة رهان ${bet.currency} ${bet.type === 'up' ? 'صاعد' : 'هابط'} - خسارة ${bet.amount} كريستال`
                });
                results.push({ bet, result: 'loss', loss: bet.amount });
            }
        }
        return results;
    }

    async getUserBets(userId, limit = 10) {
        return await TradeBet.find({ userId }).sort({ createdAt: -1 }).limit(limit);
    }

    async getBetStats(userId) {
        const bets = await TradeBet.find({ userId });
        const totalBets = bets.length;
        const wonBets = bets.filter(b => b.status === 'won').length;
        const lostBets = bets.filter(b => b.status === 'lost').length;
        const totalProfit = bets.reduce((sum, b) => sum + (b.profit || 0), 0);
        const winRate = totalBets > 0 ? (wonBets / totalBets * 100).toFixed(1) : 0;
        
        return { totalBets, wonBets, lostBets, totalProfit, winRate };
    }

    async getCurrentPrices() {
        const btc = await this.getFullPriceData('BTC');
        const eth = await this.getFullPriceData('ETH');
        return { BTC: btc, ETH: eth, timestamp: new Date() };
    }

    // ========== عمليات الإيداع والسحب مع العمولة ==========
    async recordDepositFee(amount, network) {
        const fee = amount * 0.01; // 1% عمولة إيداع
        await Transaction.create({
            userId: 0, type: 'deposit_fee', amount: fee,
            description: `عمولة إيداع ${network} - ${amount}`
        });
        await Liquidity.updateOne({}, { $inc: { totalCommission: fee } });
        return fee;
    }

    async recordWithdrawFee(amount, network) {
        const fee = amount * 0.02; // 2% عمولة سحب
        await Transaction.create({
            userId: 0, type: 'withdraw_fee', amount: fee,
            description: `عمولة سحب ${network} - ${amount}`
        });
        await Liquidity.updateOne({}, { $inc: { totalCommission: fee } });
        return fee;
    }

    // ========== دوال أخرى (محفظة، تعدين، إلخ) ==========
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
                userId, bnbAddress: bnb.address, bnbEncryptedPrivateKey: bnb.encryptedPrivateKey,
                polygonAddress: polygon.address, polygonEncryptedPrivateKey: polygon.encryptedPrivateKey,
                solanaAddress: solana.address, solanaEncryptedPrivateKey: solana.encryptedPrivateKey,
                aptosAddress: aptos.address, aptosEncryptedPrivateKey: aptos.encryptedPrivateKey,
                walletSignature: this.generateSignature(`wallet-${userId}`)
            });
        }
        return wallet;
    }

    async registerUser(userId, username, firstName, referrerId = null, language = 'ar') {
        await this.connect();
        let user = await User.findOne({ userId });
        if (!user) {
            const wallet = await this.getUserWallet(userId);
            user = await User.create({
                userId, username: username || '', firstName: firstName || '', language,
                miningStartTime: new Date(), miningSignature: this.generateSignature(`mining-${userId}`),
                referralSignature: this.generateSignature(`referral-${userId}`), referrerId, walletId: wallet._id
            });
            await this.updateDailyStats('totalUsers');
            if (referrerId) await this.updateReferralReward(referrerId, userId);
            await this.addCrystals(userId, 10, 'مكافأة ترحيبية');
            return true;
        }
        return false;
    }

    async updateReferralReward(referrerId, referredUserId) {
        const referrer = await User.findOne({ userId: referrerId });
        if (!referrer) return false;
        const today = new Date().toISOString().split('T')[0];
        const todayReferrals = await DailyReferralLog.countDocuments({ date: today, referrerId });
        if (todayReferrals >= 10) return false;
        await DailyReferralLog.create({ date: today, referrerId, referredUserId, signature: this.generateSignature(`ref-${referrerId}-${referredUserId}`) });
        const newCount = (referrer.referralCount || 0) + 1;
        await User.updateOne({ userId: referrerId }, { referralCount: newCount, dailyReferrals: (referrer.dailyReferrals || 0) + 1, lastReferralDate: today });
        await this.updateDailyStats('totalReferrals');
        if (newCount === 10) await this.addCrystals(referrerId, 3000, 'مكافأة إحالة 10 أشخاص');
        return true;
    }

    async getUser(userId) { return await User.findOne({ userId }); }
    
    async addCrystals(userId, amount, reason) {
        await User.updateOne({ userId }, { $inc: { crystalBalance: amount, totalMined: amount } });
        await Transaction.create({ userId, type: 'reward', amount, status: 'completed', signature: this.generateSignature(`reward-${userId}`), description: reason });
        return true;
    }

    // ========== التعدين ==========
    async calculateMiningReward(user) {
        const now = new Date();
        const startTime = user.miningStartTime || now;
        const elapsedHours = Math.min(24, (now - startTime) / (1000 * 60 * 60));
        const maxReward = 70;
        let expectedReward = (maxReward / 24) * elapsedHours;
        let alreadyMined = user.dailyMined || 0;
        let newReward = Math.min(maxReward - alreadyMined, expectedReward - alreadyMined);
        newReward = Math.max(0, Math.floor(newReward * 100) / 100) * (user.miningRate + (user.vipLevel * 0.1));
        const progress = Math.min(100, ((alreadyMined + newReward) / maxReward) * 100);
        return { reward: Math.min(maxReward - alreadyMined, newReward), totalMined: alreadyMined + newReward, remaining: maxReward - (alreadyMined + newReward), completed: alreadyMined + newReward >= maxReward, progress: Math.floor(progress) };
    }

    async mine(userId) {
        const user = await this.getUser(userId);
        if (!user) return { success: false, message: 'المستخدم غير موجود' };
        const now = new Date();
        const lastMine = user.lastMiningTime ? new Date(user.lastMiningTime) : new Date(0);
        if ((now - lastMine) / 1000 / 60 < 1 && user.lastMiningDate === new Date().toISOString().split('T')[0]) {
            const remaining = Math.floor(3600 - (now - lastMine) / 1000);
            return { success: false, message: `⏰ انتظر ${Math.floor(remaining/60)} دقيقة`, remaining };
        }
        const rewardData = await this.calculateMiningReward(user);
        if (rewardData.completed) return { success: false, message: '✅ أكملت التعدين اليومي!' };
        if (rewardData.reward <= 0) return { success: false, message: '⚠️ جاري تجميع الكريستال...' };
        await User.updateOne({ userId }, { $inc: { crystalBalance: rewardData.reward, totalMined: rewardData.reward, dailyMined: rewardData.reward }, $set: { lastMiningTime: now, miningSignature: this.generateSignature(`mining-${userId}`) } });
        await Transaction.create({ userId, type: 'mining', amount: rewardData.reward, status: 'completed' });
        await this.updateDailyStats('totalMined', rewardData.reward);
        await this.updateCombo(userId);
        return { success: true, reward: rewardData.reward, dailyMined: rewardData.totalMined, dailyRemaining: rewardData.remaining, progress: rewardData.progress };
    }

    async updateCombo(userId) {
        const user = await this.getUser(userId);
        if (!user) return;
        const today = new Date().toISOString().split('T')[0];
        let combo = user.comboCount || 0;
        if (user.lastComboDate === today) return;
        if (user.lastComboDate && new Date(user.lastComboDate) >= new Date(Date.now() - 86400000)) combo++; else combo = 1;
        await User.updateOne({ userId }, { comboCount: combo, lastComboDate: today });
        if (combo % 7 === 0) await this.addCrystals(userId, 50 * (combo / 7), `مكافأة كومبو ${combo} يوم`);
        return { combo };
    }

    async completeDailyTask(userId) {
        const user = await this.getUser(userId);
        const today = new Date().toISOString().split('T')[0];
        if (user.dailyTasks?.lastTaskDate === today) return { success: false, message: 'تم إكمال المهمة اليومية بالفعل' };
        let streak = user.dailyTasks?.streak || 0;
        if (user.dailyTasks?.lastTaskDate && new Date(user.dailyTasks.lastTaskDate) >= new Date(Date.now() - 86400000)) streak++; else streak = 1;
        const reward = 20 + (streak * 5);
        await this.addCrystals(userId, reward, `المهمة اليومية - سلسلة ${streak} أيام`);
        await User.updateOne({ userId }, { $set: { 'dailyTasks.completed': true, 'dailyTasks.lastTaskDate': today, 'dailyTasks.streak': streak } });
        await this.updateDailyStats('totalCombo');
        return { success: true, reward, streak };
    }

    async completeTwitterTask(userId) {
        const user = await this.getUser(userId);
        if (user.twitterTaskCompleted) return { success: false, message: '⚠️ لقد أكملت هذه المهمة بالفعل!' };
        await this.addCrystals(userId, 15, 'مكافأة متابعة تويتر');
        await User.updateOne({ userId }, { twitterTaskCompleted: true });
        await this.updateDailyStats('twitterTasks');
        return { success: true, message: '✅ +15 CRYSTAL\n🐦 شكراً لمتابعتنا!', reward: 15 };
    }

    async upgradeVIP(userId) {
        const user = await this.getUser(userId);
        const expNeeded = (user.vipLevel + 1) * 1000;
        if (user.totalMined < expNeeded) return { success: false, message: `تحتاج ${expNeeded - user.totalMined} كريستال إضافي` };
        const newLevel = user.vipLevel + 1;
        await User.updateOne({ userId }, { vipLevel: newLevel });
        await this.addCrystals(userId, newLevel * 100, `مكافأة ترقية VIP المستوى ${newLevel}`);
        return { success: true, newLevel };
    }

    async upgradeMiningRate(userId) {
        const user = await this.getUser(userId);
        const cost = 100 * user.miningLevel;
        if (user.crystalBalance < cost) return { success: false, message: `❌ تحتاج ${cost} كريستال` };
        const newRate = user.miningRate + 0.5;
        await User.updateOne({ userId }, { $inc: { crystalBalance: -cost }, $set: { miningRate: newRate, miningLevel: user.miningLevel + 1 } });
        await Transaction.create({ userId, type: 'upgrade', amount: cost, status: 'completed', description: `ترقية إلى المستوى ${user.miningLevel + 1}` });
        return { success: true, message: `✅ تمت الترقية!\n⚡ معدل التعدين: ${newRate}x` };
    }

    async requestUpgrade(userId, usdtAmount) {
        if (usdtAmount < 3) return { success: false, message: 'الحد الأدنى 3 USDT' };
        const user = await this.getUser(userId);
        const request = await UpgradeRequest.create({ userId, currentLevel: user.miningLevel, requestedLevel: user.miningLevel + Math.floor(usdtAmount / 3), usdtAmount });
        return { success: true, request_id: request._id, message: `✅ طلب ترقية #${request._id.toString().slice(-6)}\n💰 ${usdtAmount} USDT\n📤 أرسل إلى:\n\`${process.env.TRON_ADDRESS || 'TCZ2NGDSvxznADHTvvkedJTcbbGbD5RhfR'}\`` };
    }

    async confirmUpgrade(requestId, transactionHash, adminId) {
        const request = await UpgradeRequest.findOne({ _id: requestId, status: 'pending' });
        if (!request) return { success: false, message: 'الطلب غير موجود' };
        const newRate = request.currentLevel + (request.usdtAmount / 3) * 0.5;
        await User.updateOne({ userId: request.userId }, { $set: { miningRate: newRate, miningLevel: request.requestedLevel } });
        await UpgradeRequest.updateOne({ _id: requestId }, { status: 'approved', transactionHash });
        await Liquidity.updateOne({}, { $inc: { totalUpgrades: 1 } });
        await this.updateDailyStats('totalUpgrades');
        return { success: true, message: `✅ تمت الترقية!\n⚡ معدل التعدين الجديد: ${newRate}x`, user_id: request.userId };
    }

    async requestPurchase(userId, crystalAmount) {
        const usdtAmount = crystalAmount * 0.01;
        if (usdtAmount < 10) return { success: false, message: 'الحد الأدنى 10 USDT' };
        const liquidity = await this.getLiquidity();
        if (crystalAmount > (liquidity.totalLiquidity - liquidity.totalSold)) return { success: false, message: 'السيولة غير كافية' };
        const request = await PurchaseRequest.create({ userId, crystalAmount, usdtAmount, paymentAddress: process.env.TRON_ADDRESS || 'TCZ2NGDSvxznADHTvvkedJTcbbGbD5RhfR' });
        return { success: true, request_id: request._id, crystal_amount: crystalAmount, usdt_amount: usdtAmount, message: `✅ طلب شراء #${request._id.toString().slice(-6)}\n💎 ${crystalAmount} CRYSTAL\n💰 ${usdtAmount} USDT\n📤 أرسل إلى: ${request.paymentAddress}` };
    }

    async confirmPurchase(requestId, transactionHash, adminId) {
        const request = await PurchaseRequest.findOne({ _id: requestId, status: 'pending' });
        if (!request) return { success: false, message: 'الطلب غير موجود' };
        await User.updateOne({ userId: request.userId }, { $inc: { crystalBalance: request.crystalAmount } });
        await PurchaseRequest.updateOne({ _id: requestId }, { status: 'completed', transactionHash });
        await Liquidity.updateOne({}, { $inc: { totalSold: request.crystalAmount } });
        await this.updateDailyStats('totalPurchases');
        return { success: true, message: `✅ تمت إضافة ${request.crystalAmount} كريستال` };
    }

    async createP2pOffer(userId, type, crystalAmount, usdtAmount) {
        if (usdtAmount < 5) return { success: false, message: 'الحد الأدنى 5 USDT' };
        const user = await this.getUser(userId);
        if (type === 'sell' && user.crystalBalance < crystalAmount) return { success: false, message: '❌ رصيدك غير كافي' };
        const offer = await P2pOffer.create({ userId, type, crystalAmount, usdtAmount, pricePerCrystal: usdtAmount / crystalAmount });
        return { success: true, offerId: offer._id, message: `✅ عرض ${type === 'sell' ? 'بيع' : 'شراء'}!\n💎 ${crystalAmount} CRYSTAL\n💰 ${usdtAmount} USDT` };
    }

    async startP2pTrade(offerId, buyerId) {
        const offer = await P2pOffer.findOne({ _id: offerId, status: 'active' });
        if (!offer) return { success: false, message: 'العرض غير موجود' };
        await P2pOffer.updateOne({ _id: offerId }, { status: 'pending', counterpartyId: buyerId });
        return { success: true, offerId: offer._id, crystalAmount: offer.crystalAmount, usdtAmount: offer.usdtAmount, sellerId: offer.userId, message: `🔄 بدء صفقة\n💎 ${offer.crystalAmount} CRYSTAL\n💰 ${offer.usdtAmount} USDT\n📤 أرسل إلى: ${process.env.TRON_ADDRESS}` };
    }

    async sendPaymentProof(offerId, userId, proofImage) {
        const offer = await P2pOffer.findOne({ _id: offerId, status: 'pending', counterpartyId: userId });
        if (!offer) return { success: false, message: 'الطلب غير موجود' };
        await P2pOffer.updateOne({ _id: offerId }, { paymentProof: proofImage, status: 'waiting_release' });
        return { success: true, sellerId: offer.userId, message: '✅ تم استلام إثبات الدفع! بانتظار تأكيد البائع' };
    }

    async releaseCrystals(offerId, sellerId) {
        const offer = await P2pOffer.findOne({ _id: offerId, status: 'waiting_release', userId: sellerId });
        if (!offer) return { success: false, message: 'الطلب غير موجود' };
        const seller = await this.getUser(sellerId);
        const buyer = await this.getUser(offer.counterpartyId);
        if (seller.crystalBalance < offer.crystalAmount) return { success: false, message: '⚠️ رصيد البائع غير كاف' };
        await User.updateOne({ userId: seller.userId }, { $inc: { crystalBalance: -offer.crystalAmount } });
        await User.updateOne({ userId: buyer.userId }, { $inc: { crystalBalance: offer.crystalAmount } });
        await P2pOffer.updateOne({ _id: offerId }, { status: 'completed', completedAt: new Date() });
        await this.updateDailyStats('p2pTrades');
        return { success: true, message: `✅ تم تحرير العملة!\n💎 +${offer.crystalAmount} CRYSTAL`, buyerId: buyer.userId };
    }

    async getP2pOffers(type = null) {
        const query = { status: 'active' };
        if (type) query.type = type;
        return await P2pOffer.find(query).sort({ pricePerCrystal: type === 'sell' ? 1 : -1 }).limit(50).lean();
    }

    async getLeaderboard(limit = 15) {
        return await User.find({}).sort({ crystalBalance: -1 }).limit(limit).select('userId username firstName crystalBalance miningLevel vipLevel').lean();
    }

    async getUserStats(userId) {
        const user = await this.getUser(userId);
        if (!user) return null;
        const today = new Date().toISOString().split('T')[0];
        const dailyMined = user.lastMiningDate === today ? (user.dailyMined || 0) : 0;
        const wallet = await this.getUserWallet(userId);
        return { ...user.toObject(), dailyMined, dailyRemaining: 70 - dailyMined, usdtValue: user.crystalBalance * 0.01, miningProgress: Math.floor((dailyMined / 70) * 100), walletAddresses: { bnb: wallet.bnbAddress, polygon: wallet.polygonAddress, solana: wallet.solanaAddress, aptos: wallet.aptosAddress } };
    }

    async getLiquidity() {
        let l = await Liquidity.findOne();
        if (!l) l = await Liquidity.create({ totalLiquidity: 1000000, totalSold: 0, commissionAddress: this.commissionAddress });
        return l;
    }

    async getGlobalStats() {
        const stats = await User.aggregate([{ $group: { _id: null, totalUsers: { $sum: 1 }, totalCrystals: { $sum: '$crystalBalance' }, totalMined: { $sum: '$totalMined' }, avgLevel: { $avg: '$miningLevel' }, avgVip: { $avg: '$vipLevel' } } }]);
        const l = await this.getLiquidity();
        return { users: stats[0]?.totalUsers || 0, totalCrystals: stats[0]?.totalCrystals?.toFixed(2) || 0, totalMined: stats[0]?.totalMined?.toFixed(2) || 0, avgLevel: stats[0]?.avgLevel?.toFixed(2) || 1, avgVip: stats[0]?.avgVip?.toFixed(2) || 0, liquidity: l.totalLiquidity, sold: l.totalSold, available: l.totalLiquidity - l.totalSold, totalCommission: l.totalCommission || 0 };
    }

    async getTodayStats() { return await DailyStats.findOne({ date: new Date().toISOString().split('T')[0] }); }
    
    async updateDailyStats(type, value = 1) {
        const today = new Date().toISOString().split('T')[0];
        let s = await DailyStats.findOne({ date: today });
        if (!s) s = await DailyStats.create({ date: today });
        const u = {};
        if (type === 'totalUsers') u.totalUsers = (s.totalUsers || 0) + 1;
        if (type === 'totalMined') u.totalMined = (s.totalMined || 0) + value;
        if (type === 'totalPurchases') u.totalPurchases = (s.totalPurchases || 0) + 1;
        if (type === 'totalUpgrades') u.totalUpgrades = (s.totalUpgrades || 0) + 1;
        if (type === 'p2pTrades') u.p2pTrades = (s.p2pTrades || 0) + 1;
        if (type === 'totalReferrals') u.totalReferrals = (s.totalReferrals || 0) + 1;
        if (type === 'twitterTasks') u.twitterTasks = (s.twitterTasks || 0) + 1;
        if (type === 'totalCombo') u.totalCombo = (s.totalCombo || 0) + 1;
        if (type === 'totalBets') u.totalBets = (s.totalBets || 0) + 1;
        if (type === 'totalCommission') u.totalCommission = (s.totalCommission || 0) + value;
        await DailyStats.updateOne({ date: today }, { $inc: u });
    }
    
    async getPendingUpgrades() { return await UpgradeRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).lean(); }
    async getPendingPurchases() { return await PurchaseRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).lean(); }
    
    async searchUsers(query) {
        const regex = new RegExp(query, 'i');
        return await User.find({ $or: [{ username: regex }, { firstName: regex }, { userId: !isNaN(query) ? parseInt(query) : -1 }] }).limit(20).select('userId username firstName crystalBalance miningLevel');
    }
    
    async setLanguage(userId, language) { await User.updateOne({ userId }, { language }); return true; }
}

module.exports = new Database();
