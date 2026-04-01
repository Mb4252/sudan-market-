const mongoose = require('mongoose');

// نموذج المستخدم
const userSchema = new mongoose.Schema({
    userId: { type: Number, required: true, unique: true },
    username: { type: String, default: '' },
    firstName: { type: String, default: '' },
    language: { type: String, default: 'ar' },
    crystalBalance: { type: Number, default: 0 },
    miningRate: { type: Number, default: 1 },
    miningLevel: { type: Number, default: 1 },
    totalMined: { type: Number, default: 0 },
    dailyMined: { type: Number, default: 0 },
    dailyLimit: { type: Number, default: 70 },
    miningSignature: { type: String, unique: true, sparse: true },
    lastMiningTime: { type: Date, default: null },
    miningStartTime: { type: Date, default: null },
    miningProgress: { type: Number, default: 0 },
    referrerId: { type: Number, default: null },
    referralCount: { type: Number, default: 0 },
    dailyReferrals: { type: Number, default: 0 },
    lastReferralDate: { type: String, default: null },
    referralSignature: { type: String, unique: true, sparse: true },
    // نظام المستويات
    vipLevel: { type: Number, default: 0 },
    vipExp: { type: Number, default: 0 },
    // المهام اليومية
    dailyTasks: {
        completed: { type: Boolean, default: false },
        lastTaskDate: { type: String, default: null },
        streak: { type: Number, default: 0 }
    },
    // مهمة تويتر (مرة واحدة فقط)
    twitterTaskCompleted: { type: Boolean, default: false },
    // نظام الكومبو
    comboCount: { type: Number, default: 0 },
    lastComboDate: { type: String, default: null },
    // الإشعارات
    notifications: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

// نموذج المعاملات
const transactionSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    type: { type: String, enum: ['mining', 'purchase', 'upgrade', 'reward', 'p2p_sale', 'p2p_buy', 'daily_task', 'twitter_task'], required: true },
    amount: { type: Number, default: 0 },
    usdtAmount: { type: Number, default: 0 },
    status: { type: String, enum: ['pending', 'completed', 'failed', 'disputed'], default: 'pending' },
    transactionHash: { type: String, default: '' },
    signature: { type: String, default: '' },
    counterpartyId: { type: Number, default: null },
    description: { type: String, default: '' },
    proofImage: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

// نموذج طلبات الترقية
const upgradeRequestSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    currentLevel: { type: Number, required: true },
    requestedLevel: { type: Number, required: true },
    usdtAmount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    transactionHash: { type: String, default: '' },
    signature: { type: String, default: '' },
    proofImage: { type: String, default: '' },
    approvedBy: { type: Number, default: null },
    createdAt: { type: Date, default: Date.now }
});

// نموذج طلبات الشراء
const purchaseRequestSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    crystalAmount: { type: Number, required: true },
    usdtAmount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    transactionHash: { type: String, default: '' },
    paymentAddress: { type: String, default: '' },
    signature: { type: String, default: '' },
    proofImage: { type: String, default: '' },
    approvedBy: { type: Number, default: null },
    createdAt: { type: Date, default: Date.now }
});

// نموذج عروض P2P
const p2pOfferSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    type: { type: String, enum: ['sell', 'buy'], required: true },
    crystalAmount: { type: Number, required: true },
    usdtAmount: { type: Number, required: true },
    pricePerCrystal: { type: Number, required: true },
    minAmount: { type: Number, default: 5 },
    status: { type: String, enum: ['active', 'pending', 'completed', 'cancelled', 'disputed'], default: 'active' },
    counterpartyId: { type: Number, default: null },
    paymentProof: { type: String, default: '' },
    releaseSignature: { type: String, default: '' },
    signature: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null }
});

// نموذج السيولة
const liquiditySchema = new mongoose.Schema({
    totalLiquidity: { type: Number, default: 1000000 },
    totalSold: { type: Number, default: 0 },
    totalUpgrades: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
});

// نموذج الإحصائيات اليومية
const dailyStatsSchema = new mongoose.Schema({
    date: { type: String, required: true, unique: true },
    totalUsers: { type: Number, default: 0 },
    activeUsers: { type: Number, default: 0 },
    totalMined: { type: Number, default: 0 },
    totalPurchases: { type: Number, default: 0 },
    totalUpgrades: { type: Number, default: 0 },
    p2pTrades: { type: Number, default: 0 },
    totalReferrals: { type: Number, default: 0 },
    totalCombo: { type: Number, default: 0 },
    twitterTasks: { type: Number, default: 0 }
});

// نموذج سجل الإحالات اليومية
const dailyReferralLogSchema = new mongoose.Schema({
    date: { type: String, required: true },
    referrerId: { type: Number, required: true },
    referredUserId: { type: Number, required: true },
    signature: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const UpgradeRequest = mongoose.model('UpgradeRequest', upgradeRequestSchema);
const PurchaseRequest = mongoose.model('PurchaseRequest', purchaseRequestSchema);
const P2pOffer = mongoose.model('P2pOffer', p2pOfferSchema);
const Liquidity = mongoose.model('Liquidity', liquiditySchema);
const DailyStats = mongoose.model('DailyStats', dailyStatsSchema);
const DailyReferralLog = mongoose.model('DailyReferralLog', dailyReferralLogSchema);

module.exports = { User, Transaction, UpgradeRequest, PurchaseRequest, P2pOffer, Liquidity, DailyStats, DailyReferralLog };
