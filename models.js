const mongoose = require('mongoose');

// ========== نموذج المحفظة ==========
const walletSchema = new mongoose.Schema({
    userId: { type: Number, required: true, unique: true },
    usdtBalance: { type: Number, default: 0 },
    crystalBalance: { type: Number, default: 0 },
    bnbAddress: { type: String, unique: true, sparse: true },
    bnbEncryptedPrivateKey: { type: String },
    polygonAddress: { type: String, unique: true, sparse: true },
    polygonEncryptedPrivateKey: { type: String },
    solanaAddress: { type: String, unique: true, sparse: true },
    solanaEncryptedPrivateKey: { type: String },
    aptosAddress: { type: String, unique: true, sparse: true },
    aptosEncryptedPrivateKey: { type: String },
    walletSignature: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now },
    lastUpdated: { type: Date, default: Date.now }
});

// ========== نموذج طلب التوثيق (KYC) ==========
const kycRequestSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
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
    passportPhotoFileId: { type: String, default: '' },
    personalPhotoFileId: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    rejectionReason: { type: String, default: '' },
    approvedBy: { type: Number, default: null },
    approvedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
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
    isAdmin: { type: Boolean, default: false },
    
    // الأمان
    isLocked: { type: Boolean, default: false },
    isBanned: { type: Boolean, default: false },
    banReason: { type: String, default: '' },
    banExpires: { type: Date, default: null },
    warningCount: { type: Number, default: 0 },
    suspiciousActions: { type: Array, default: [] },
    
    // 2FA
    twoFAEnabled: { type: Boolean, default: false },
    twoFASecret: { type: String, default: '' },
    twoFABackupCodes: { type: Array, default: [] },
    
    // الإحالات
    referrerId: { type: Number, default: null },
    referralCount: { type: Number, default: 0 },
    referralEarnings: { type: Number, default: 0 },
    referralCommissionRate: { type: Number, default: 10 },
    referrals: [{ 
        userId: { type: Number, required: true },
        joinedAt: { type: Date, default: Date.now },
        totalCommission: { type: Number, default: 0 },
        earned: { type: Number, default: 0 }
    }],
    
    // نشاط المتداول
    lastSeen: { type: Date, default: Date.now },
    isOnline: { type: Boolean, default: false },
    totalTrades: { type: Number, default: 0 },
    totalVolume: { type: Number, default: 0 },
    totalProfit: { type: Number, default: 0 },
    rating: { type: Number, default: 5.0 },
    
    walletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet' },
    lastLoginIp: { type: String, default: '' },
    loginAttempts: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

// ========== نموذج طلبات البيع والشراء (Order Book) ==========
const orderSchema = new mongoose.Schema({
    userId: { type: Number, required: true, index: true },
    type: { type: String, enum: ['buy', 'sell'], required: true },
    price: { type: Number, required: true },
    amount: { type: Number, required: true },
    originalAmount: { type: Number, required: true },
    totalUsdt: { type: Number, required: true },
    status: { type: String, enum: ['open', 'partial', 'completed', 'cancelled'], default: 'open' },
    isAdminOrder: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null }
});

// ========== نموذج الصفقات المنفذة ==========
const tradeSchema = new mongoose.Schema({
    buyerId: { type: Number, required: true },
    sellerId: { type: Number, required: true },
    buyOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    sellOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    price: { type: Number, required: true },
    amount: { type: Number, required: true },
    totalUsdt: { type: Number, required: true },
    fee: { type: Number, default: 0.001 },
    createdAt: { type: Date, default: Date.now }
});

// ========== نموذج الشموع (Candlesticks) ==========
const candlestickSchema = new mongoose.Schema({
    timeframe: { type: String, enum: ['1m', '5m', '15m', '1h', '4h', '1d'], required: true },
    open: { type: Number, required: true },
    high: { type: Number, required: true },
    low: { type: Number, required: true },
    close: { type: Number, required: true },
    volume: { type: Number, default: 0 },
    isReal: { type: Boolean, default: true },  // ✅ true = صفقة حقيقية، false = وهمية
    timestamp: { type: Date, required: true, index: true }
});

// ========== نموذج السعر السوقي الحالي ==========
const marketPriceSchema = new mongoose.Schema({
    symbol: { type: String, default: 'CRYSTAL/USDT' },
    price: { type: Number, required: true, default: 0.002 },           // السعر الحقيقي (آخر صفقة)
    displayPrice: { type: Number, required: true, default: 0.002 },    // ✅ السعر الوهمي (للعرض)
    change24h: { type: Number, default: 0 },
    volume24h: { type: Number, default: 0 },
    high24h: { type: Number, default: 0.002 },
    low24h: { type: Number, default: 0.002 },
    lastUpdated: { type: Date, default: Date.now },
    lastFakeUpdate: { type: Date, default: Date.now }                  // ✅ وقت آخر تحديث وهمي
});

// ========== نماذج الإيداع والسحب ==========
const depositRequestSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'USDT' },
    network: { type: String, required: true },
    address: { type: String, required: true },
    transactionHash: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'completed', 'expired', 'failed'], default: 'pending' },
    rejectionReason: { type: String, default: '' },
    verifiedBy: { type: Number, default: null },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
    completedAt: { type: Date, default: null }
});

const withdrawRequestSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'USDT' },
    network: { type: String, required: true },
    address: { type: String, required: true },
    status: { type: String, enum: ['pending', 'processing', 'approved', 'rejected', 'completed'], default: 'pending' },
    transactionHash: { type: String, default: '' },
    fee: { type: Number, default: 0 },
    networkFee: { type: Number, default: 0 },
    twoFAVerified: { type: Boolean, default: false },
    approvedBy: { type: Number, default: null },
    approvedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
});

// ========== نماذج السجلات ==========
const auditLogSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    action: { type: String, required: true },
    details: { type: Object, default: {} },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now }
});

const dailyStatsSchema = new mongoose.Schema({
    date: { type: String, required: true, unique: true },
    totalUsers: { type: Number, default: 0 },
    newUsers: { type: Number, default: 0 },
    verifiedUsers: { type: Number, default: 0 },
    totalTrades: { type: Number, default: 0 },
    totalVolume: { type: Number, default: 0 },
    totalCommission: { type: Number, default: 0 },
    activeOffers: { type: Number, default: 0 },
    pendingKyc: { type: Number, default: 0 },
    totalReferralCommissions: { type: Number, default: 0 },
    avgPrice: { type: Number, default: 0 },
    highPrice: { type: Number, default: 0 },
    lowPrice: { type: Number, default: 0 }
});

// ========== نموذج الدردشة ==========
const chatMessageSchema = new mongoose.Schema({
    chatType: { type: String, enum: ['global', 'trade'], default: 'global' },
    senderId: { type: Number, required: true },
    receiverId: { type: Number, default: null },
    message: { type: String, default: '' },
    messageType: { type: String, enum: ['text', 'image', 'system'], default: 'text' },
    imageFileId: { type: String, default: '' },
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// ========== إنشاء الفهارس ==========
userSchema.index({ userId: 1 });
walletSchema.index({ userId: 1 });
orderSchema.index({ type: 1, price: 1, status: 1 });
orderSchema.index({ userId: 1, status: 1 });
tradeSchema.index({ createdAt: -1 });
candlestickSchema.index({ timeframe: 1, timestamp: 1 });
candlestickSchema.index({ isReal: 1 });
marketPriceSchema.index({ symbol: 1 });
depositRequestSchema.index({ status: 1, address: 1 });
depositRequestSchema.index({ userId: 1, status: 1 });

// ========== إنشاء النماذج ==========
const User = mongoose.model('User', userSchema);
const Wallet = mongoose.model('Wallet', walletSchema);
const KycRequest = mongoose.model('KycRequest', kycRequestSchema);
const Order = mongoose.model('Order', orderSchema);
const Trade = mongoose.model('Trade', tradeSchema);
const Candlestick = mongoose.model('Candlestick', candlestickSchema);
const MarketPrice = mongoose.model('MarketPrice', marketPriceSchema);
const DepositRequest = mongoose.model('DepositRequest', depositRequestSchema);
const WithdrawRequest = mongoose.model('WithdrawRequest', withdrawRequestSchema);
const AuditLog = mongoose.model('AuditLog', auditLogSchema);
const DailyStats = mongoose.model('DailyStats', dailyStatsSchema);
const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

module.exports = { 
    User, Wallet, KycRequest, Order, Trade, Candlestick, MarketPrice,
    DepositRequest, WithdrawRequest, AuditLog, DailyStats, ChatMessage
};
