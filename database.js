const mongoose = require('mongoose');
const { User, Transaction, UpgradeRequest, PurchaseRequest, Liquidity, DailyStats } = require('./models');

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

    async registerUser(userId, username, firstName, referrerId = null) {
        await this.connect();
        
        let user = await User.findOne({ userId });
        
        if (!user) {
            const today = new Date().toISOString().split('T')[0];
            user = await User.create({
                userId,
                username: username || '',
                firstName: firstName || '',
                lastMiningDate: today,
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

    async updateReferralReward(referrerId) {
        const referrer = await User.findOne({ userId: referrerId });
        if (!referrer) return false;
        
        const newCount = (referrer.referralCount || 0) + 1;
        await User.updateOne({ userId: referrerId }, { referralCount: newCount });
        
        if (newCount === 5) {
            await this.addCrystals(referrerId, 10, 'مكافأة إحالة 5 أشخاص');
        }
        return true;
    }

    async getUser(userId) {
        await this.connect();
        return await User.findOne({ userId });
    }

    async addCrystals(userId, amount, reason) {
        await this.connect();
        
        await User.updateOne({ userId }, { $inc: { crystalBalance: amount } });
        
        await Transaction.create({
            userId,
            type: 'reward',
            amount,
            status: 'completed',
            description: reason
        });
        
        return true;
    }

    async mine(userId) {
        await this.connect();
        
        const user = await User.findOne({ userId });
        if (!user) {
            return { success: false, message: 'المستخدم غير موجود' };
        }

        const today = new Date().toISOString().split('T')[0];
        const DAILY_LIMIT = parseInt(process.env.DAILY_LIMIT) || 4;
        const MINING_INTERVAL = parseInt(process.env.MINING_INTERVAL_MINUTES) || 60;
        
        let dailyMined = user.dailyMined || 0;
        
        if (user.lastMiningDate !== today) {
            dailyMined = 0;
        }
        
        if (dailyMined >= DAILY_LIMIT) {
            return { 
                success: false, 
                message: `⚠️ لقد وصلت للحد الأقصى اليومي (${DAILY_LIMIT} كريستال)\n⏰ انتظر حتى الغد للتعدين مرة أخرى!`,
                dailyLimit: true 
            };
        }
        
        const now = new Date();
        const lastMine = user.lastMiningTime ? new Date(user.lastMiningTime) : new Date(0);
        const diffMinutes = (now - lastMine) / 1000 / 60;
        
        if (diffMinutes < MINING_INTERVAL && user.lastMiningDate === today) {
            const remaining = Math.floor((MINING_INTERVAL - diffMinutes) * 60);
            return { 
                success: false, 
                remaining: remaining,
                message: `⏰ انتظر ${Math.floor(remaining/60)} دقيقة و ${remaining%60} ثانية`
            };
        }
        
        let reward = Math.floor(Math.random() * 4) + 1;
        
        if (user.miningRate > 1) {
            const bonusChance = Math.random();
            if (bonusChance < 0.3 * (user.miningRate - 1)) {
                reward = Math.min(DAILY_LIMIT, reward + 1);
            }
        }
        
        if (dailyMined + reward > DAILY_LIMIT) {
            reward = DAILY_LIMIT - dailyMined;
        }
        
        const newDailyMined = dailyMined + reward;
        
        await User.updateOne({ userId }, {
            $inc: { crystalBalance: reward, totalMined: reward },
            $set: {
                dailyMined: newDailyMined,
                lastMiningDate: today,
                lastMiningTime: now
            }
        });
        
        await Transaction.create({
            userId,
            type: 'mining',
            amount: reward,
            status: 'completed'
        });
        
        await this.updateDailyStats('totalMined', reward);
        
        return { 
            success: true, 
            reward: reward,
            dailyRemaining: DAILY_LIMIT - newDailyMined,
            dailyMined: newDailyMined
        };
    }

    async requestUpgrade(userId, usdtAmount) {
        await this.connect();
        
        const user = await User.findOne({ userId });
        if (!user) {
            return { success: false, message: 'المستخدم غير موجود' };
        }
        
        const currentLevel = user.miningLevel;
        const requestedLevel = currentLevel + 1;
        
        const request = await UpgradeRequest.create({
            userId,
            currentLevel,
            requestedLevel,
            usdtAmount,
            status: 'pending'
        });
        
        return {
            success: true,
            request_id: request._id,
            current_level: currentLevel,
            requested_level: requestedLevel,
            usdt_amount: usdtAmount,
            message: `✅ *تم إنشاء طلب ترقية* #${request._id.toString().slice(-6)}\n\n📊 *المستوى الحالي:* ${currentLevel}\n📈 *المستوى المطلوب:* ${requestedLevel}\n💰 *المبلغ:* ${usdtAmount} USDT\n📤 *عنوان الدفع:*\n\`${process.env.TRON_ADDRESS}\`\n\n📎 *بعد التحويل، أرسل:*\n\`/confirm_upgrade ${request._id} [رابط المعاملة]\`\n\n⚠️ سيتم مراجعة طلبك من قبل الأدمن`
        };
    }

    async confirmUpgrade(requestId, transactionHash, adminId) {
        await this.connect();
        
        const request = await UpgradeRequest.findOne({ _id: requestId, status: 'pending' });
        if (!request) {
            return { success: false, message: 'الطلب غير موجود أو تم معالجته' };
        }
        
        const newMiningRate = request.currentLevel + 0.5;
        
        await User.updateOne({ userId: request.userId }, {
            $set: {
                miningRate: newMiningRate,
                miningLevel: request.requestedLevel
            }
        });
        
        await UpgradeRequest.updateOne({ _id: requestId }, {
            $set: {
                status: 'approved',
                transactionHash: transactionHash,
                approvedBy: adminId
            }
        });
        
        await Transaction.create({
            userId: request.userId,
            type: 'upgrade',
            amount: request.currentLevel * 100,
            usdtAmount: request.usdtAmount,
            status: 'completed',
            transactionHash: transactionHash,
            description: `ترقية من مستوى ${request.currentLevel} إلى ${request.requestedLevel}`
        });
        
        await Liquidity.updateOne({}, { $inc: { totalUpgrades: 1 } });
        await this.updateDailyStats('totalUpgrades');
        
        return { 
            success: true, 
            message: `✅ *تمت الترقية بنجاح!*\n\n⚡ *معدل التعدين الجديد:* ${newMiningRate}x\n📈 *المستوى الجديد:* ${request.requestedLevel}`,
            user_id: request.userId,
            new_rate: newMiningRate,
            new_level: request.requestedLevel
        };
    }

    async getPendingUpgrades() {
        await this.connect();
        
        const requests = await UpgradeRequest.find({ status: 'pending' })
            .sort({ createdAt: -1 })
            .lean();
        
        const users = await User.find({ userId: { $in: requests.map(r => r.userId) } });
        const userMap = {};
        users.forEach(u => { userMap[u.userId] = u; });
        
        return requests.map(req => ({
            id: req._id,
            userId: req.userId,
            username: userMap[req.userId]?.username,
            firstName: userMap[req.userId]?.firstName,
            currentLevel: req.currentLevel,
            requestedLevel: req.requestedLevel,
            usdtAmount: req.usdtAmount,
            createdAt: req.createdAt
        }));
    }

    async requestPurchase(userId, crystalAmount) {
        await this.connect();
        
        const usdtAmount = crystalAmount * (parseFloat(process.env.CRYSTAL_PRICE) || 0.01);
        const MIN_PURCHASE = 10;
        
        if (usdtAmount < MIN_PURCHASE) {
            return { success: false, message: `الحد الأدنى للشراء هو ${MIN_PURCHASE} USDT` };
        }
        
        const liquidity = await this.getLiquidity();
        const available = liquidity.totalLiquidity - liquidity.totalSold;
        
        if (crystalAmount > available) {
            return { success: false, message: 'السيولة غير كافية حالياً' };
        }
        
        const request = await PurchaseRequest.create({
            userId,
            crystalAmount,
            usdtAmount,
            status: 'pending',
            paymentAddress: process.env.TRON_ADDRESS
        });
        
        return {
            success: true,
            request_id: request._id,
            crystal_amount: crystalAmount,
            usdt_amount: usdtAmount,
            payment_address: process.env.TRON_ADDRESS,
            message: `✅ *تم إنشاء طلب شراء* #${request._id.toString().slice(-6)}\n\n💎 *الكمية:* ${crystalAmount} CRYSTAL\n💰 *المبلغ:* ${usdtAmount} USDT\n📤 *عنوان الدفع:*\n\`${process.env.TRON_ADDRESS}\`\n\n📎 *بعد التحويل، أرسل:*\n\`/confirm_purchase ${request._id} [رابط المعاملة]\``
        };
    }

    async confirmPurchase(requestId, transactionHash, adminId) {
        await this.connect();
        
        const request = await PurchaseRequest.findOne({ _id: requestId, status: 'pending' });
        if (!request) {
            return { success: false, message: 'الطلب غير موجود أو تم معالجته' };
        }
        
        await User.updateOne({ userId: request.userId }, {
            $inc: { crystalBalance: request.crystalAmount }
        });
        
        await PurchaseRequest.updateOne({ _id: requestId }, {
            $set: {
                status: 'completed',
                transactionHash: transactionHash,
                approvedBy: adminId
            }
        });
        
        await Transaction.create({
            userId: request.userId,
            type: 'purchase',
            amount: request.crystalAmount,
            usdtAmount: request.usdtAmount,
            status: 'completed',
            transactionHash: transactionHash,
            description: `شراء ${request.crystalAmount} كريستال`
        });
        
        await Liquidity.updateOne({}, {
            $inc: { totalSold: request.crystalAmount },
            $set: { lastUpdated: new Date() }
        });
        
        await this.updateDailyStats('totalPurchases');
        
        return { 
            success: true, 
            message: `✅ *تمت إضافة ${request.crystalAmount} كريستال إلى رصيدك!*`
        };
    }

    async getPendingPurchases() {
        await this.connect();
        
        const requests = await PurchaseRequest.find({ status: 'pending' })
            .sort({ createdAt: -1 })
            .lean();
        
        const users = await User.find({ userId: { $in: requests.map(r => r.userId) } });
        const userMap = {};
        users.forEach(u => { userMap[u.userId] = u; });
        
        return requests.map(req => ({
            id: req._id,
            userId: req.userId,
            username: userMap[req.userId]?.username,
            firstName: userMap[req.userId]?.firstName,
            crystalAmount: req.crystalAmount,
            usdtAmount: req.usdtAmount,
            createdAt: req.createdAt
        }));
    }

    async getLeaderboard(limit = 10) {
        await this.connect();
        
        return await User.find({})
            .sort({ crystalBalance: -1 })
            .limit(limit)
            .select('userId username firstName crystalBalance totalMined miningLevel')
            .lean();
    }

    async getUserStats(userId) {
        await this.connect();
        
        const user = await User.findOne({ userId });
        if (!user) return null;
        
        const referralsCount = await User.countDocuments({ referrerId: userId });
        const today = new Date().toISOString().split('T')[0];
        const dailyMined = user.lastMiningDate === today ? (user.dailyMined || 0) : 0;
        const DAILY_LIMIT = parseInt(process.env.DAILY_LIMIT) || 4;
        
        return {
            userId: user.userId,
            username: user.username,
            firstName: user.firstName,
            crystalBalance: user.crystalBalance,
            miningRate: user.miningRate,
            miningLevel: user.miningLevel,
            totalMined: user.totalMined,
            dailyMined: dailyMined,
            dailyRemaining: DAILY_LIMIT - dailyMined,
            referralCount: user.referralCount,
            referralsCount: referralsCount,
            createdAt: user.createdAt
        };
    }

    async getLiquidity() {
        await this.connect();
        
        let liquidity = await Liquidity.findOne();
        if (!liquidity) {
            liquidity = await Liquidity.create({ totalLiquidity: 100000, totalSold: 0 });
        }
        return liquidity;
    }

    async getGlobalStats() {
        await this.connect();
        
        const stats = await User.aggregate([
            {
                $group: {
                    _id: null,
                    totalUsers: { $sum: 1 },
                    totalCrystals: { $sum: '$crystalBalance' },
                    totalMined: { $sum: '$totalMined' },
                    avgLevel: { $avg: '$miningLevel' },
                    avgRate: { $avg: '$miningRate' }
                }
            }
        ]);
        
        const liquidity = await this.getLiquidity();
        
        return {
            users: stats[0]?.totalUsers || 0,
            totalCrystals: stats[0]?.totalCrystals?.toFixed(2) || 0,
            totalMined: stats[0]?.totalMined?.toFixed(2) || 0,
            avgLevel: stats[0]?.avgLevel?.toFixed(2) || 1,
            avgRate: stats[0]?.avgRate?.toFixed(2) || 1,
            liquidity: liquidity.totalLiquidity,
            sold: liquidity.totalSold,
            available: liquidity.totalLiquidity - liquidity.totalSold,
            upgrades: liquidity.totalUpgrades || 0
        };
    }

    async updateDailyStats(type, value = 1) {
        const today = new Date().toISOString().split('T')[0];
        
        let stats = await DailyStats.findOne({ date: today });
        if (!stats) {
            stats = await DailyStats.create({ date: today });
        }
        
        const update = {};
        if (type === 'totalUsers') update.totalUsers = stats.totalUsers + 1;
        if (type === 'totalMined') update.totalMined = (stats.totalMined || 0) + value;
        if (type === 'totalPurchases') update.totalPurchases = (stats.totalPurchases || 0) + 1;
        if (type === 'totalUpgrades') update.totalUpgrades = (stats.totalUpgrades || 0) + 1;
        
        await DailyStats.updateOne({ date: today }, { $inc: update });
    }

    async getTodayStats() {
        const today = new Date().toISOString().split('T')[0];
        return await DailyStats.findOne({ date: today });
    }

    async searchUsers(query, limit = 20) {
        await this.connect();
        
        const searchRegex = new RegExp(query, 'i');
        return await User.find({
            $or: [
                { username: searchRegex },
                { firstName: searchRegex }
            ]
        })
        .limit(limit)
        .select('userId username firstName crystalBalance miningLevel')
        .lean();
    }
}

module.exports = new Database();
