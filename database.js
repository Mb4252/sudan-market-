const mongoose = require('mongoose');
const { User, Transaction, UpgradeRequest, PurchaseRequest, P2pOffer, Liquidity, DailyStats } = require('./models');

class Database {
    constructor() {
        this.connected = false;
    }

    async connect() {
        if (this.connected) return;
        
        try {
            await mongoose.connect(process.env.MONGODB_URI, {
                dbName: process.env.MONGODB_DB_NAME || 'krystal_mining',
                serverSelectionTimeoutMS: 5000
            });
            this.connected = true;
            console.log('✅ MongoDB connected successfully');
            
            const liquidity = await Liquidity.findOne();
            if (!liquidity) {
                await Liquidity.create({ totalLiquidity: 100000, totalSold: 0 });
                console.log('✅ Initial liquidity created');
            }
        } catch (error) {
            console.error('❌ MongoDB connection error:', error);
            throw error;
        }
    }

    // الحصول على نص حسب اللغة
    getText(key, lang) {
        const texts = {
            // النصوص العربية
            ar: {
                welcome: (name, balance, rate, level, daily, limit) => `✨ *مرحباً بك في بوت تعدين CRYSTAL!* ✨\n\n👤 *المستخدم:* ${name}\n💎 *الرصيد:* ${balance.toFixed(2)} CRYSTAL\n💰 *القيمة:* ${(balance * 0.01).toFixed(2)} USDT\n⚡ *معدل التعدين:* ${rate}x\n📈 *المستوى:* ${level}\n📊 *تعدين اليوم:* ${daily}/${limit}\n\n🚀 *ابدأ التعدين الآن!*\n⏰ *التعدين يعمل تلقائياً على مدار 24 ساعة*`,
                miningStarted: (daily, limit, remaining) => `✅ *بدأ التعدين!*\n\n📊 *تم التعدين اليوم:* ${daily}/${limit}\n⏰ *المتبقي اليوم:* ${remaining} كريستال\n\n⚡ *سيتم التعدين تلقائياً كل ساعة حتى تصل للحد اليومي*`,
                miningProgress: (reward, total, remaining) => `⛏️ *تم التعدين!*\n\n💎 *حصلت على:* ${reward} CRYSTAL\n📊 *إجمالي اليوم:* ${total}/700\n💎 *المتبقي:* ${remaining} كريستال`,
                miningComplete: `✅ *أكملت التعدين اليومي!*\n\n🎉 *حصلت على 700 كريستال اليوم*\n⏰ *انتظر حتى الغد للتعدين مرة أخرى*`,
                upgradeSuccess: (newRate, newLevel) => `✅ *تمت الترقية بنجاح!*\n\n⚡ *معدل التعدين الجديد:* ${newRate}x\n📈 *المستوى الجديد:* ${newLevel}`,
                referralReward: (count) => `🎉 *مبروك!*\n\n👥 *لقد وصلت إلى ${count} إحالة*\n💎 *حصلت على 3000 كريستال مكافأة!*`
            },
            // النصوص الإنجليزية
            en: {
                welcome: (name, balance, rate, level, daily, limit) => `✨ *Welcome to CRYSTAL Mining Bot!* ✨\n\n👤 *User:* ${name}\n💎 *Balance:* ${balance.toFixed(2)} CRYSTAL\n💰 *Value:* ${(balance * 0.01).toFixed(2)} USDT\n⚡ *Mining Rate:* ${rate}x\n📈 *Level:* ${level}\n📊 *Today's Mining:* ${daily}/${limit}\n\n🚀 *Start mining now!*\n⏰ *Mining runs automatically for 24 hours*`,
                miningStarted: (daily, limit, remaining) => `✅ *Mining started!*\n\n📊 *Mined today:* ${daily}/${limit}\n⏰ *Remaining today:* ${remaining} CRYSTAL\n\n⚡ *Mining will continue automatically every hour until you reach the daily limit*`,
                miningProgress: (reward, total, remaining) => `⛏️ *Mining completed!*\n\n💎 *You got:* ${reward} CRYSTAL\n📊 *Today's total:* ${total}/700\n💎 *Remaining:* ${remaining} CRYSTAL`,
                miningComplete: `✅ *You've completed today's mining!*\n\n🎉 *You got 700 CRYSTAL today*\n⏰ *Wait until tomorrow to mine again*`,
                upgradeSuccess: (newRate, newLevel) => `✅ *Upgrade successful!*\n\n⚡ *New mining rate:* ${newRate}x\n📈 *New level:* ${newLevel}`,
                referralReward: (count) => `🎉 *Congratulations!*\n\n👥 *You reached ${count} referrals*\n💎 *You got 3000 CRYSTAL bonus!*`
            }
        };
        return texts[lang]?.[key] || texts.ar[key];
    }

    // تسجيل مستخدم جديد
    async registerUser(userId, username, firstName, referrerId = null, language = 'ar') {
        await this.connect();
        
        let user = await User.findOne({ userId });
        
        if (!user) {
            user = await User.create({
                userId,
                username: username || '',
                firstName: firstName || '',
                language,
                miningStartTime: new Date(),
                referrerId
            });
            
            await this.updateDailyStats('totalUsers');
            
            if (referrerId) {
                await this.updateReferralReward(referrerId);
            }
            return true;
        }
        return false;
    }

    // تحديث مكافأة الإحالة (10 إحالات = 3000 كريستال)
    async updateReferralReward(referrerId) {
        const referrer = await User.findOne({ userId: referrerId });
        if (!referrer) return false;
        
        const newCount = (referrer.referralCount || 0) + 1;
        await User.updateOne({ userId: referrerId }, { referralCount: newCount });
        
        if (newCount === 10) {
            await this.addCrystals(referrerId, 3000, 'مكافأة إحالة 10 أشخاص');
            
            const text = this.getText('referralReward', referrer.language);
            return { success: true, message: text.replace('{count}', newCount) };
        }
        return false;
    }

    // الحصول على مستخدم
    async getUser(userId) {
        await this.connect();
        return await User.findOne({ userId });
    }

    // إضافة كريستال
    async addCrystals(userId, amount, reason) {
        await this.connect();
        
        await User.updateOne({ userId }, { $inc: { crystalBalance: amount, totalMined: amount } });
        
        await Transaction.create({
            userId,
            type: 'reward',
            amount,
            status: 'completed',
            description: reason
        });
        
        return true;
    }

    // حساب المكافأة التراكمية (700 كريستال خلال 24 ساعة)
    async calculateMiningReward(user) {
        const now = new Date();
        const startTime = user.miningStartTime || now;
        const elapsedHours = Math.min(24, (now - startTime) / (1000 * 60 * 60));
        
        // الحد الأقصى 700 كريستال على 24 ساعة
        const maxReward = 700;
        const rewardPerHour = maxReward / 24;
        
        let expectedReward = rewardPerHour * elapsedHours;
        let alreadyMined = user.dailyMined || 0;
        
        let newReward = Math.min(maxReward - alreadyMined, expectedReward - alreadyMined);
        newReward = Math.max(0, Math.floor(newReward * 10) / 10);
        
        // تطبيق معدل التعدين
        newReward = newReward * user.miningRate;
        
        return {
            reward: Math.min(maxReward - alreadyMined, newReward),
            totalMined: alreadyMined + newReward,
            remaining: maxReward - (alreadyMined + newReward),
            completed: alreadyMined + newReward >= maxReward
        };
    }

    // عملية التعدين (700 كريستال خلال 24 ساعة)
    async mine(userId) {
        await this.connect();
        
        const user = await User.findOne({ userId });
        if (!user) {
            return { success: false, message: 'المستخدم غير موجود' };
        }

        const now = new Date();
        let lastMine = user.lastMiningTime ? new Date(user.lastMiningTime) : new Date(0);
        const hoursSinceLastMine = (now - lastMine) / (1000 * 60 * 60);
        
        // التعدين كل ساعة
        if (hoursSinceLastMine < 1) {
            const remaining = Math.floor((1 - hoursSinceLastMine) * 3600);
            return { 
                success: false, 
                message: `⏰ انتظر ${Math.floor(remaining/60)} دقيقة`,
                remaining: remaining
            };
        }
        
        const rewardData = await this.calculateMiningReward(user);
        
        if (rewardData.completed) {
            return { 
                success: false, 
                message: '✅ أكملت التعدين اليومي! انتظر حتى الغد',
                dailyLimit: true
            };
        }
        
        if (rewardData.reward <= 0) {
            return { 
                success: false, 
                message: '⚠️ لا توجد مكافآت متاحة حالياً',
                dailyLimit: true
            };
        }
        
        await User.updateOne({ userId }, {
            $inc: { 
                crystalBalance: rewardData.reward,
                totalMined: rewardData.reward,
                dailyMined: rewardData.reward
            },
            $set: {
                lastMiningTime: now
            }
        });
        
        await Transaction.create({
            userId,
            type: 'mining',
            amount: rewardData.reward,
            status: 'completed'
        });
        
        await this.updateDailyStats('totalMined', rewardData.reward);
        
        return { 
            success: true, 
            reward: rewardData.reward,
            dailyMined: rewardData.totalMined,
            dailyRemaining: rewardData.remaining,
            completed: rewardData.completed
        };
    }

    // ترقية معدل التعدين
    async upgradeMiningRate(userId) {
        await this.connect();
        
        const user = await User.findOne({ userId });
        if (!user) return { success: false, message: 'المستخدم غير موجود' };
        
        const upgradeCost = 100 * user.miningLevel;
        
        if (user.crystalBalance < upgradeCost) {
            return { 
                success: false, 
                message: `❌ تحتاج إلى ${upgradeCost} كريستال للترقية\n💰 قيمتها: ${(upgradeCost * 0.01).toFixed(2)} USDT`
            };
        }
        
        const newRate = user.miningRate + 0.5;
        const newLevel = user.miningLevel + 1;
        
        await User.updateOne({ userId }, {
            $inc: { crystalBalance: -upgradeCost },
            $set: { miningRate: newRate, miningLevel: newLevel }
        });
        
        await Transaction.create({
            userId,
            type: 'upgrade',
            amount: upgradeCost,
            status: 'completed',
            description: `ترقية من مستوى ${user.miningLevel} إلى ${newLevel}`
        });
        
        return { 
            success: true, 
            message: `✅ تمت الترقية!\n⚡ معدل التعدين الجديد: ${newRate}x\n📈 المستوى: ${newLevel}`,
            newRate,
            newLevel
        };
    }

    // إنشاء عرض P2P
    async createP2pOffer(userId, type, crystalAmount, usdtAmount) {
        await this.connect();
        
        const user = await User.findOne({ userId });
        if (!user) return { success: false, message: 'المستخدم غير موجود' };
        
        if (type === 'sell' && user.crystalBalance < crystalAmount) {
            return { success: false, message: '❌ رصيدك غير كافي للبيع' };
        }
        
        const pricePerCrystal = usdtAmount / crystalAmount;
        
        const offer = await P2pOffer.create({
            userId,
            type,
            crystalAmount,
            usdtAmount,
            pricePerCrystal
        });
        
        return {
            success: true,
            offerId: offer._id,
            message: `✅ تم إنشاء عرض ${type === 'sell' ? 'بيع' : 'شراء'}!\n💎 ${crystalAmount} CRYSTAL\n💰 ${usdtAmount} USDT\n📊 السعر: ${pricePerCrystal.toFixed(4)} USDT/CRYSTAL`
        };
    }

    // الحصول على عروض P2P
    async getP2pOffers(type = null) {
        await this.connect();
        
        const query = { status: 'active' };
        if (type) query.type = type;
        
        const offers = await P2pOffer.find(query)
            .sort({ pricePerCrystal: type === 'sell' ? 1 : -1 })
            .limit(50);
        
        const users = await User.find({ userId: { $in: offers.map(o => o.userId) } });
        const userMap = {};
        users.forEach(u => { userMap[u.userId] = u; });
        
        return offers.map(offer => ({
            id: offer._id,
            userId: offer.userId,
            username: userMap[offer.userId]?.username,
            firstName: userMap[offer.userId]?.firstName,
            type: offer.type,
            crystalAmount: offer.crystalAmount,
            usdtAmount: offer.usdtAmount,
            pricePerCrystal: offer.pricePerCrystal,
            createdAt: offer.createdAt
        }));
    }

    // تنفيذ صفقة P2P
    async executeP2pTrade(offerId, buyerId) {
        await this.connect();
        
        const offer = await P2pOffer.findOne({ _id: offerId, status: 'active' });
        if (!offer) return { success: false, message: 'العرض غير موجود' };
        
        const seller = await User.findOne({ userId: offer.userId });
        const buyer = await User.findOne({ userId: buyerId });
        
        if (!seller || !buyer) return { success: false, message: 'مستخدم غير موجود' };
        
        if (offer.type === 'sell') {
            if (seller.crystalBalance < offer.crystalAmount) {
                await P2pOffer.updateOne({ _id: offerId }, { status: 'cancelled' });
                return { success: false, message: 'البائع ليس لديه الكمية الكافية' };
            }
            
            // تحويل الكريستال من البائع للمشتري
            await User.updateOne({ userId: seller.userId }, { $inc: { crystalBalance: -offer.crystalAmount } });
            await User.updateOne({ userId: buyer.userId }, { $inc: { crystalBalance: offer.crystalAmount } });
            
            await Transaction.create({
                userId: seller.userId,
                type: 'p2p_sale',
                amount: offer.crystalAmount,
                usdtAmount: offer.usdtAmount,
                counterpartyId: buyer.userId,
                status: 'completed'
            });
            
            await Transaction.create({
                userId: buyer.userId,
                type: 'p2p_buy',
                amount: offer.crystalAmount,
                usdtAmount: offer.usdtAmount,
                counterpartyId: seller.userId,
                status: 'completed'
            });
        }
        
        await P2pOffer.updateOne({ _id: offerId }, { 
            status: 'completed', 
            counterpartyId: buyerId 
        });
        
        await this.updateDailyStats('p2pTrades');
        
        return {
            success: true,
            message: `✅ تمت الصفقة بنجاح!\n💎 ${offer.crystalAmount} CRYSTAL\n💰 ${offer.usdtAmount} USDT`
        };
    }

    // تغيير اللغة
    async setLanguage(userId, language) {
        await this.connect();
        await User.updateOne({ userId }, { language });
        return true;
    }

    // باقي الدوال (getLeaderboard, getUserStats, getLiquidity, etc) كما هي مع إضافة دعم اللغة
    async getLeaderboard(limit = 10) {
        await this.connect();
        return await User.find({})
            .sort({ crystalBalance: -1 })
            .limit(limit)
            .select('userId username firstName crystalBalance miningLevel')
            .lean();
    }

    async getUserStats(userId) {
        await this.connect();
        const user = await User.findOne({ userId });
        if (!user) return null;
        
        const referralsCount = await User.countDocuments({ referrerId: userId });
        const usdtValue = user.crystalBalance * 0.01;
        
        return {
            ...user.toObject(),
            referralsCount,
            usdtValue
        };
    }

    async getLiquidity() {
        await this.connect();
        let liquidity = await Liquidity.findOne();
        if (!liquidity) liquidity = await Liquidity.create({ totalLiquidity: 100000, totalSold: 0 });
        return liquidity;
    }

    async updateDailyStats(type, value = 1) {
        const today = new Date().toISOString().split('T')[0];
        let stats = await DailyStats.findOne({ date: today });
        if (!stats) stats = await DailyStats.create({ date: today });
        
        const update = {};
        if (type === 'totalUsers') update.totalUsers = (stats.totalUsers || 0) + 1;
        if (type === 'totalMined') update.totalMined = (stats.totalMined || 0) + value;
        if (type === 'totalPurchases') update.totalPurchases = (stats.totalPurchases || 0) + 1;
        if (type === 'totalUpgrades') update.totalUpgrades = (stats.totalUpgrades || 0) + 1;
        if (type === 'p2pTrades') update.p2pTrades = (stats.p2pTrades || 0) + 1;
        
        await DailyStats.updateOne({ date: today }, { $inc: update });
    }
}

module.exports = new Database();
