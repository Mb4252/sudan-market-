const mongoose = require('mongoose');

// نموذج المحفظة
const walletSchema = new mongoose.Schema({
    userId: { type: Number, required: true, unique: true },
    // محافظ العملات المشفرة
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
    // محفظة الدولار (للتداول)
    usdBalance: { type: Number, default: 0 },
    // بصمة المحفظة
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
    usdBalance: { type: Number, default: 0 },
    totalTraded: { type: Number, default: 0 },
    totalProfit: { type: Number, default: 0 },
    referrerId: { type: Number, default: null },
    referralCount: { type: Number, default: 0 },
    dailyReferrals: { type: Number, default: 0 },
    lastReferralDate: { type: String, default: null },
    referralSignature: { type: String, unique: true, sparse: true },
    vipLevel: { type: Number, default: 0 },
    dailyTasks: { completed: { type: Boolean, default: false }, lastTaskDate: { type: String, default: null }, streak: { type: Number, default: 0 } },
    twitterTaskCompleted: { type: Boolean, default: false },
    walletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet' },
    createdAt: { type: Date, default: Date.now }
});

// نموذج المعاملات
const transactionSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    type: { type: String, enum: ['deposit', 'withdraw', 'trade', 'p2p_sale', 'p2p_buy', 'reward', 'commission'], required: true },
    amount: { type: Number, default: 0 },
    usdtAmount: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'completed' },
    transactionHash: { type: String, default: '' },
    signature: { type: String, default: '' },
    counterpartyId: { type: Number, default: null },
    description: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

// نموذج طلبات P2P المحلية
const p2pLocalOfferSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    type: { type: String, enum: ['buy', 'sell'], required: true },
    currency: { type: String, required: true }, // USD, EUR, SAR, AED, etc
    fiatAmount: { type: Number, required: true },
    crystalAmount: { type: Number, required: true },
    pricePerCrystal: { type: Number, required: true },
    paymentMethod: { type: String, required: true }, // Bank, PayPal, etc
    bankDetails: { type: String, default: '' },
    status: { type: String, enum: ['active', 'pending', 'completed', 'cancelled'], default: 'active' },
    counterpartyId: { type: Number, default: null },
    createdAt: { type: Date, default: Date.now }
});

// نموذج صفقات التداول
const tradeSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    type: { type: String, enum: ['buy', 'sell'], required: true },
    currency: { type: String, required: true },
    amount: { type: Number, required: true },
    price: { type: Number, required: true },
    totalUsd: { type: Number, required: true },
    fee: { type: Number, required: true },
    status: { type: String, enum: ['completed', 'cancelled'], default: 'completed' },
    createdAt: { type: Date, default: Date.now }
});

// نموذج طلبات السحب
const withdrawRequestSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    network: { type: String, required: true },
    address: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'completed'], default: 'pending' },
    transactionHash: { type: String, default: '' },
    fee: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

// نموذج السيولة
const liquiditySchema = new mongoose.Schema({
    totalCrystalSupply: { type: Number, default: 30000000 },
    circulatingCrystal: { type: Number, default: 0 },
    totalUsdLiquidity: { type: Number, default: 300000 },
    crystalPrice: { type: Number, default: 0.01 },
    priceHistory: [{ price: Number, timestamp: Date }],
    lastUpdated: { type: Date, default: Date.now }
});

// نموذج الإحصائيات اليومية
const dailyStatsSchema = new mongoose.Schema({
    date: { type: String, required: true, unique: true },
    totalUsers: { type: Number, default: 0 },
    totalTrades: { type: Number, default: 0 },
    totalVolume: { type: Number, default: 0 },
    totalDeposits: { type: Number, default: 0 },
    totalWithdraws: { type: Number, default: 0 },
    totalCommission: { type: Number, default: 0 },
    p2pTrades: { type: Number, default: 0 },
    totalReferrals: { type: Number, default: 0 }
});

// نموذج أسعار العملات
const priceSchema = new mongoose.Schema({
    symbol: { type: String, required: true, unique: true },
    price: { type: Number, required: true },
    change24h: { type: Number, default: 0 },
    high24h: { type: Number, default: 0 },
    low24h: { type: Number, default: 0 },
    volume: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Wallet = mongoose.model('Wallet', walletSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const P2pLocalOffer = mongoose.model('P2pLocalOffer', p2pLocalOfferSchema);
const Trade = mongoose.model('Trade', tradeSchema);
const WithdrawRequest = mongoose.model('WithdrawRequest', withdrawRequestSchema);
const Liquidity = mongoose.model('Liquidity', liquiditySchema);
const DailyStats = mongoose.model('DailyStats', dailyStatsSchema);
const Price = mongoose.model('Price', priceSchema);

module.exports = { User, Wallet, Transaction, P2pLocalOffer, Trade, WithdrawRequest, Liquidity, DailyStats, Price };
