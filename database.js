const mongoose = require('mongoose');
const crypto = require('crypto');
const { User, Transaction, UpgradeRequest, PurchaseRequest, P2pOffer, Liquidity, DailyStats, DailyReferralLog } = require('./models');

class Database {
    constructor() {
        this.connected = false;
    }

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

    // نصوص متعددة اللغات
    getText(key, lang, params = {}) {
        const texts = {
            ar: {
                welcome: (n, b, r, l, d, lim) => `✨ *مرحباً بك في بوت تعدين CRYSTAL!* ✨\n\n👤 *المستخدم:* ${n}\n💎 *الرصيد:* ${b.toFixed(2)} CRYSTAL\n💰 *القيمة:* ${(b*0.01).toFixed(2)} USDT\n⚡ *معدل التعدين:* ${r}x\n📈 *المستوى:* ${l}\n📊 *تعدين اليوم:* ${d}/${lim}\n📈 *نسبة الإنجاز:* ${Math.floor((d/lim)*100)}%\n\n🚀 *ابدأ التعدين الآن!*\n⏰ *سيتم تجميع 70 كريستال خلال 24 ساعة*`,
                miningProgress: (reward, total, progress) => `⛏️ *تحديث التعدين!*\n\n💎 *تم إضافة:* +${reward} CRYSTAL\n📊 *إجمالي اليوم:* ${total}/70\n📈 *نسبة الإنجاز:* ${progress}%\n💎 *المتبقي:* ${70-total} كريستال`,
                miningComplete: `✅ *أكملت التعدين اليومي!*\n\n🎉 *حصلت على 70 كريستال اليوم*\n⏰ *انتظر حتى الغد للتعدين مرة أخرى*`,
                upgradeSuccess: (r, l) => `✅ *تمت الترقية!*\n\n⚡ *معدل التعدين:* ${r}x\n📈 *المستوى:* ${l}`,
                upgradeRequest: (id, amount, addr) => `✅ *طلب ترقية #${id.toString().slice(-6)}*\n\n💰 *المبلغ:* ${amount} USDT\n📤 *أرسل إلى:*\n\`${addr}\`\n\n📎 *بعد التحويل:* /confirm_upgrade ${id} [رابط]`,
                p2pOfferCreated: (t, a, u, p) => `✅ *عرض ${t === 'sell' ? 'بيع' : 'شراء'}!*\n💎 ${a} CRYSTAL\n💰 ${u} USDT\n📊 ${p.toFixed(4)} USDT/CRYSTAL`,
                p2pTradeStarted: (id, a, u, addr) => `🔄 *طلب صفقة #${id.toString().slice(-6)}*\n\n💎 ${a} CRYSTAL\n💰 ${u} USDT\n📤 *أرسل إلى:* ${addr}\n📎 *بعد الإرسال:* /send_proof ${id} [الصورة]`,
                p2pProofReceived: `✅ *تم استلام إثبات الدفع!*\n⏳ *بانتظار تأكيد البائع*`,
                p2pRelease: (id, a) => `✅ *تم تحرير العملة!*\n💎 +${a} CRYSTAL\n📋 *رقم الصفقة:* ${id}`,
                p2pDispute: `⚠️ *تم فتح نزاع!*\n👨‍⚖️ *سيتم مراجعة الصفقة من قبل الأدمن*`,
                comboReward: (combo, reward) => `🔥 *كومبو! يوم ${combo} على التوالي*\n🎁 *مكافأة:* +${reward} CRYSTAL`,
                dailyTask: (reward) => `✅ *المهمة اليومية مكتملة!*\n🎁 *مكافأة:* +${reward} CRYSTAL\n📈 *السلسلة:* يوم ${params.streak}`,
                vipUpgrade: (level) => `👑 *ترقية VIP!*\n🎖️ *المستوى:* ${level}\n✨ *مزايا جديدة متاحة*`,
                usdtValue: (c, u) => `💰 *قيمة رصيدك*\n💎 ${c.toFixed(2)} CRYSTAL\n💵 ${u.toFixed(2)} USDT`,
                support: (u, i) => `📞 *الدعم*\n👤 @${u}\n🆔 ${i}`,
                p2pMarket: (b, u) => `📊 *سوق P2P*\n💎 رصيدك: ${b.toFixed(2)} CRYSTAL\n💰 قيمته: ${u.toFixed(2)} USDT\n⚠️ أقل مبلغ: 5 USDT`
            },
            en: {
                welcome: (n, b, r, l, d, lim) => `✨ *Welcome to CRYSTAL Mining Bot!* ✨\n\n👤 *User:* ${n}\n💎 *Balance:* ${b.toFixed(2)} CRYSTAL\n💰 *Value:* ${(b*0.01).toFixed(2)} USDT\n⚡ *Mining Rate:* ${r}x\n📈 *Level:* ${l}\n📊 *Today:* ${d}/${lim}\n📈 *Progress:* ${Math.floor((d/lim)*100)}%\n\n🚀 *Start mining now!*\n⏰ *70 CRYSTAL will accumulate over 24 hours*`,
                miningProgress: (reward, total, progress) => `⛏️ *Mining update!*\n\n💎 *Added:* +${reward} CRYSTAL\n📊 *Today:* ${total}/70\n📈 *Progress:* ${progress}%\n💎 *Remaining:* ${70-total} CRYSTAL`,
                miningComplete: `✅ *Daily mining completed!*\n\n🎉 *You got 70 CRYSTAL today*\n⏰ *Wait until tomorrow*`,
                upgradeSuccess: (r, l) => `✅ *Upgrade successful!*\n\n⚡ *New rate:* ${r}x\n📈 *Level:* ${l}`,
                upgradeRequest: (id, amount, addr) => `✅ *Upgrade request #${id.toString().slice(-6)}*\n\n💰 *Amount:* ${amount} USDT\n📤 *Send to:*\n\`${addr}\`\n\n📎 *After sending:* /confirm_upgrade ${id} [hash]`,
                p2pOfferCreated: (t, a, u, p) => `✅ *${t === 'sell' ? 'Sell' : 'Buy'} offer created!*\n💎 ${a} CRYSTAL\n💰 ${u} USDT\n📊 ${p.toFixed(4)} USDT/CRYSTAL`,
                p2pTradeStarted: (id, a, u, addr) => `🔄 *Trade #${id.toString().slice(-6)}*\n\n💎 ${a} CRYSTAL\n💰 ${u} USDT\n📤 *Send to:* ${addr}\n📎 *After sending:* /send_proof ${id} [image]`,
                p2pProofReceived: `✅ *Payment proof received!*\n⏳ *Waiting for seller confirmation*`,
                p2pRelease: (id, a) => `✅ *Crystals released!*\n💎 +${a} CRYSTAL\n📋 *Trade ID:* ${id}`,
                p2pDispute: `⚠️ *Dispute opened!*\n👨‍⚖️ *Admin will review*`,
                comboReward: (combo, reward) => `🔥 *Combo! Day ${combo} streak*\n🎁 *Bonus:* +${reward} CRYSTAL`,
                dailyTask: (reward) => `✅ *Daily task completed!*\n🎁 *Bonus:* +${reward} CRYSTAL\n📈 *Streak:* ${params.streak} days`,
                vipUpgrade: (level) => `👑 *VIP Upgrade!*\n🎖️ *Level:* ${level}\n✨ *New features unlocked*`,
                usdtValue: (c, u) => `💰 *Your Balance Value*\n💎 ${c.toFixed(2)} CRYSTAL\n💵 ${u.toFixed(2)} USDT`,
                support: (u, i) => `📞 *Support*\n👤 @${u}\n🆔 ${i}`,
                p2pMarket: (b, u) => `📊 *P2P Market*\n💎 Balance: ${b.toFixed(2)} CRYSTAL\n💰 Value: ${u.toFixed(2)} USDT\n⚠️ Min amount: 5 USDT`
            }
        };
        
        let text = texts[lang]?.[key] || texts.ar[key];
        if (typeof text === 'function') return text(...Object.values(params));
        return text;
    }

    // تسجيل مستخدم جديد
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
            
            // مكافأة ترحيبية للمستخدم الجديد
            await this.addCrystals(userId, 10, 'مكافأة ترحيبية');
            
            return true;
        }
        return false;
    }

    // تحديث مكافأة الإحالة
    async updateReferralReward(referrerId, referredUserId) {
        const referrer = await User.findOne({ userId: referrerId });
        if (!referrer) return false;
        
        const today = new Date().toISOString().split('T')[0];
        const todayReferrals = await DailyReferralLog.countDocuments({ date: today, referrerId });
        
        if (todayReferrals >= 10) {
            return { success: false, message: this.getText('referralDailyLimit', referrer.language) };
        }
        
        const signature = this.generateSignature(`referral-${referrerId}-${referredUserId}-${today}`);
        
        await DailyReferralLog.create({ date: today, referrerId, referredUserId, signature });
        
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
        }
        
        return { success: true };
    }

    // إضافة كريستال
    async addCrystals(userId, amount, reason) {
        await this.connect();
        const signature = this.generateSignature(`reward-${userId}-${amount}`);
        await User.updateOne({ userId }, { $inc: { crystalBalance: amount, totalMined: amount } });
        await Transaction.create({ userId, type: 'reward', amount, status: 'completed', signature, description: reason });
        return true;
    }

    // حساب المكافأة التراكمية
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

    // عملية التعدين
    async mine(userId) {
        await this.connect();
        
        const user = await User.findOne({ userId });
        if (!user) return { success: false, message: 'User not found' };

        const now = new Date();
        let lastMine = user.lastMiningTime ? new Date(user.lastMiningTime) : new Date(0);
        const hoursSinceLastMine = (now - lastMine) / (1000 * 60 * 60);
        
        if (hoursSinceLastMine < 1) {
            const remaining = Math.floor((1 - hoursSinceLastMine) * 3600);
            return { success: false, message: `⏰ انتظر ${Math.floor(remaining/60)} دقيقة`, remaining };
        }
        
        const rewardData = await this.calculateMiningReward(user);
        
        if (rewardData.completed) {
            return { success: false, message: this.getText('miningComplete', user.language), dailyLimit: true };
        }
        
        if (rewardData.reward <= 0) {
            if (!user.miningStartTime) {
                await User.updateOne({ userId }, { miningStartTime: now });
                return { success: true, started: true, message: this.getText('miningStarted', user.language, { progress: 0 }), progress: 0 };
            }
            return { success: false, message: '⚠️ جاري تجميع الكريستال...', progress: rewardData.progress };
        }
        
        const miningSignature = this.generateSignature(`mining-${userId}`);
        
        await User.updateOne({ userId }, {
            $inc: { crystalBalance: rewardData.reward, totalMined: rewardData.reward, dailyMined: rewardData.reward },
            $set: { lastMiningTime: now, miningSignature }
        });
        
        await Transaction.create({ userId, type: 'mining', amount: rewardData.reward, status: 'completed', signature: miningSignature });
        await this.updateDailyStats('totalMined', rewardData.reward);
        
        // تحديث الكومبو
        await this.updateCombo(userId);
        
        return { 
            success: true, reward: rewardData.reward, dailyMined: rewardData.totalMined,
            dailyRemaining: rewardData.remaining, completed: rewardData.completed,
            progress: rewardData.progress, message: this.getText('miningProgress', user.language, {
                reward: rewardData.reward, total: rewardData.totalMined, progress: rewardData.progress
            })
        };
    }

    // نظام الكومبو
    async updateCombo(userId) {
        const user = await User.findOne({ userId });
        if (!user) return;
        
        const today = new Date().toISOString().split('T')[0];
        let combo = user.comboCount || 0;
        
        if (user.lastComboDate === today) return;
        
        if (user.lastComboDate && new Date(user.lastComboDate) >= new Date(Date.now() - 86400000)) {
            combo++;
        } else {
            combo = 1;
        }
        
        await User.updateOne({ userId }, { comboCount: combo, lastComboDate: today });
        
        if (combo % 7 === 0) {
            const reward = 50 * (combo / 7);
            await this.addCrystals(userId, reward, `مكافأة كومبو ${combo} يوم`);
            return { success: true, combo, reward };
        }
        return { success: true, combo };
    }

    // المهمة اليومية
    async completeDailyTask(userId) {
        const user = await User.findOne({ userId });
        if (!user) return { success: false, message: 'User not found' };
        
        const today = new Date().toISOString().split('T')[0];
        if (user.dailyTasks?.lastTaskDate === today) {
            return { success: false, message: 'تم إكمال المهمة اليومية بالفعل' };
        }
        
        let streak = user.dailyTasks?.streak || 0;
        if (user.dailyTasks?.lastTaskDate && new Date(user.dailyTasks.lastTaskDate) >= new Date(Date.now() - 86400000)) {
            streak++;
        } else {
            streak = 1;
        }
        
        const reward = 20 + (streak * 5);
        await this.addCrystals(userId, reward, `المهمة اليومية - سلسلة ${streak} أيام`);
        
        await User.updateOne({ userId }, {
            $set: { 'dailyTasks.completed': true, 'dailyTasks.lastTaskDate': today, 'dailyTasks.streak': streak }
        });
        
        await this.updateDailyStats('totalCombo');
        
        return { success: true, reward, streak };
    }

    // نظام VIP
    async upgradeVIP(userId) {
        const user = await User.findOne({ userId });
        if (!user) return { success: false, message: 'User not found' };
        
        const expNeeded = (user.vipLevel + 1) * 1000;
        if (user.totalMined < expNeeded) {
            return { success: false, message: `تحتاج ${expNeeded - user.totalMined} كريستال إضافي للترقية` };
        }
        
        const newLevel = user.vipLevel + 1;
        await User.updateOne({ userId }, { vipLevel: newLevel });
        
        // مكافأة ترقية VIP
        const bonus = newLevel * 100;
        await this.addCrystals(userId, bonus, `مكافأة ترقية VIP المستوى ${newLevel}`);
        
        return { success: true, newLevel, bonus };
    }

    // طلب ترقية بـ USDT (3 دولار كحد أدنى)
    async requestUpgrade(userId, usdtAmount) {
        await this.connect();
        
        const user = await User.findOne({ userId });
        if (!user) return { success: false, message: 'User not found' };
        
        if (usdtAmount < 3) {
            return { success: false, message: 'الحد الأدنى للترقية هو 3 USDT' };
        }
        
        const currentLevel = user.miningLevel;
        const requestedLevel = currentLevel + Math.floor(usdtAmount / 3);
        
        const signature = this.generateSignature(`upgrade-req-${userId}`);
        
        const request = await UpgradeRequest.create({
            userId, currentLevel, requestedLevel, usdtAmount,
            status: 'pending', signature
        });
        
        return {
            success: true, request_id: request._id,
            current_level: currentLevel, requested_level: requestedLevel,
            usdt_amount: usdtAmount,
            message: this.getText('upgradeRequest', user.language, {
                id: request._id, amount: usdtAmount, address: process.env.TRON_ADDRESS
            })
        };
    }

    // تأكيد الترقية
    async confirmUpgrade(requestId, transactionHash, adminId) {
        await this.connect();
        
        const request = await UpgradeRequest.findOne({ _id: requestId, status: 'pending' });
        if (!request) return { success: false, message: 'الطلب غير موجود' };
        
        const newRate = request.currentLevel + (request.usdtAmount / 3) * 0.5;
        const newLevel = request.requestedLevel;
        
        await User.updateOne({ userId: request.userId }, {
            $set: { miningRate: newRate, miningLevel: newLevel }
        });
        
        await UpgradeRequest.updateOne({ _id: requestId }, {
            $set: { status: 'approved', transactionHash, approvedBy: adminId }
        });
        
        await Liquidity.updateOne({}, { $inc: { totalUpgrades: 1 } });
        await this.updateDailyStats('totalUpgrades');
        
        const user = await User.findOne({ userId: request.userId });
        const message = this.getText('upgradeSuccess', user?.language || 'ar', { newRate, newLevel });
        
        return { success: true, message, user_id: request.userId };
    }

    // إنشاء عرض P2P (أقل مبلغ 5 دولار)
    async createP2pOffer(userId, type, crystalAmount, usdtAmount) {
        await this.connect();
        
        const user = await User.findOne({ userId });
        if (!user) return { success: false, message: 'User not found' };
        
        if (usdtAmount < 5) {
            return { success: false, message: 'الحد الأدنى للعرض هو 5 USDT' };
        }
        
        if (type === 'sell' && user.crystalBalance < crystalAmount) {
            return { success: false, message: '❌ رصيدك غير كافي للبيع' };
        }
        
        const pricePerCrystal = usdtAmount / crystalAmount;
        const signature = this.generateSignature(`p2p-${userId}-${type}`);
        
        const offer = await P2pOffer.create({
            userId, type, crystalAmount, usdtAmount, pricePerCrystal,
            minAmount: 5, signature
        });
        
        return {
            success: true, offerId: offer._id,
            message: this.getText('p2pOfferCreated', user.language, {
                type, amount: crystalAmount, usdt: usdtAmount, price: pricePerCrystal
            })
        };
    }

    // بدء صفقة P2P
    async startP2pTrade(offerId, buyerId) {
        await this.connect();
        
        const offer = await P2pOffer.findOne({ _id: offerId, status: 'active' });
        if (!offer) return { success: false, message: 'العرض غير موجود' };
        
        const buyer = await User.findOne({ userId: buyerId });
        if (!buyer) return { success: false, message: 'المستخدم غير موجود' };
        
        if (offer.type === 'sell' && offer.usdtAmount < 5) {
            return { success: false, message: 'الحد الأدنى للصفقة هو 5 USDT' };
        }
        
        await P2pOffer.updateOne({ _id: offerId }, {
            $set: { status: 'pending', counterpartyId: buyerId }
        });
        
        return {
            success: true, offerId: offer._id, crystalAmount: offer.crystalAmount,
            usdtAmount: offer.usdtAmount, sellerId: offer.userId,
            message: this.getText('p2pTradeStarted', buyer.language, {
                id: offer._id, amount: offer.crystalAmount, usdt: offer.usdtAmount,
                address: process.env.TRON_ADDRESS
            })
        };
    }

    // إرسال إثبات الدفع
    async sendPaymentProof(offerId, userId, proofImage) {
        await this.connect();
        
        const offer = await P2pOffer.findOne({ _id: offerId, status: 'pending', counterpartyId: userId });
        if (!offer) return { success: false, message: 'الطلب غير موجود' };
        
        await P2pOffer.updateOne({ _id: offerId }, {
            $set: { paymentProof: proofImage, status: 'waiting_release' }
        });
        
        const seller = await User.findOne({ userId: offer.userId });
        
        return {
            success: true, sellerId: offer.userId,
            message: this.getText('p2pProofReceived', seller?.language || 'ar')
        };
    }

    // تحرير العملة
    async releaseCrystals(offerId, sellerId) {
        await this.connect();
        
        const offer = await P2pOffer.findOne({ _id: offerId, status: 'waiting_release', userId: sellerId });
        if (!offer) return { success: false, message: 'الطلب غير موجود' };
        
        const seller = await User.findOne({ userId: sellerId });
        const buyer = await User.findOne({ userId: offer.counterpartyId });
        
        if (!seller || !buyer) return { success: false, message: 'مستخدم غير موجود' };
        
        if (offer.type === 'sell') {
            if (seller.crystalBalance < offer.crystalAmount) {
                await P2pOffer.updateOne({ _id: offerId }, { status: 'disputed' });
                return { success: false, message: '⚠️ تم فتح نزاع - رصيد البائع غير كاف' };
            }
            
            const releaseSignature = this.generateSignature(`release-${offerId}`);
            
            await User.updateOne({ userId: seller.userId }, { $inc: { crystalBalance: -offer.crystalAmount } });
            await User.updateOne({ userId: buyer.userId }, { $inc: { crystalBalance: offer.crystalAmount } });
            
            await P2pOffer.updateOne({ _id: offerId }, {
                $set: { status: 'completed', releaseSignature, completedAt: new Date() }
            });
            
            await Transaction.create({
                userId: seller.userId, type: 'p2p_sale', amount: offer.crystalAmount,
                usdtAmount: offer.usdtAmount, counterpartyId: buyer.userId, status: 'completed'
            });
            
            await Transaction.create({
                userId: buyer.userId, type: 'p2p_buy', amount: offer.crystalAmount,
                usdtAmount: offer.usdtAmount, counterpartyId: seller.userId, status: 'completed'
            });
            
            await this.updateDailyStats('p2pTrades');
            
            const message = this.getText('p2pRelease', buyer.language, { id: offerId, amount: offer.crystalAmount });
            
            return { success: true, message, buyerId: buyer.userId };
        }
        
        return { success: false, message: 'نوع العرض غير مدعوم' };
    }

    // فتح نزاع
    async openDispute(offerId, userId) {
        await this.connect();
        
        const offer = await P2pOffer.findOne({ _id: offerId, $or: [{ userId }, { counterpartyId: userId }] });
        if (!offer) return { success: false, message: 'العرض غير موجود' };
        
        await P2pOffer.updateOne({ _id: offerId }, { status: 'disputed' });
        
        return { success: true, message: this.getText('p2pDispute', 'ar') };
    }

    // تغيير اللغة
    async setLanguage(userId, language) {
        await this.connect();
        await User.updateOne({ userId }, { language });
        return true;
    }

    // باقي الدوال...
    async getUser(userId) { await this.connect(); return await User.findOne({ userId }); }
    async getUserStats(userId) {
        const user = await this.getUser(userId);
        if (!user) return null;
        const referralsCount = await User.countDocuments({ referrerId: userId });
        const today = new Date().toISOString().split('T')[0];
        const dailyMined = user.lastMiningDate === today ? (user.dailyMined || 0) : 0;
        const progress = Math.min(100, (dailyMined / 70) * 100);
        return { ...user.toObject(), referralsCount, usdtValue: user.crystalBalance * 0.01, miningProgress: Math.floor(progress) };
    }
    async getLeaderboard(limit = 10) { await this.connect(); return await User.find({}).sort({ crystalBalance: -1 }).limit(limit).lean(); }
    async getLiquidity() { await this.connect(); let l = await Liquidity.findOne(); if (!l) l = await Liquidity.create({ totalLiquidity: 1000000, totalSold: 0 }); return l; }
    async getPendingUpgrades() { await this.connect(); return await UpgradeRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).lean(); }
    async getPendingPurchases() { await this.connect(); return await PurchaseRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).lean(); }
    async getP2pOffers(type = null) { await this.connect(); const q = { status: 'active' }; if (type) q.type = type; return await P2pOffer.find(q).sort({ pricePerCrystal: type === 'sell' ? 1 : -1 }).limit(50).lean(); }
    async updateDailyStats(type, value = 1) { const today = new Date().toISOString().split('T')[0]; let s = await DailyStats.findOne({ date: today }); if (!s) s = await DailyStats.create({ date: today }); const u = {}; if (type === 'totalUsers') u.totalUsers = (s.totalUsers || 0) + 1; if (type === 'totalMined') u.totalMined = (s.totalMined || 0) + value; if (type === 'totalPurchases') u.totalPurchases = (s.totalPurchases || 0) + 1; if (type === 'totalUpgrades') u.totalUpgrades = (s.totalUpgrades || 0) + 1; if (type === 'p2pTrades') u.p2pTrades = (s.p2pTrades || 0) + 1; if (type === 'totalReferrals') u.totalReferrals = (s.totalReferrals || 0) + 1; if (type === 'totalCombo') u.totalCombo = (s.totalCombo || 0) + 1; await DailyStats.updateOne({ date: today }, { $inc: u }); }
}

module.exports = new Database();
