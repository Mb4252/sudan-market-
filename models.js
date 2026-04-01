const mongoose = require('mongoose');

// نموذج المحفظة
const walletSchema = new mongoose.Schema({
    userId: { type: Number, required: true, unique: true },
    bnbAddress: { type: String, unique: true, sparse: true },
    bnbEncryptedPrivateKey: { type: String },
    bnbBalance: { type: Number, default: 0 },
    polygonAddress: { type: String, unique: true, sparse: true },
    polygonEncryptedPrivateKey: { type: String },
    polygonBalance: { type: Number, default: 0 },
    solanaAddress: { type: String, unique: true, sparse: true },
    solanaEncryptedPrivateKey: { type: String },
    solanaBalance: { type: Number, default: 0 },
    aptosAddress: { type: String, unique: true, sparse: true },
    aptosEncryptedPrivateKey: { type: String },
    aptosBalance: { type: Number, default: 0 },
    walletSignature: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now },
    lastUpdated: { type: Date, default: Date.now }
});

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
    referrerId: { type: Number, default: null },
    referralCount: { type: Number, default: 0 },
    dailyReferrals: { type: Number, default: 0 },
    lastReferralDate: { type: String, default: null },
    referralSignature: { type: String, unique: true, sparse: true },
    vipLevel: { type: Number, default: 0 },
    dailyTasks: { completed: { type: Boolean, default: false }, lastTaskDate: { type: String, default: null }, streak: { type: Number, default: 0 } },
    twitterTaskCompleted: { type: Boolean, default: false },
    comboCount: { type: Number, default: 0 },
    lastComboDate: { type: String, default: null },
    walletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet' },
    createdAt: { type: Date, default: Date.now }
});

// نموذج المعاملات
const transactionSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    type: { type: String, enum: ['mining', 'purchase', 'upgrade', 'reward', 'p2p_sale', 'p2p_buy', 'daily_task', 'twitter_task', 'withdraw', 'trade_bet', 'trade_win', 'trade_loss', 'commission', 'deposit_fee', 'withdraw_fee'], required: true },
    amount: { type: Number, default: 0 },
    usdtAmount: { type: Number, default: 0 },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'completed' },
    transactionHash: { type: String, default: '' },
    signature: { type: String, default: '' },
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
    createdAt: { type: Date, default: Date.now }
});

// نموذج عروض P2P
const p2pOfferSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    type: { type: String, enum: ['sell', 'buy'], required: true },
    crystalAmount: { type: Number, required: true },
    usdtAmount: { type: Number, required: true },
    pricePerCrystal: { type: Number, required: true },
    status: { type: String, enum: ['active', 'pending', 'completed', 'cancelled'], default: 'active' },
    counterpartyId: { type: Number, default: null },
    createdAt: { type: Date, default: Date.now }
});

// نموذج رهانات التداول
const tradeBetSchema = new mongoose.Schema({
    userId: { type: Number, required: true, index: true },
    type: { type: String, enum: ['up', 'down'], required: true },
    currency: { type: String, enum: ['BTC', 'ETH'], required: true },
    amount: { type: Number, required: true },
    usdtAmount: { type: Number, required: true },
    fee: { type: Number, required: true },
    startPrice: { type: Number, required: true },
    endPrice: { type: Number, default: null },
    status: { type: String, enum: ['active', 'won', 'lost', 'cancelled'], default: 'active' },
    duration: { type: Number, required: true },
    endTime: { type: Date, required: true },
    result: { type: String, default: null },
    profit: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null }
});

// نموذج أسعار العملات (للتخزين المؤقت)
const priceLogSchema = new mongoose.Schema({
    currency: { type: String, enum: ['BTC', 'ETH'], required: true },
    price: { type: Number, required: true },
    open: { type: Number, required: true },
    high: { type: Number, required: true },
    low: { type: Number, required: true },
    volume: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now },
    interval: { type: String, enum: ['1m', '5m', '15m', '1h'], default: '1m' }
});

// نموذج السيولة
const liquiditySchema = new mongoose.Schema({
    totalLiquidity: { type: Number, default: 1000000 },
    totalSold: { type: Number, default: 0 },
    totalUpgrades: { type: Number, default: 0 },
    totalCommission: { type: Number, default: 0 },
    commissionAddress: { type: String, default: '0x2a2548117C7113eB807298D74A44d451E330AC95' },
    lastUpdated: { type: Date, default: Date.now }
});

// نموذج الإحصائيات اليومية
const dailyStatsSchema = new mongoose.Schema({
    date: { type: String, required: true, unique: true },
    totalUsers: { type: Number, default: 0 },
    totalMined: { type: Number, default: 0 },
    totalPurchases: { type: Number, default: 0 },
    totalUpgrades: { type: Number, default: 0 },
    p2pTrades: { type: Number, default: 0 },
    totalReferrals: { type: Number, default: 0 },
    twitterTasks: { type: Number, default: 0 },
    totalBets: { type: Number, default: 0 },
    totalCommission: { type: Number, default: 0 }
});

// نموذج سجل الإحالات
const dailyReferralLogSchema = new mongoose.Schema({
    date: { type: String, required: true },
    referrerId: { type: Number, required: true },
    referredUserId: { type: Number, required: true },
    signature: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Wallet = mongoose.model('Wallet', walletSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const UpgradeRequest = mongoose.model('UpgradeRequest', upgradeRequestSchema);
const PurchaseRequest = mongoose.model('PurchaseRequest', purchaseRequestSchema);
const P2pOffer = mongoose.model('P2pOffer', p2pOfferSchema);
const TradeBet = mongoose.model('TradeBet', tradeBetSchema);
const PriceLog = mongoose.model('PriceLog', priceLogSchema);
const Liquidity = mongoose.model('Liquidity', liquiditySchema);
const DailyStats = mongoose.model('DailyStats', dailyStatsSchema);
const DailyReferralLog = mongoose.model('DailyReferralLog', dailyReferralLogSchema);

module.exports = { User, Wallet, Transaction, UpgradeRequest, PurchaseRequest, P2pOffer, TradeBet, PriceLog, Liquidity, DailyStats, DailyReferralLog };
