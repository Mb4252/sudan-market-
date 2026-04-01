const mongoose = require('mongoose');
const crypto = require('crypto');
const { User, Transaction, UpgradeRequest, PurchaseRequest, P2pOffer, Liquidity, DailyStats, DailyReferralLog } = require('./models');

class Database {
    constructor() {
        this.connected = false;
    }

    // إنشاء بصمة فريدة
    generateSignature(data) {
        return crypto.createHash('sha256').update(`${data}-${Date.now()}-${Math.random()}`).digest('hex');
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
                await Liquidity.create({ totalLiquidity: 1000000, totalSold: 0 });
                console.log('✅ Initial liquidity created');
            }
        } catch (error) {
            console.error('❌ MongoDB connection error:', error);
            throw error;
        }
    }

    // الحصول على نص حسب اللغة
    getText(key, lang, params = {}) {
        const texts = {
            ar: {
                welcome: (name, balance, rate, level, daily, limit) => 
                    `✨ *مرحباً بك في بوت تعدين CRYSTAL!* ✨\n\n` +
                    `👤 *المستخدم:* ${name}\n` +
                    `💎 *الرصيد:* ${balance.toFixed(2)} CRYSTAL\n` +
                    `💰 *القيمة:* ${(balance * 0.01).toFixed(2)} USDT\n` +
                    `⚡ *معدل التعدين:* ${rate}x\n` +
                    `📈 *المستوى:* ${level}\n` +
                    `📊 *تعدين اليوم:* ${daily}/${limit}\n\n` +
                    `🚀 *ابدأ التعدين الآن!\n⏰ التعدين التراكمي يعمل على مدار 24 ساعة*`,
                miningStarted: (progress) => 
                    `⛏️ *بدأ التعدين التراكمي!*\n\n` +
                    `📊 *نسبة التقدم:* ${progress}%\n` +
                    `💎 *سيتم تجميع الكريستال تدريجياً حتى تصل إلى 70 كريستال*\n\n` +
                    `⏰ *سيتم التعدين تلقائياً كل ساعة*`,
                miningProgress: (reward, total, progress) => 
                    `⛏️ *تحديث التعدين!*\n\n` +
                    `💎 *تم إضافة:* +${reward} CRYSTAL\n` +
                    `📊 *إجمالي اليوم:* ${total}/70\n` +
                    `📈 *نسبة الإنجاز:* ${progress}%\n` +
                    `💎 *المتبقي:* ${70 - total} كريستال`,
                miningComplete: `✅ *أكملت التعدين اليومي!*\n\n🎉 *حصلت على 70 كريستال اليوم*\n⏰ *انتظر حتى الغد للتعدين مرة أخرى*`,
                upgradeSuccess: (newRate, newLevel) => 
                    `✅ *تمت الترقية بنجاح!*\n\n` +
                    `⚡ *معدل التعدين الجديد:* ${newRate}x\n` +
                    `📈 *المستوى الجديد:* ${newLevel}`,
                upgradeCost: (cost, usdt) => 
                    `💰 *تكلفة الترقية:* ${cost} CRYSTAL\n💵 *قيمتها:* ${usdt} USDT`,
                referralReward: (count) => 
                    `🎉 *مبروك!*\n\n👥 *لقد وصلت إلى ${count} إحالة*\n💎 *حصلت على 3000 كريستال مكافأة!*`,
                referralDailyLimit: `⚠️ *لقد وصلت للحد الأقصى اليومي للإحالات (10 إحالات)*\n⏰ *انتظر حتى الغد*`,
                purchaseRequest: (id, amount, usdt, address) => 
                    `✅ *تم إنشاء طلب شراء* #${id.toString().slice(-6)}\n\n` +
                    `💎 *الكمية:* ${amount} CRYSTAL\n💰 *المبلغ:* ${usdt} USDT\n\n` +
                    `📤 *أرسل المبلغ عبر شبكة TRON (TRC20) إلى:*\n\`${address}\`\n\n` +
                    `🔘 *اضغط على الزر أدناه لنسخ العنوان:*\n\n` +
                    `📎 *بعد التحويل، أرسل:*\n/confirm_purchase ${id} [رابط المعاملة]`,
                upgradeRequest: (id, amount, address) => 
                    `✅ *تم إنشاء طلب ترقية* #${id.toString().slice(-6)}\n\n` +
                    `💰 *المبلغ:* ${amount} USDT\n\n` +
                    `📤 *أرسل المبلغ عبر شبكة TRON (TRC20) إلى:*\n\`${address}\`\n\n` +
                    `🔘 *اضغط على الزر أدناه لنسخ العنوان:*\n\n` +
                    `📎 *بعد التحويل، أرسل:*\n/confirm_upgrade ${id} [رابط المعاملة]`,
                p2pOfferCreated: (type, amount, usdt, price) => 
                    `✅ *تم إنشاء عرض ${type === 'sell' ? 'بيع' : 'شراء'}!*\n\n` +
                    `💎 *الكمية:* ${amount} CRYSTAL\n💰 *السعر:* ${usdt} USDT\n📊 *سعر الوحدة:* ${price.toFixed(4)} USDT/CRYSTAL`,
                p2pTradeSuccess: (amount, usdt) => 
                    `✅ *تمت الصفقة بنجاح!*\n\n💎 *${amount} CRYSTAL*\n💰 *${usdt} USDT*`,
                notEnoughCrystals: (cost, usdt) => 
                    `❌ *رصيدك غير كافي!*\n\n💰 *تحتاج:* ${cost} CRYSTAL\n💵 *قيمتها:* ${usdt} USDT`,
                support: (adminUsername, adminId) => 
                    `📞 *الدعم الفني* 📞\n\n` +
                    `للتواصل مع الدعم الفني:\n\n` +
                    `👤 *الأدمن:* @${adminUsername}\n` +
                    `🆔 *المعرف:* ${adminId}\n\n` +
                    `📝 *يمكنك التواصل لحل المشكلات أو الاستفسارات*`,
                usdtValue: (crystals, usdt) => 
                    `💰 *قيمة رصيدك* 💰\n\n💎 *الكريستال:* ${crystals.toFixed(2)}\n💵 *القيمة:* ${usdt.toFixed(2)} USDT\n\n📊 *سعر الصرف:* 1 CRYSTAL = 0.01 USDT`,
                p2pMarket: (balance, usdt) => 
                    `📊 *سوق P2P* 📊\n\n💎 *رصيدك:* ${balance.toFixed(2)} CRYSTAL\n💰 *قيمته:* ${usdt.toFixed(2)} USDT\n\nاختر ما تريد:`
            },
            en: {
                welcome: (name, balance, rate, level, daily, limit) => 
                    `✨ *Welcome to CRYSTAL Mining Bot!* ✨\n\n` +
                    `👤 *User:* ${name}\n` +
                    `💎 *Balance:* ${balance.toFixed(2)} CRYSTAL\n` +
                    `💰 *Value:* ${(balance * 0.01).toFixed(2)} USDT\n` +
                    `⚡ *Mining Rate:* ${rate}x\n` +
                    `📈 *Level:* ${level}\n` +
                    `📊 *Today's Mining:* ${daily}/${limit}\n\n` +
                    `🚀 *Start mining now!\n⏰ Accumulative mining runs for 24 hours*`,
                miningStarted: (progress) => 
                    `⛏️ *Accumulative mining started!*\n\n` +
                    `📊 *Progress:* ${progress}%\n` +
                    `💎 *Crystals will accumulate gradually up to 70 crystals*\n\n` +
                    `⏰ *Mining continues automatically every hour*`,
                miningProgress: (reward, total, progress) => 
                    `⛏️ *Mining update!*\n\n` +
                    `💎 *Added:* +${reward} CRYSTAL\n` +
                    `📊 *Today's total:* ${total}/70\n` +
                    `📈 *Progress:* ${progress}%\n` +
                    `💎 *Remaining:* ${70 - total} CRYSTAL`,
                miningComplete: `✅ *You've completed today's mining!*\n\n🎉 *You got 70 CRYSTAL today*\n⏰ *Wait until tomorrow to mine again*`,
                upgradeSuccess: (newRate, newLevel) => 
                    `✅ *Upgrade successful!*\n\n⚡ *New mining rate:* ${newRate}x\n📈 *New level:* ${newLevel}`,
                upgradeCost: (cost, usdt) => 
                    `💰 *Upgrade cost:* ${cost} CRYSTAL\n💵 *Value:* ${usdt} USDT`,
                referralReward: (count) => 
                    `🎉 *Congratulations!*\n\n👥 *You reached ${count} referrals*\n💎 *You got 3000 CRYSTAL bonus!*`,
                referralDailyLimit: `⚠️ *You've reached the daily referral limit (10 referrals)*\n⏰ *Wait until tomorrow*`,
                purchaseRequest: (id, amount, usdt, address) => 
                    `✅ *Purchase request created* #${id.toString().slice(-6)}\n\n` +
                    `💎 *Amount:* ${amount} CRYSTAL\n💰 *Total:* ${usdt} USDT\n\n` +
                    `📤 *Send USDT via TRON Network (TRC20) to:*\n\`${address}\`\n\n` +
                    `🔘 *Press the button below to copy address:*\n\n` +
                    `📎 *After sending, send:*\n/confirm_purchase ${id} [Transaction Hash]`,
                upgradeRequest: (id, amount, address) => 
                    `✅ *Upgrade request created* #${id.toString().slice(-6)}\n\n` +
                    `💰 *Amount:* ${amount} USDT\n\n` +
                    `📤 *Send USDT via TRON Network (TRC20) to:*\n\`${address}\`\n\n` +
                    `🔘 *Press the button below to copy address:*\n\n` +
                    `📎 *After sending, send:*\n/confirm_upgrade ${id} [Transaction Hash]`,
                p2pOfferCreated: (type, amount, usdt, price) => 
                    `✅ *${type === 'sell' ? 'Sell' : 'Buy'} offer created!*\n\n` +
                    `💎 *Amount:* ${amount} CRYSTAL\n💰 *Price:* ${usdt} USDT\n📊 *Unit price:* ${price.toFixed(4)} USDT/CRYSTAL`,
                p2pTradeSuccess: (amount, usdt) => 
                    `✅ *Trade completed successfully!*\n\n💎 *${amount} CRYSTAL*\n💰 *${usdt} USDT*`,
                notEnoughCrystals: (cost, usdt) => 
                    `❌ *Insufficient balance!*\n\n💰 *Need:* ${cost} CRYSTAL\n💵 *Value:* ${usdt} USDT`,
                support: (adminUsername, adminId) => 
                    `📞 *Support* 📞\n\nContact support:\n\n👤 *Admin:* @${adminUsername}\n🆔 *ID:* ${adminId}\n\n⚠️ *Please mention your username and issue clearly*`,
                usdtValue: (crystals, usdt) => 
                    `💰 *Your Balance Value* 💰\n\n💎 *CRYSTAL:* ${crystals.toFixed(2)}\n💵 *Value:* ${usdt.toFixed(2)} USDT\n\n📊 *Exchange rate:* 1 CRYSTAL = 0.01 USDT`,
                p2pMarket: (balance, usdt) => 
                    `📊 *P2P Market* 📊\n\n💎 *Your balance:* ${balance.toFixed(2)} CRYSTAL\n💰 *Value:* ${usdt.toFixed(2)} USDT\n\nChoose an option:`
            }
        };
        
        let text = texts[lang]?.[key] || texts.ar[key];
        if (typeof text === 'function') {
            return text(...Object.values(params));
        }
        return text;
    }

    // تسجيل مستخدم جديد مع بصمة فريدة
    async registerUser(userId, username, firstName, referrerId = null, language = 'ar') {
        await this.connect();
        
        let user = await User.findOne({ userId });
        
        if (!user) {
            const miningSignature = this.generateSignature(`mining-${userId}`);
            const referralSignature = this.generateSignature(`referral-${userId}`);
            
            user = await User.create({
                userId,
                username: username || '',
                firstName: firstName || '',
                language,
                miningStartTime: new Date(),
                miningSignature,
                referralSignature,
                referrerId
            });
            
            await this.updateDailyStats('totalUsers');
            
            if (referrerId) {
                await this.updateReferralReward(referrerId, userId);
            }
            return true;
        }
        return false;
    }

    // تحديث مكافأة الإحالة (الحد الأقصى 10 إحالات في اليوم)
    async updateReferralReward(referrerId, referredUserId) {
        const referrer = await User.findOne({ userId: referrerId });
        if (!referrer) return false;
        
        const today = new Date().toISOString().split('T')[0];
        
        // التحقق من الحد اليومي للإحالات (10 إحالات كحد أقصى)
        const todayReferrals = await DailyReferralLog.countDocuments({ date: today, referrerId });
        
        if (todayReferrals >= 10) {
            return { success: false, message: this.getText('referralDailyLimit', referrer.language) };
        }
        
        // إنشاء بصمة فريدة للإحالة
        const signature = this.generateSignature(`referral-${referrerId}-${referredUserId}-${today}`);
        
        // تسجيل الإحالة
        await DailyReferralLog.create({
            date: today,
            referrerId,
            referredUserId,
            signature
        });
        
        const newCount = (referrer.referralCount || 0) + 1;
        const newDailyCount = (referrer.dailyReferrals || 0) + 1;
        
        await User.updateOne({ userId: referrerId }, { 
            referralCount: newCount,
            dailyReferrals: newDailyCount,
            lastReferralDate: today
        });
        
        await this.updateDailyStats('totalReferrals');
        
        if (newCount === 10) {
            await this.addCrystals(referrerId, 3000, 'مكافأة إحالة 10 أشخاص');
            const text = this.getText('referralReward', referrer.language, { count: newCount });
            return { success: true, message: text };
        }
        
        return { success: true };
    }

    // الحصول على مستخدم
    async getUser(userId) {
        await this.connect();
        return await User.findOne({ userId });
    }

    // إضافة كريستال
    async addCrystals(userId, amount, reason) {
        await this.connect();
        
        const signature = this.generateSignature(`reward-${userId}-${amount}-${Date.now()}`);
        
        await User.updateOne({ userId }, { $inc: { crystalBalance: amount, totalMined: amount } });
        
        await Transaction.create({
            userId,
            type: 'reward',
            amount,
            status: 'completed',
            signature,
            description: reason
        });
        
        return true;
    }

    // حساب المكافأة التراكمية (70 كريستال خلال 24 ساعة)
    async calculateMiningReward(user) {
        const now = new Date();
        const startTime = user.miningStartTime || now;
        const elapsedHours = Math.min(24, (now - startTime) / (1000 * 60 * 60));
        
        const maxReward = 70;
        const rewardPerHour = maxReward / 24;
        
        let expectedReward = rewardPerHour * elapsedHours;
        let alreadyMined = user.dailyMined || 0;
        
        let newReward = Math.min(maxReward - alreadyMined, expectedReward - alreadyMined);
        newReward = Math.max(0, Math.floor(newReward * 10) / 10);
        
        // تطبيق معدل التعدين (يؤثر على سرعة التجميع)
        newReward = newReward * user.miningRate;
        
        const progress = Math.min(100, ((alreadyMined + newReward) / maxReward) * 100);
        
        return {
            reward: Math.min(maxReward - alreadyMined, newReward),
            totalMined: alreadyMined + newReward,
            remaining: maxReward - (alreadyMined + newReward),
            completed: alreadyMined + newReward >= maxReward,
            progress: Math.floor(progress)
        };
    }

    // عملية التعدين (تراكمي)
    async mine(userId) {
        await this.connect();
        
        const user = await User.findOne({ userId });
        if (!user) {
            return { success: false, message: 'User not found' };
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
                message: this.getText('miningComplete', user.language),
                dailyLimit: true
            };
        }
        
        if (rewardData.reward <= 0) {
            // بدء التعدين التراكمي
            if (!user.miningStartTime) {
                await User.updateOne({ userId }, { miningStartTime: now });
                const progress = 0;
                return { 
                    success: true, 
                    started: true,
                    message: this.getText('miningStarted', user.language, { progress }),
                    progress: 0
                };
            }
            return { 
                success: false, 
                message: '⚠️ جاري تجميع الكريستال... انتظر قليلاً',
                progress: rewardData.progress
            };
        }
        
        const miningSignature = this.generateSignature(`mining-${userId}-${Date.now()}`);
        
        await User.updateOne({ userId }, {
            $inc: { 
                crystalBalance: rewardData.reward,
                totalMined: rewardData.reward,
                dailyMined: rewardData.reward
            },
            $set: {
                lastMiningTime: now,
                miningSignature: miningSignature
            }
        });
        
        await Transaction.create({
            userId,
            type: 'mining',
            amount: rewardData.reward,
            status: 'completed',
            signature: miningSignature,
            description: `تعدين ${rewardData.reward} كريستال`
        });
        
        await this.updateDailyStats('totalMined', rewardData.reward);
        
        const message = this.getText('miningProgress', user.language, {
            reward: rewardData.reward,
            total: rewardData.totalMined,
            progress: rewardData.progress
        });
        
        return { 
            success: true, 
            reward: rewardData.reward,
            dailyMined: rewardData.totalMined,
            dailyRemaining: rewardData.remaining,
            completed: rewardData.completed,
            progress: rewardData.progress,
            message
        };
    }

    // ترقية معدل التعدين
    async upgradeMiningRate(userId) {
        await this.connect();
        
        const user = await User.findOne({ userId });
        if (!user) return { success: false, message: 'User not found' };
        
        const upgradeCost = 100 * user.miningLevel;
        const usdtValue = upgradeCost * 0.01;
        
        if (user.crystalBalance < upgradeCost) {
            return { 
                success: false, 
                message: this.getText('notEnoughCrystals', user.language, { cost: upgradeCost, usdt: usdtValue })
            };
        }
        
        const newRate = user.miningRate + 0.5;
        const newLevel = user.miningLevel + 1;
        
        const signature = this.generateSignature(`upgrade-${userId}-${newLevel}`);
        
        await User.updateOne({ userId }, {
            $inc: { crystalBalance: -upgradeCost },
            $set: { miningRate: newRate, miningLevel: newLevel }
        });
        
        await Transaction.create({
            userId,
            type: 'upgrade',
            amount: upgradeCost,
            status: 'completed',
            signature,
            description: `ترقية من مستوى ${user.miningLevel} إلى ${newLevel}`
        });
        
        return { 
            success: true, 
            message: this.getText('upgradeSuccess', user.language, { newRate, newLevel }),
            newRate,
            newLevel
        };
    }

    // طلب شراء
    async requestPurchase(userId, crystalAmount) {
        await this.connect();
        
        const user = await User.findOne({ userId });
        if (!user) return { success: false, message: 'User not found' };
        
        const usdtAmount = crystalAmount * 0.01;
        const MIN_PURCHASE = 10;
        
        if (usdtAmount < MIN_PURCHASE) {
            return { success: false, message: `الحد الأدنى للشراء هو ${MIN_PURCHASE} USDT` };
        }
        
        const liquidity = await this.getLiquidity();
        const available = liquidity.totalLiquidity - liquidity.totalSold;
        
        if (crystalAmount > available) {
            return { success: false, message: 'السيولة غير كافية حالياً' };
        }
        
        const signature = this.generateSignature(`purchase-${userId}-${crystalAmount}`);
        
        const request = await PurchaseRequest.create({
            userId,
            crystalAmount,
            usdtAmount,
            status: 'pending',
            paymentAddress: process.env.TRON_ADDRESS,
            signature
        });
        
        return {
            success: true,
            request_id: request._id,
            crystal_amount: crystalAmount,
            usdt_amount: usdtAmount,
            payment_address: process.env.TRON_ADDRESS,
            message: this.getText('purchaseRequest', user.language, {
                id: request._id,
                amount: crystalAmount,
                usdt: usdtAmount,
                address: process.env.TRON_ADDRESS
            })
        };
    }

    // طلب ترقية
    async requestUpgrade(userId, usdtAmount) {
        await this.connect();
        
        const user = await User.findOne({ userId });
        if (!user) return { success: false, message: 'User not found' };
        
        const currentLevel = user.miningLevel;
        const requestedLevel = currentLevel + 1;
        
        const signature = this.generateSignature(`upgrade-req-${userId}-${requestedLevel}`);
        
        const request = await UpgradeRequest.create({
            userId,
            currentLevel,
            requestedLevel,
            usdtAmount,
            status: 'pending',
            signature
        });
        
        return {
            success: true,
            request_id: request._id,
            current_level: currentLevel,
            requested_level: requestedLevel,
            usdt_amount: usdtAmount,
            message: this.getText('upgradeRequest', user.language, {
                id: request._id,
                amount: usdtAmount,
                address: process.env.TRON_ADDRESS
            })
        };
    }

    // تأكيد شراء
    async confirmPurchase(requestId, transactionHash, adminId) {
        await this.connect();
        
        const request = await PurchaseRequest.findOne({ _id: requestId, status: 'pending' });
        if (!request) return { success: false, message: 'الطلب غير موجود' };
        
        const signature = this.generateSignature(`confirm-purchase-${requestId}`);
        
        await User.updateOne({ userId: request.userId }, {
            $inc: { crystalBalance: request.crystalAmount }
        });
        
        await PurchaseRequest.updateOne({ _id: requestId }, {
            $set: { status: 'completed', transactionHash, approvedBy: adminId, signature }
        });
        
        await Liquidity.updateOne({}, { $inc: { totalSold: request.crystalAmount } });
        await this.updateDailyStats('totalPurchases');
        
        return { success: true, message: `✅ تمت إضافة ${request.crystalAmount} كريستال` };
    }

    // تأكيد ترقية
    async confirmUpgrade(requestId, transactionHash, adminId) {
        await this.connect();
        
        const request = await UpgradeRequest.findOne({ _id: requestId, status: 'pending' });
        if (!request) return { success: false, message: 'الطلب غير موجود' };
        
        const newRate = request.currentLevel + 0.5;
        
        const signature = this.generateSignature(`confirm-upgrade-${requestId}`);
        
        await User.updateOne({ userId: request.userId }, {
            $set: { miningRate: newRate, miningLevel: request.requestedLevel }
        });
        
        await UpgradeRequest.updateOne({ _id: requestId }, {
            $set: { status: 'approved', transactionHash, approvedBy: adminId, signature }
        });
        
        await Liquidity.updateOne({}, { $inc: { totalUpgrades: 1 } });
        await this.updateDailyStats('totalUpgrades');
        
        const user = await User.findOne({ userId: request.userId });
        const message = this.getText('upgradeSuccess', user?.language || 'ar', { newRate, newLevel: request.requestedLevel });
        
        return { success: true, message, user_id: request.userId };
    }

    // إنشاء عرض P2P
    async createP2pOffer(userId, type, crystalAmount, usdtAmount) {
        await this.connect();
        
        const user = await User.findOne({ userId });
        if (!user) return { success: false, message: 'User not found' };
        
        if (type === 'sell' && user.crystalBalance < crystalAmount) {
            return { success: false, message: '❌ رصيدك غير كافي للبيع' };
        }
        
        const pricePerCrystal = usdtAmount / crystalAmount;
        const signature = this.generateSignature(`p2p-${userId}-${type}-${Date.now()}`);
        
        const offer = await P2pOffer.create({
            userId,
            type,
            crystalAmount,
            usdtAmount,
            pricePerCrystal,
            signature
        });
        
        return {
            success: true,
            offerId: offer._id,
            message: this.getText('p2pOfferCreated', user.language, {
                type,
                amount: crystalAmount,
                usdt: usdtAmount,
                price: pricePerCrystal
            })
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
            signature: offer.signature,
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
            
            const sellerSignature = this.generateSignature(`p2p-sell-${seller.userId}-${offerId}`);
            const buyerSignature = this.generateSignature(`p2p-buy-${buyer.userId}-${offerId}`);
            
            await User.updateOne({ userId: seller.userId }, { $inc: { crystalBalance: -offer.crystalAmount } });
            await User.updateOne({ userId: buyer.userId }, { $inc: { crystalBalance: offer.crystalAmount } });
            
            await Transaction.create({
                userId: seller.userId,
                type: 'p2p_sale',
                amount: offer.crystalAmount,
                usdtAmount: offer.usdtAmount,
                counterpartyId: buyer.userId,
                status: 'completed',
                signature: sellerSignature
            });
            
            await Transaction.create({
                userId: buyer.userId,
                type: 'p2p_buy',
                amount: offer.crystalAmount,
                usdtAmount: offer.usdtAmount,
                counterpartyId: seller.userId,
                status: 'completed',
                signature: buyerSignature
            });
        }
        
        const tradeSignature = this.generateSignature(`p2p-trade-${offerId}`);
        
        await P2pOffer.updateOne({ _id: offerId }, { 
            status: 'completed', 
            counterpartyId: buyerId,
            signature: tradeSignature
        });
        
        await this.updateDailyStats('p2pTrades');
        
        const message = this.getText('p2pTradeSuccess', buyer.language, {
            amount: offer.crystalAmount,
            usdt: offer.usdtAmount
        });
        
        return { success: true, message };
    }

    // تغيير اللغة
    async setLanguage(userId, language) {
        await this.connect();
        await User.updateOne({ userId }, { language });
        return true;
    }

    // قائمة المتصدرين
    async getLeaderboard(limit = 10) {
        await this.connect();
        return await User.find({})
            .sort({ crystalBalance: -1 })
            .limit(limit)
            .select('userId username firstName crystalBalance miningLevel')
            .lean();
    }

    // إحصائيات المستخدم
    async getUserStats(userId) {
        await this.connect();
        const user = await User.findOne({ userId });
        if (!user) return null;
        
        const today = new Date().toISOString().split('T')[0];
        const todayReferrals = await DailyReferralLog.countDocuments({ date: today, referrerId: userId });
        const referralsCount = await User.countDocuments({ referrerId: userId });
        const usdtValue = user.crystalBalance * 0.01;
        
        // حساب نسبة التقدم في التعدين اليومي
        const miningProgress = Math.min(100, (user.dailyMined / 70) * 100);
        
        return {
            ...user.toObject(),
            referralsCount,
            todayReferrals,
            usdtValue,
            miningProgress: Math.floor(miningProgress)
        };
    }

    // معلومات السيولة
    async getLiquidity() {
        await this.connect();
        let liquidity = await Liquidity.findOne();
        if (!liquidity) liquidity = await Liquidity.create({ totalLiquidity: 1000000, totalSold: 0 });
        return liquidity;
    }

    // إحصائيات عامة
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

    // إحصائيات اليوم
    async getTodayStats() {
        const today = new Date().toISOString().split('T')[0];
        return await DailyStats.findOne({ date: today });
    }

    // تحديث الإحصائيات اليومية
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
        if (type === 'totalReferrals') update.totalReferrals = (stats.totalReferrals || 0) + 1;
        
        await DailyStats.updateOne({ date: today }, { $inc: update });
    }

    // طلبات الترقية المعلقة
    async getPendingUpgrades() {
        await this.connect();
        const requests = await UpgradeRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).lean();
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
            signature: req.signature,
            createdAt: req.createdAt
        }));
    }

    // طلبات الشراء المعلقة
    async getPendingPurchases() {
        await this.connect();
        const requests = await PurchaseRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).lean();
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
            signature: req.signature,
            createdAt: req.createdAt
        }));
    }

    // البحث عن مستخدمين
    async searchUsers(query, limit = 20) {
        await this.connect();
        const searchRegex = new RegExp(query, 'i');
        return await User.find({
            $or: [
                { username: searchRegex },
                { firstName: searchRegex },
                { userId: !isNaN(query) ? parseInt(query) : -1 }
            ]
        })
        .limit(limit)
        .select('userId username firstName crystalBalance miningLevel miningSignature referralSignature')
        .lean();
    }

    // التحقق من صحة بصمة التعدين
    async verifyMiningSignature(userId, signature) {
        const user = await User.findOne({ userId, miningSignature: signature });
        return !!user;
    }

    // التحقق من صحة بصمة الإحالة
    async verifyReferralSignature(userId, signature) {
        const user = await User.findOne({ userId, referralSignature: signature });
        return !!user;
    }
}

module.exports = new Database();
