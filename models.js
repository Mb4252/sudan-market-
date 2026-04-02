const mongoose = require('mongoose');

// ========== نموذج المحفظة ==========
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
    usdBalance: { type: Number, default: 0 },
    walletSignature: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now },
    lastUpdated: { type: Date, default: Date.now }
});

// ========== نموذج المستخدم ==========
const userSchema = new mongoose.Schema({
    userId: { type: Number, required: true, unique: true },
    username: { type: String, default: '' },
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    language: { type: String, default: 'ar' },
    phoneNumber: { type: String, default: '' },
    email: { type: String, default: '' },
    country: { type: String, default: 'SD' },
    city: { type: String, default: '' },
    bankName: { type: String, default: '' },
    bankAccountNumber: { type: String, default: '' },
    bankAccountName: { type: String, default: '' },
    isVerified: { type: Boolean, default: false },
    isMerchant: { type: Boolean, default: false },
    usdBalance: { type: Number, default: 0 },
    totalTraded: { type: Number, default: 0 },
    totalProfit: { type: Number, default: 0 },
    rating: { type: Number, default: 5.0 },
    completedTrades: { type: Number, default: 0 },
    successRate: { type: Number, default: 100 },
    referrerId: { type: Number, default: null },
    referralCount: { type: Number, default: 0 },
    walletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet' },
    createdAt: { type: Date, default: Date.now }
});

// ========== نموذج طلب التوثيق (KYC) ==========
const kycRequestSchema = new mongoose.Schema({
    userId: { type: Number, required: true, unique: true },
    fullName: { type: String, required: true },
    passportNumber: { type: String, required: true },
    nationalId: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    email: { type: String, default: '' },
    country: { type: String, default: 'SD' },
    city: { type: String, default: '' },
    bankName: { type: String, default: '' },
    bankAccountNumber: { type: String, default: '' },
    bankAccountName: { type: String, default: '' },
    passportPhoto: { type: String, required: true },  // file_id من تلغرام
    personalPhoto: { type: String, required: true },  // file_id من تلغرام
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    rejectionReason: { type: String, default: '' },
    approvedBy: { type: Number, default: null },
    approvedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// ========== نموذج عروض P2P ==========
const p2pOfferSchema = new mongoose.Schema({
    userId: { type: Number, required: true, index: true },
    type: { type: String, enum: ['buy', 'sell'], required: true },
    currency: { type: String, required: true },
    fiatAmount: { type: Number, required: true },
    price: { type: Number, required: true },
    paymentMethod: { type: String, required: true },
    paymentDetails: { type: String, default: '' },
    bankName: { type: String, default: '' },
    bankAccountNumber: { type: String, default: '' },
    bankAccountName: { type: String, default: '' },
    minAmount: { type: Number, default: 10 },
    maxAmount: { type: Number, default: 100000 },
    status: { type: String, enum: ['active', 'pending', 'completed', 'cancelled'], default: 'active' },
    counterpartyId: { type: Number, default: null },
    createdAt: { type: Date, default: Date.now }
});

// ========== نموذج الصفقات ==========
const tradeSchema = new mongoose.Schema({
    offerId: { type: mongoose.Schema.Types.ObjectId, ref: 'P2pOffer' },
    buyerId: { type: Number, required: true },
    sellerId: { type: Number, required: true },
    currency: { type: String, required: true },
    amount: { type: Number, required: true },
    price: { type: Number, required: true },
    totalUsd: { type: Number, required: true },
    fee: { type: Number, required: true },
    paymentMethod: { type: String, required: true },
    paymentProof: { type: String, default: '' },
    buyerBankDetails: { type: String, default: '' },
    sellerBankDetails: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'paid', 'released', 'disputed', 'completed'], default: 'pending' },
    disputeReason: { type: String, default: '' },
    disputeOpenedBy: { type: Number, default: null },
    createdAt: { type: Date, default: Date.now },
    paidAt: { type: Date, default: null },
    releasedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null }
});

// ========== نموذج طلبات الإيداع ==========
const depositRequestSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    network: { type: String, required: true },
    address: { type: String, required: true },
    transactionHash: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null }
});

// ========== نموذج طلبات السحب ==========
const withdrawRequestSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    network: { type: String, required: true },
    address: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'completed'], default: 'pending' },
    transactionHash: { type: String, default: '' },
    fee: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    approvedAt: { type: Date, default: null }
});

// ========== نموذج التقييمات ==========
const reviewSchema = new mongoose.Schema({
    tradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trade', required: true },
    reviewerId: { type: Number, required: true },
    targetId: { type: Number, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

// ========== نموذج الإحصائيات اليومية ==========
const dailyStatsSchema = new mongoose.Schema({
    date: { type: String, required: true, unique: true },
    totalUsers: { type: Number, default: 0 },
    newUsers: { type: Number, default: 0 },
    verifiedUsers: { type: Number, default: 0 },
    totalTrades: { type: Number, default: 0 },
    totalVolume: { type: Number, default: 0 },
    totalCommission: { type: Number, default: 0 },
    activeOffers: { type: Number, default: 0 },
    pendingKyc: { type: Number, default: 0 }
});

// ========== إنشاء النماذج ==========
const User = mongoose.model('User', userSchema);
const Wallet = mongoose.model('Wallet', walletSchema);
const KycRequest = mongoose.model('KycRequest', kycRequestSchema);
const P2pOffer = mongoose.model('P2pOffer', p2pOfferSchema);
const Trade = mongoose.model('Trade', tradeSchema);
const DepositRequest = mongoose.model('DepositRequest', depositRequestSchema);
const WithdrawRequest = mongoose.model('WithdrawRequest', withdrawRequestSchema);
const Review = mongoose.model('Review', reviewSchema);
const DailyStats = mongoose.model('DailyStats', dailyStatsSchema);

// ========== تصدير النماذج ==========
module.exports = { 
    User, 
    Wallet, 
    KycRequest, 
    P2pOffer, 
    Trade, 
    DepositRequest, 
    WithdrawRequest, 
    Review, 
    DailyStats 
};
