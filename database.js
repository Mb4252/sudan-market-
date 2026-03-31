const mongoose = require('mongoose');

// ================= Schema Definitions =================
const userSchema = new mongoose.Schema({
    user_id: { type: Number, required: true, unique: true },
    username: String,
    first_name: String,
    crystal_balance: { type: Number, default: 0 },
    mining_rate: { type: Number, default: 1 },
    mining_level: { type: Number, default: 1 },
    total_mined: { type: Number, default: 0 },
    daily_mined: { type: Number, default: 0 },
    last_mining_date: String,
    last_mining_time: Date,
    referrer_id: Number,
    referral_count: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now }
});

const transactionSchema = new mongoose.Schema({
    user_id: Number,
    type: String,
    amount: Number,
    usdt_amount: Number,
    status: String,
    transaction_hash: String,
    payment_address: String,
    admin_approved: { type: Number, default: 0 },
    approved_by: Number,
    created_at: { type: Date, default: Date.now }
});

const upgradeRequestSchema = new mongoose.Schema({
    req_id: { type: Number, unique: true }, // بديل للـ AUTOINCREMENT في SQLite
    user_id: Number,
    current_level: Number,
    requested_level: Number,
    usdt_amount: Number,
    status: { type: String, default: 'pending' },
    transaction_hash: String,
    approved_by: Number,
    created_at: { type: Date, default: Date.now }
});

const liquiditySchema = new mongoose.Schema({
    total_liquidity: { type: Number, default: 100000 },
    total_sold: { type: Number, default: 0 },
    last_updated: { type: Date, default: Date.now }
});

// Models
const User = mongoose.model('User', userSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const UpgradeRequest = mongoose.model('UpgradeRequest', upgradeRequestSchema);
const Liquidity = mongoose.model('Liquidity', liquiditySchema);

// ================= Database Class =================
class Database {
    constructor() {
        this.init();
    }

    async init() {
        try {
            // جلب رابط قاعدة البيانات من إعدادات البيئة
            const mongoURI = process.env.MONGODB_URI;
            if (!mongoURI) {
                console.error('❌ MONGODB_URI is not defined in environment variables!');
                return;
            }

            await mongoose.connect(mongoURI);
            console.log('✅ Connected to MongoDB successfully');

            // إضافة السيولة الابتدائية إذا لم تكن موجودة
            const liq = await Liquidity.findOne();
            if (!liq) {
                await Liquidity.create({ total_liquidity: 100000, total_sold: 0 });
                console.log('💧 Initial liquidity created');
            }
        } catch (error) {
            console.error('❌ MongoDB Connection Error:', error);
        }
    }

    async registerUser(userId, username, firstName, referrerId = null) {
        try {
            const existingUser = await User.findOne({ user_id: userId });
            if (!existingUser) {
                await User.create({
                    user_id: userId,
                    username: username,
                    first_name: firstName,
                    mining_rate: 1,
                    last_mining_date: new Date().toISOString().split('T')[0],
                    referrer_id: referrerId
                });

                if (referrerId) {
                    await this.updateReferralReward(referrerId);
                }
                return true;
            }
            return false;
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    async updateReferralReward(referrerId) {
        try {
            await User.updateOne({ user_id: referrerId }, { $inc: { referral_count: 1 } });
            const user = await User.findOne({ user_id: referrerId });
            
            if (user && user.referral_count === 5) {
                await this.addCrystals(referrerId, 10, 'مكافأة إحالة 5 أشخاص');
            }
        } catch (error) {
            console.error(error);
        }
    }

    async getUser(userId) {
        return await User.findOne({ user_id: userId }).lean();
    }

    async addCrystals(userId, amount, reason) {
        try {
            await User.updateOne(
                { user_id: userId },
                { $inc: { crystal_balance: amount } }
            );
            await Transaction.create({
                user_id: userId,
                type: 'reward',
                amount: amount,
                status: 'completed'
            });
            return true;
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    async mine(userId) {
        try {
            const user = await User.findOne({ user_id: userId });
            if (!user) return { success: false, message: 'User not found' };

            const today = new Date().toISOString().split('T')[0];
            const lastMiningDate = user.last_mining_date;
            
            let dailyMined = user.daily_mined || 0;
            if (lastMiningDate !== today) {
                dailyMined = 0;
            }
            
            if (dailyMined >= 4) {
                return { 
                    success: false, 
                    message: '⚠️ لقد وصلت للحد الأقصى اليومي (4 كريستال)\n⏰ انتظر حتى الغد للتعدين مرة أخرى!',
                    dailyLimit: true
                };
            }
            
            const now = new Date();
            const lastMine = user.last_mining_time ? new Date(user.last_mining_time) : new Date(0);
            const diffMinutes = (now - lastMine) / 1000 / 60;
            
            if (diffMinutes < 60) {
                const remaining = Math.floor((60 - diffMinutes) * 60);
                return { 
                    success: false, 
                    remaining: remaining,
                    message: `⏰ يجب الانتظار ${Math.floor(remaining/60)} دقيقة و ${remaining%60} ثانية`
                };
            }
            
            const minReward = 1;
            const maxReward = 4;
            let reward = Math.floor(Math.random() * (maxReward - minReward + 1) + minReward);
            
            if (user.mining_rate > 1) {
                const bonus = Math.random() * (user.mining_rate - 1);
                reward = Math.min(maxReward, reward + Math.floor(bonus));
            }
            
            if (dailyMined + reward > 4) {
                reward = 4 - dailyMined;
            }
            
            if (reward <= 0) {
                return { 
                    success: false, 
                    message: '⚠️ لقد وصلت للحد الأقصى اليومي!',
                    dailyLimit: true
                };
            }
            
            const newDailyMined = dailyMined + reward;
            
            await User.updateOne(
                { user_id: userId },
                { 
                    $inc: { crystal_balance: reward, total_mined: reward },
                    $set: { daily_mined: newDailyMined, last_mining_date: today, last_mining_time: now }
                }
            );
            
            await Transaction.create({
                user_id: userId,
                type: 'mining',
                amount: reward,
                status: 'completed'
            });
            
            return { 
                success: true, 
                reward: reward.toFixed(0),
                dailyRemaining: 4 - newDailyMined,
                dailyMined: newDailyMined
            };
        } catch (error) {
            console.error(error);
            return { success: false, message: 'حدث خطأ في قاعدة البيانات' };
        }
    }

    async requestUpgrade(userId, usdtAmount) {
        try {
            const user = await User.findOne({ user_id: userId });
            if (!user) return { success: false, message: 'المستخدم غير موجود' };
            
            const currentLevel = user.mining_level;
            const requestedLevel = currentLevel + 1;
            const paymentAddress = 'TCZ2NGDSvxznADHTvvkedJTcbbGbD5RhfR';
            
            // إنشاء رقم طلب فريد
            const requestId = Math.floor(Date.now() / 1000); 
            
            await UpgradeRequest.create({
                req_id: requestId,
                user_id: userId,
                current_level: currentLevel,
                requested_level: requestedLevel,
                usdt_amount: usdtAmount,
                status: 'pending'
            });
            
            return {
                success: true,
                request_id: requestId,
                current_level: currentLevel,
                requested_level: requestedLevel,
                usdt_amount: usdtAmount,
                payment_address: paymentAddress,
                message: `📝 تم إنشاء طلب ترقية رقم #${requestId}\n💰 المبلغ: ${usdtAmount} USDT\n📤 أرسل المبلغ إلى:\n\`${paymentAddress}\`\n\n⚠️ سيتم مراجعة طلبك من قبل الأدمن`
            };
        } catch (error) {
            console.error(error);
            return { success: false, message: 'حدث خطأ أثناء إنشاء الطلب' };
        }
    }

    async confirmUpgrade(requestId, transactionHash, adminId) {
        try {
            const request = await UpgradeRequest.findOne({ req_id: requestId, status: 'pending' });
            if (!request) return { success: false, message: 'طلب الترقية غير موجود أو تم معالجته مسبقاً' };
            
            const upgradeCost = 100 * request.current_level;
            const newMiningRate = request.current_level + 0.5;
            
            await User.updateOne(
                { user_id: request.user_id },
                { $set: { mining_rate: newMiningRate, mining_level: request.requested_level } }
            );
            
            await UpgradeRequest.updateOne(
                { req_id: requestId },
                { $set: { status: 'approved', transaction_hash: transactionHash, approved_by: adminId } }
            );
            
            await Transaction.create({
                user_id: request.user_id,
                type: 'upgrade',
                amount: upgradeCost,
                usdt_amount: request.usdt_amount,
                status: 'completed',
                transaction_hash: transactionHash
            });
            
            return { 
                success: true, 
                message: `✅ تمت الموافقة على طلب الترقية #${requestId}\n⚡ معدل التعدين الجديد: ${newMiningRate}x\n📈 المستوى الجديد: ${request.requested_level}`
            };
        } catch (error) {
            console.error(error);
            return { success: false, message: 'حدث خطأ أثناء تأكيد الطلب' };
        }
    }

    async rejectUpgrade(requestId, adminId) {
        try {
            const result = await UpgradeRequest.updateOne(
                { req_id: requestId, status: 'pending' },
                { $set: { status: 'rejected', approved_by: adminId } }
            );
            
            if (result.modifiedCount === 0) {
                return { success: false, message: 'الطلب غير موجود أو تم معالجته' };
            }
            return { success: true, message: 'تم رفض طلب الترقية' };
        } catch (error) {
            console.error(error);
            return { success: false, message: 'حدث خطأ' };
        }
    }

    async getPendingUpgrades() {
        try {
            const requests = await UpgradeRequest.find({ status: 'pending' }).sort({ created_at: -1 }).lean();
            const result = [];
            
            for (let req of requests) {
                const user = await User.findOne({ user_id: req.user_id }).lean();
                result.push({
                    ...req,
                    id: req.req_id, // ليتوافق مع كود index.js القديم
                    username: user?.username,
                    first_name: user?.first_name
                });
            }
            return result;
        } catch (error) {
            console.error(error);
            return [];
        }
    }

    async getLeaderboard(limit = 10) {
        try {
            return await User.find()
                .sort({ crystal_balance: -1 })
                .limit(limit)
                .lean();
        } catch (error) {
            console.error(error);
            return [];
        }
    }

    async getUserStats(userId) {
        try {
            const user = await User.findOne({ user_id: userId }).lean();
            if (!user) return null;
            
            const referrals = await User.find({ referrer_id: userId }, 'user_id').lean();
            
            return {
                ...user,
                referrals_count: referrals.length,
                referrals_list: referrals
            };
        } catch (error) {
            console.error(error);
            return null;
        }
    }

    async getLiquidity() {
        try {
            let liq = await Liquidity.findOne().sort({ last_updated: -1 }).lean();
            return liq || { total_liquidity: 100000, total_sold: 0 };
        } catch (error) {
            console.error(error);
            return { total_liquidity: 100000, total_sold: 0 };
        }
    }

    async getGlobalStats() {
        try {
            const stats = await User.aggregate([
                {
                    $group: {
                        _id: null,
                        total_users: { $sum: 1 },
                        total_crystals: { $sum: "$crystal_balance" },
                        total_mined: { $sum: "$total_mined" },
                        avg_level: { $avg: "$mining_level" }
                    }
                }
            ]);
            
            if (stats.length > 0) {
                return stats[0];
            }
            return { total_users: 0, total_crystals: 0, total_mined: 0, avg_level: 1 };
        } catch (error) {
            console.error(error);
            return { total_users: 0, total_crystals: 0, total_mined: 0, avg_level: 1 };
        }
    }
}

module.exports = new Database();
