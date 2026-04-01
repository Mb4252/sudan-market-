const mongoose = require('mongoose');
const crypto = require('crypto');
const { ethers } = require('ethers');
const { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } = require('@solana/web3.js');
const { AptosClient, AptosAccount, HexString } = require('aptos');
const CryptoJS = require('crypto-js');
const { User, Wallet, Transaction, UpgradeRequest, PurchaseRequest, P2pOffer, Liquidity, DailyStats, DailyReferralLog } = require('./models');

class Database {
    constructor() {
        this.connected = false;
        this.encryptionKey = process.env.ENCRYPTION_KEY || 'default_key_32_bytes_long!!!';
        
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
            if (!liquidity) await Liquidity.create({ totalLiquidity: 1000000, totalSold: 0 });
        } catch (error) {
            console.error('❌ MongoDB error:', error);
            throw error;
        }
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
                userId, bnbAddress: bnb.address, bnbEncryptedPrivateKey: bnb.encryptedPrivateKey,
                polygonAddress: polygon.address, polygonEncryptedPrivateKey: polygon.encryptedPrivateKey,
                solanaAddress: solana.address, solanaEncryptedPrivateKey: solana.encryptedPrivateKey,
                aptosAddress: aptos.address, aptosEncryptedPrivateKey: aptos.encryptedPrivateKey,
                walletSignature: this.generateSignature(`wallet-${userId}`)
            });
        }
        return wallet;
    }

    async getWalletBalances(userId) {
        const wallet = await this.getUserWallet(userId);
        return {
            bnb: wallet.bnbBalance || 0, polygon: wallet.polygonBalance || 0,
            solana: wallet.solanaBalance || 0, aptos: wallet.aptosBalance || 0,
            total: (wallet.bnbBalance || 0) + (wallet.polygonBalance || 0) + (wallet.solanaBalance || 0) + (wallet.aptosBalance || 0)
        };
    }

    // ========== تسجيل المستخدم ==========
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
        if (!l) l = await Liquidity.create({ totalLiquidity: 1000000, totalSold: 0 });
        return l;
    }

    async getGlobalStats() {
        const stats = await User.aggregate([{ $group: { _id: null, totalUsers: { $sum: 1 }, totalCrystals: { $sum: '$crystalBalance' }, totalMined: { $sum: '$totalMined' }, avgLevel: { $avg: '$miningLevel' }, avgVip: { $avg: '$vipLevel' } } }]);
        const l = await this.getLiquidity();
        return { users: stats[0]?.totalUsers || 0, totalCrystals: stats[0]?.totalCrystals?.toFixed(2) || 0, totalMined: stats[0]?.totalMined?.toFixed(2) || 0, avgLevel: stats[0]?.avgLevel?.toFixed(2) || 1, avgVip: stats[0]?.avgVip?.toFixed(2) || 0, liquidity: l.totalLiquidity, sold: l.totalSold, available: l.totalLiquidity - l.totalSold };
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
