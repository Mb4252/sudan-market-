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
    dailyLimit: { type: Number, default: 700 },
    lastMiningTime: { type: Date, default: null },
    miningStartTime: { type: Date, default: null },
    referrerId: { type: Number, default: null },
    referralCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

// نموذج المعاملات
const transactionSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    type: { type: String, enum: ['mining', 'purchase', 'upgrade', 'reward', 'p2p_sale', 'p2p_buy'], required: true },
    amount: { type: Number, default: 0 },
    usdtAmount: { type: Number, default: 0 },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    transactionHash: { type: String, default: '' },
    counterpartyId: { type: Number, default: null },
    description: { type: String, default: '' },
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
    status: { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active' },
    counterpartyId: { type: Number, default: null },
    createdAt: { type: Date, default: Date.now }
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
    p2pTrades: { type: Number, default: 0 }
});

const User = mongoose.model('User', userSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const UpgradeRequest = mongoose.model('UpgradeRequest', upgradeRequestSchema);
const PurchaseRequest = mongoose.model('PurchaseRequest', purchaseRequestSchema);
const P2pOffer = mongoose.model('P2pOffer', p2pOfferSchema);
const Liquidity = mongoose.model('Liquidity', liquiditySchema);
const DailyStats = mongoose.model('DailyStats', dailyStatsSchema);

module.exports = { User, Transaction, UpgradeRequest, PurchaseRequest, P2pOffer, Liquidity, DailyStats };
