const mongoose = require('mongoose');
const crypto = require('crypto');
const { ethers } = require('ethers');
const { Connection, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { AptosAccount } = require('aptos');
const CryptoJS = require('crypto-js');
const { User, Wallet, P2pOffer, Trade, DepositRequest, WithdrawRequest, Review, DailyStats } = require('./models');

class Database {
    constructor() {
        this.connected = false;
        this.encryptionKey = process.env.ENCRYPTION_KEY;
        this.platformFee = parseFloat(process.env.PLATFORM_FEE_PERCENT) / 100;
        this.commissionWallets = {
            bnb: process.env.COMMISSION_WALLET_BNB,
            polygon: process.env.COMMISSION_WALLET_POLYGON,
            solana: process.env.COMMISSION_WALLET_SOLANA,
            aptos: process.env.COMMISSION_WALLET_APTOS
        };
        this.supportedCurrencies = process.env.SUPPORTED_CURRENCIES.split(',');
        this.paymentMethods = process.env.PAYMENT_METHODS.split(',');
        this.sudanBanks = process.env.SUDAN_BANKS.split(',');
    }

    generateSignature(data) {
        return crypto.createHash('sha256').update(`${data}-${Date.now()}-${Math.random()}`).digest('hex');
    }

    encryptPrivateKey(privateKey) {
        return CryptoJS.AES.encrypt(privateKey, this.encryptionKey).toString();
    }

    decryptPrivateKey(encryptedKey) {
        const bytes = CryptoJS.AES.decrypt(encryptedKey, this.encryptionKey);
        return bytes.toString(CryptoJS.enc.Utf8);
    }

    async connect() {
        if (this.connected) return;
        try {
            await mongoose.connect(process.env.MONGODB_URI, {
                dbName: process.env.MONGODB_DB_NAME || 'p2p_exchange',
                serverSelectionTimeoutMS: 5000
            });
            this.connected = true;
            console.log('✅ MongoDB connected');
        } catch (error) {
            console.error('❌ MongoDB error:', error);
            throw error;
        }
    }

    // ========== إنشاء المحافظ ==========
    async createBnbWallet() {
        const wallet = ethers.Wallet.createRandom();
        return { address: wallet.address, encryptedPrivateKey: this.encryptPrivateKey(wallet.privateKey) };
    }
    async createPolygonWallet() {
        const wallet = ethers.Wallet.createRandom();
        return { address: wallet.address, encryptedPrivateKey: this.encryptPrivateKey(wallet.privateKey) };
    }
    async createSolanaWallet() {
        const keypair = Keypair.generate();
        return { address: keypair.publicKey.toString(), encryptedPrivateKey: this.encryptPrivateKey(JSON.stringify(Array.from(keypair.secretKey))) };
    }
    async createAptosWallet() {
        const account = new AptosAccount();
        return { address: account.address().hex(), encryptedPrivateKey: this.encryptPrivateKey(account.toPrivateKeyObject().privateKeyHex) };
    }

    async getUserWallet(userId) {
        let wallet = await Wallet.findOne({ userId });
        if (!wallet) {
            const [bnb, polygon, solana, aptos] = await Promise.all([
                this.createBnbWallet(), this.createPolygonWallet(), this.createSolanaWallet(), this.createAptosWallet()
            ]);
            wallet = await Wallet.create({
                userId,
                bnbAddress: bnb.address,
                bnbEncryptedPrivateKey: bnb.encryptedPrivateKey,
                polygonAddress: polygon.address,
                polygonEncryptedPrivateKey: polygon.encryptedPrivateKey,
                solanaAddress: solana.address,
                solanaEncryptedPrivateKey: solana.encryptedPrivateKey,
                aptosAddress: aptos.address,
                aptosEncryptedPrivateKey: aptos.encryptedPrivateKey,
                usdBalance: 0,
                walletSignature: this.generateSignature(`wallet-${userId}`)
            });
        }
        return wallet;
    }

    // ========== تسجيل المستخدم ==========
    async registerUser(userId, username, firstName, lastName, phone, email, country, city, referrerId = null, language = 'ar') {
        await this.connect();
        let user = await User.findOne({ userId });
        if (!user) {
            const wallet = await this.getUserWallet(userId);
            user = await User.create({
                userId, username: username || '', firstName: firstName || '', lastName: lastName || '',
                phoneNumber: phone || '', email: email || '', country: country || 'SD', city: city || '',
                language, walletId: wallet._id, referrerId
            });
            await this.updateDailyStats('totalUsers', 'newUsers');
            if (referrerId) {
                const referrer = await User.findOne({ userId: referrerId });
                if (referrer) {
                    await User.updateOne({ userId: referrerId }, { $inc: { referralCount: 1 } });
                }
            }
            return true;
        }
        return false;
    }

    async updateUserBankDetails(userId, bankName, accountNumber, accountName) {
        await User.updateOne({ userId }, { bankName, bankAccountNumber: accountNumber, bankAccountName: accountName });
        return true;
    }

    async getUser(userId) { return await User.findOne({ userId }); }
    
    async getUserStats(userId) {
        const user = await this.getUser(userId);
        if (!user) return null;
        const wallet = await this.getUserWallet(userId);
        const activeOffers = await P2pOffer.countDocuments({ userId, status: 'active' });
        const pendingTrades = await Trade.countDocuments({ $or: [{ buyerId: userId }, { sellerId: userId }], status: { $in: ['pending', 'paid'] } });
        return {
            ...user.toObject(),
            usdBalance: wallet.usdBalance,
            walletAddresses: {
                bnb: wallet.bnbAddress,
                polygon: wallet.polygonAddress,
                solana: wallet.solanaAddress,
                aptos: wallet.aptosAddress
            },
            walletSignature: wallet.walletSignature,
            activeOffers,
            pendingTrades
        };
    }

    async addUsdBalance(userId, amount, reason) {
        await Wallet.updateOne({ userId }, { $inc: { usdBalance: amount } });
        return true;
    }

    async deductUsdBalance(userId, amount, reason) {
        const wallet = await this.getUserWallet(userId);
        if (wallet.usdBalance < amount) return false;
        await Wallet.updateOne({ userId }, { $inc: { usdBalance: -amount } });
        return true;
    }

    // ========== عروض P2P ==========
    async createOffer(userId, type, currency, fiatAmount, price, paymentMethod, paymentDetails, bankName, bankAccountNumber, bankAccountName, minAmount, maxAmount) {
        const user = await this.getUser(userId);
        if (!user) return { success: false, message: 'المستخدم غير موجود' };
        
        const wallet = await this.getUserWallet(userId);
        const usdValue = fiatAmount / price;
        
        if (type === 'sell' && wallet.usdBalance < usdValue) {
            return { success: false, message: `❌ رصيد غير كافٍ! لديك ${wallet.usdBalance.toFixed(2)} USD\nتحتاج: ${usdValue.toFixed(2)} USD` };
        }
        
        const offer = await P2pOffer.create({
            userId, type, currency, fiatAmount, price,
            paymentMethod, paymentDetails, bankName, bankAccountNumber, bankAccountName,
            minAmount: minAmount || 10, maxAmount: maxAmount || 100000
        });
        
        await this.updateDailyStats('activeOffers', 1);
        
        const currencyNames = {
            USD: 'دولار أمريكي', EUR: 'يورو', GBP: 'جنيه إسترليني',
            SAR: 'ريال سعودي', AED: 'درهم إماراتي', EGP: 'جنيه مصري',
            SDG: 'جنيه سوداني', IQD: 'دينار عراقي', JOD: 'دينار أردني',
            KWD: 'دينار كويتي', QAR: 'ريال قطري', BHD: 'دينار بحريني',
            OMR: 'ريال عماني', TRY: 'ليرة تركية', INR: 'روبية هندية', PKR: 'روبية باكستانية'
        };
        
        return {
            success: true,
            offerId: offer._id,
            message: `✅ *تم إنشاء عرض ${type === 'sell' ? 'بيع' : 'شراء'}!*\n\n` +
                `💰 *المبلغ:* ${fiatAmount.toFixed(2)} ${currency} (${currencyNames[currency] || currency})\n` +
                `📊 *السعر:* ${price.toFixed(2)} ${currency}/USD\n` +
                `💵 *القيمة بالدولار:* ${usdValue.toFixed(2)} USD\n` +
                `🏦 *طريقة الدفع:* ${paymentMethod}\n` +
                `${bankName ? `🏛️ *البنك:* ${bankName}\n` : ''}` +
                `${bankAccountNumber ? `🔢 *رقم الحساب:* ${bankAccountNumber}\n` : ''}` +
                `${bankAccountName ? `👤 *اسم الحساب:* ${bankAccountName}\n` : ''}` +
                `⚠️ *الحد الأدنى:* ${minAmount || 10} ${currency} | *الحد الأقصى:* ${maxAmount || 100000} ${currency}`
        };
    }

    async getOffers(type = null, currency = null, sortBy = 'price', order = 'asc', limit = 50) {
        const query = { status: 'active' };
        if (type) query.type = type;
        if (currency) query.currency = currency;
        
        const sort = {};
        sort[sortBy] = order === 'asc' ? 1 : -1;
        
        const offers = await P2pOffer.find(query).sort(sort).limit(limit).lean();
        
        const users = await User.find({ userId: { $in: offers.map(o => o.userId) } });
        const userMap = {};
        users.forEach(u => { userMap[u.userId] = u; });
        
        return offers.map(offer => ({
            ...offer,
            username: userMap[offer.userId]?.username,
            firstName: userMap[offer.userId]?.firstName,
            rating: userMap[offer.userId]?.rating || 5.0,
            completedTrades: userMap[offer.userId]?.completedTrades || 0,
            isVerified: userMap[offer.userId]?.isVerified || false,
            isMerchant: userMap[offer.userId]?.isMerchant || false
        }));
    }

    async getUserOffers(userId) {
        return await P2pOffer.find({ userId, status: 'active' }).sort({ createdAt: -1 }).lean();
    }

    async cancelOffer(offerId, userId) {
        const offer = await P2pOffer.findOne({ _id: offerId, userId, status: 'active' });
        if (!offer) return { success: false, message: 'العرض غير موجود' };
        
        await P2pOffer.updateOne({ _id: offerId }, { status: 'cancelled' });
        await this.updateDailyStats('activeOffers', -1);
        
        return { success: true, message: '✅ تم إلغاء العرض بنجاح' };
    }

    // ========== بدء صفقة ==========
    async startTrade(offerId, buyerId) {
        const offer = await P2pOffer.findOne({ _id: offerId, status: 'active' });
        if (!offer) return { success: false, message: 'العرض غير موجود' };
        
        if (offer.userId === buyerId) return { success: false, message: 'لا يمكنك شراء عرضك الخاص' };
        
        const buyer = await this.getUser(buyerId);
        const seller = await this.getUser(offer.userId);
        
        if (!buyer || !seller) return { success: false, message: 'مستخدم غير موجود' };
        
        const totalUsd = offer.fiatAmount / offer.price;
        const fee = totalUsd * this.platformFee;
        
        if (offer.type === 'sell') {
            const sellerWallet = await this.getUserWallet(offer.userId);
            if (sellerWallet.usdBalance < totalUsd) {
                await P2pOffer.updateOne({ _id: offerId }, { status: 'cancelled' });
                return { success: false, message: 'البائع ليس لديه رصيد كافٍ' };
            }
        }
        
        const trade = await Trade.create({
            offerId, buyerId, sellerId: offer.userId,
            currency: offer.currency, amount: offer.fiatAmount,
            price: offer.price, totalUsd, fee,
            paymentMethod: offer.paymentMethod,
            buyerBankDetails: `${buyer.bankName} - ${buyer.bankAccountNumber} - ${buyer.bankAccountName}`,
            sellerBankDetails: `${offer.bankName} - ${offer.bankAccountNumber} - ${offer.bankAccountName}`,
            status: 'pending'
        });
        
        await P2pOffer.updateOne({ _id: offerId }, { status: 'pending', counterpartyId: buyerId });
        
        const paymentDetails = offer.type === 'sell' ? offer.paymentDetails : buyer.bankDetails;
        
        return {
            success: true,
            tradeId: trade._id,
            sellerPaymentDetails: offer.type === 'sell' ? offer.paymentDetails : '',
            buyerPaymentDetails: offer.type === 'buy' ? offer.paymentDetails : '',
            totalUsd,
            fee,
            message: `🔄 *تم بدء الصفقة!*\n\n` +
                `💰 *المبلغ:* ${offer.fiatAmount.toFixed(2)} ${offer.currency}\n` +
                `💵 *القيمة:* ${totalUsd.toFixed(2)} USD\n` +
                `💸 *عمولة المنصة:* ${fee.toFixed(2)} USD\n` +
                `🏦 *طريقة الدفع:* ${offer.paymentMethod}\n` +
                `📝 *تفاصيل ${offer.type === 'sell' ? 'البائع' : 'المشتري'}:*\n${offer.type === 'sell' ? offer.paymentDetails : ''}\n\n` +
                `✅ *بعد التحويل، أرسل:*\n/send_proof ${trade._id} [رابط الصورة]`
        };
    }

    // ========== تأكيد الدفع ==========
    async confirmPayment(tradeId, buyerId, proofImage) {
        const trade = await Trade.findOne({ _id: tradeId, buyerId, status: 'pending' });
        if (!trade) return { success: false, message: 'الصفقة غير موجودة' };
        
        await Trade.updateOne({ _id: tradeId }, { paymentProof: proofImage, status: 'paid', paidAt: new Date() });
        
        const seller = await this.getUser(trade.sellerId);
        
        return {
            success: true,
            sellerId: trade.sellerId,
            message: `✅ *تم استلام إثبات الدفع!*\n\n` +
                `📋 *رقم الصفقة:* ${tradeId}\n` +
                `💰 *المبلغ:* ${trade.amount.toFixed(2)} ${trade.currency}\n` +
                `🖼️ *رابط الإثبات:* ${proofImage}\n\n` +
                `🔓 *بعد التحقق، قم بتحرير العملة:*\n/release_crystals ${tradeId}`
        };
    }

    // ========== تحرير العملة ==========
    async releaseCrystals(tradeId, sellerId) {
        const trade = await Trade.findOne({ _id: tradeId, sellerId, status: 'paid' });
        if (!trade) return { success: false, message: 'الصفقة غير موجودة' };
        
        const sellerWallet = await this.getUserWallet(sellerId);
        const buyerWallet = await this.getUserWallet(trade.buyerId);
        
        if (trade.offerId) {
            const offer = await P2pOffer.findById(trade.offerId);
            if (offer && offer.type === 'sell') {
                const sellerWallet = await this.getUserWallet(sellerId);
                if (sellerWallet.usdBalance < trade.totalUsd) {
                    await Trade.updateOne({ _id: tradeId }, { status: 'disputed' });
                    return { success: false, message: '⚠️ رصيد البائع غير كافٍ! تم فتح نزاع' };
                }
                await Wallet.updateOne({ userId: sellerId }, { $inc: { usdBalance: -trade.totalUsd } });
                await Wallet.updateOne({ userId: trade.buyerId }, { $inc: { usdBalance: trade.totalUsd - trade.fee } });
            } else if (offer && offer.type === 'buy') {
                const buyerWallet = await this.getUserWallet(trade.buyerId);
                if (buyerWallet.usdBalance < trade.totalUsd) {
                    await Trade.updateOne({ _id: tradeId }, { status: 'disputed' });
                    return { success: false, message: '⚠️ رصيد المشتري غير كافٍ! تم فتح نزاع' };
                }
                await Wallet.updateOne({ userId: trade.buyerId }, { $inc: { usdBalance: -trade.totalUsd } });
                await Wallet.updateOne({ userId: sellerId }, { $inc: { usdBalance: trade.totalUsd - trade.fee } });
            }
        }
        
        // خصم العمولة للمنصة
        await Wallet.updateOne({ userId: 0 }, { $inc: { usdBalance: trade.fee } });
        
        await Trade.updateOne({ _id: tradeId }, { status: 'completed', releasedAt: new Date(), completedAt: new Date() });
        await P2pOffer.updateOne({ _id: trade.offerId }, { status: 'completed' });
        
        await User.updateOne({ userId: sellerId }, { $inc: { completedTrades: 1, totalTraded: trade.totalUsd } });
        await User.updateOne({ userId: trade.buyerId }, { $inc: { completedTrades: 1, totalTraded: trade.totalUsd } });
        
        await this.updateDailyStats('totalTrades', 1);
        await this.updateDailyStats('totalVolume', trade.totalUsd);
        await this.updateDailyStats('totalCommission', trade.fee);
        await this.updateDailyStats('activeOffers', -1);
        
        return {
            success: true,
            buyerId: trade.buyerId,
            message: `✅ *تم تحرير العملة بنجاح!*\n\n` +
                `📋 *رقم الصفقة:* ${tradeId}\n` +
                `💰 *المبلغ:* ${trade.amount.toFixed(2)} ${trade.currency}\n` +
                `💵 *القيمة:* ${trade.totalUsd.toFixed(2)} USD\n` +
                `💸 *عمولة المنصة:* ${trade.fee.toFixed(2)} USD\n\n` +
                `⭐ *تقييم الصفقة:*\n/rate ${tradeId} [5] [تعليق]`
        };
    }

    // ========== النزاعات ==========
    async openDispute(tradeId, userId, reason) {
        const trade = await Trade.findOne({ _id: tradeId, $or: [{ buyerId: userId }, { sellerId: userId }], status: { $in: ['pending', 'paid'] } });
        if (!trade) return { success: false, message: 'الصفقة غير موجودة' };
        
        await Trade.updateOne({ _id: tradeId }, { status: 'disputed', disputeReason: reason, disputeOpenedBy: userId });
        
        return {
            success: true,
            message: `⚠️ *تم فتح نزاع!*\n\n` +
                `📋 *رقم الصفقة:* ${tradeId}\n` +
                `📝 *السبب:* ${reason}\n\n` +
                `👨‍⚖️ *سيتم مراجعة النزاع من قبل الإدارة خلال 24 ساعة*`
        };
    }

    // ========== التقييمات ==========
    async addReview(tradeId, reviewerId, rating, comment) {
        const trade = await Trade.findOne({ _id: tradeId, status: 'completed' });
        if (!trade) return { success: false, message: 'الصفقة غير موجودة' };
        
        const existing = await Review.findOne({ tradeId, reviewerId });
        if (existing) return { success: false, message: 'لقد قمت بتقييم هذه الصفقة بالفعل' };
        
        const targetId = reviewerId === trade.buyerId ? trade.sellerId : trade.buyerId;
        
        await Review.create({ tradeId, reviewerId, targetId, rating, comment });
        
        // تحديث تقييم المستخدم
        const reviews = await Review.find({ targetId });
        const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
        await User.updateOne({ userId: targetId }, { rating: avgRating });
        
        return { success: true, message: `⭐ *تم التقييم!*\n\n📊 *تقييمك:* ${rating}/5\n${comment ? `📝 *تعليق:* ${comment}` : ''}` };
    }

    // ========== الإيداع والسحب ==========
    async requestDeposit(userId, amount, currency, network) {
        const wallet = await this.getUserWallet(userId);
        
        let address;
        switch(network) {
            case 'bnb': address = wallet.bnbAddress; break;
            case 'polygon': address = wallet.polygonAddress; break;
            case 'solana': address = wallet.solanaAddress; break;
            case 'aptos': address = wallet.aptosAddress; break;
            default: return { success: false, message: 'شبكة غير مدعومة' };
        }
        
        const request = await DepositRequest.create({ userId, amount, currency, network, address });
        
        return {
            success: true,
            requestId: request._id,
            address,
            message: `📤 *طلب إيداع ${currency}*\n\n` +
                `🌐 *الشبكة:* ${network.toUpperCase()}\n` +
                `💰 *المبلغ:* ${amount} ${currency}\n` +
                `📤 *العنوان:*\n\`${address}\`\n\n` +
                `⚠️ *أرسل فقط ${currency} على شبكة ${network.toUpperCase()}*\n` +
                `📎 *بعد الإرسال:* /confirm_deposit ${request._id} [رابط المعاملة]`
        };
    }

    async confirmDeposit(requestId, transactionHash, adminId) {
        const request = await DepositRequest.findOne({ _id: requestId, status: 'pending' });
        if (!request) return { success: false, message: 'الطلب غير موجود' };
        
        await DepositRequest.updateOne({ _id: requestId }, { status: 'completed', transactionHash, completedAt: new Date() });
        await Wallet.updateOne({ userId: request.userId }, { $inc: { usdBalance: request.amount } });
        
        return { success: true, message: `✅ تم إضافة ${request.amount} USD إلى رصيدك` };
    }

    async requestWithdraw(userId, amount, currency, network, address) {
        const wallet = await this.getUserWallet(userId);
        if (wallet.usdBalance < amount) {
            return { success: false, message: `❌ رصيد غير كافٍ! لديك ${wallet.usdBalance.toFixed(2)} USD` };
        }
        
        const fee = amount * 0.02; // 2% عمولة سحب
        const totalAmount = amount + fee;
        
        const request = await WithdrawRequest.create({ userId, amount, currency, network, address, fee });
        
        return {
            success: true,
            requestId: request._id,
            message: `✅ *تم إنشاء طلب سحب #${request._id.toString().slice(-6)}*\n\n` +
                `💰 *المبلغ:* ${amount} ${currency}\n` +
                `💸 *العمولة:* ${fee.toFixed(2)} USD\n` +
                `📤 *العنوان:* \`${address}\`\n\n` +
                `⏳ *سيتم مراجعة الطلب من قبل الإدارة*`
        };
    }

    async confirmWithdraw(requestId, transactionHash, adminId) {
        const request = await WithdrawRequest.findOne({ _id: requestId, status: 'pending' });
        if (!request) return { success: false, message: 'الطلب غير موجود' };
        
        await WithdrawRequest.updateOne({ _id: requestId }, { status: 'completed', transactionHash, approvedAt: new Date() });
        await Wallet.updateOne({ userId: request.userId }, { $inc: { usdBalance: -(request.amount + request.fee) } });
        
        return { success: true, message: `✅ تمت الموافقة على سحب ${request.amount} USD` };
    }

    // ========== إحصائيات ==========
    async getLeaderboard(limit = 15) {
        return await User.find({}).sort({ totalTraded: -1 }).limit(limit).select('userId username firstName totalTraded completedTrades rating isVerified isMerchant').lean();
    }

    async getGlobalStats() {
        const stats = await User.aggregate([
            { $group: { _id: null, totalUsers: { $sum: 1 }, totalTraded: { $sum: '$totalTraded' }, avgRating: { $avg: '$rating' } } }
        ]);
        const totalActiveOffers = await P2pOffer.countDocuments({ status: 'active' });
        const totalPendingTrades = await Trade.countDocuments({ status: { $in: ['pending', 'paid'] } });
        
        return {
            users: stats[0]?.totalUsers || 0,
            totalTraded: stats[0]?.totalTraded?.toFixed(2) || 0,
            avgRating: stats[0]?.avgRating?.toFixed(1) || 5.0,
            activeOffers: totalActiveOffers,
            pendingTrades: totalPendingTrades
        };
    }

    async getTodayStats() {
        const today = new Date().toISOString().split('T')[0];
        return await DailyStats.findOne({ date: today });
    }
    
    async updateDailyStats(type, value = 1) {
        const today = new Date().toISOString().split('T')[0];
        let s = await DailyStats.findOne({ date: today });
        if (!s) s = await DailyStats.create({ date: today });
        const u = {};
        if (type === 'totalUsers') u.totalUsers = (s.totalUsers || 0) + value;
        if (type === 'newUsers') u.newUsers = (s.newUsers || 0) + value;
        if (type === 'totalTrades') u.totalTrades = (s.totalTrades || 0) + value;
        if (type === 'totalVolume') u.totalVolume = (s.totalVolume || 0) + value;
        if (type === 'totalCommission') u.totalCommission = (s.totalCommission || 0) + value;
        if (type === 'activeOffers') u.activeOffers = (s.activeOffers || 0) + value;
        await DailyStats.updateOne({ date: today }, { $inc: u });
    }
    
    async getPendingWithdraws() { return await WithdrawRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).lean(); }
    async getPendingDeposits() { return await DepositRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).lean(); }
    async getDisputedTrades() { return await Trade.find({ status: 'disputed' }).sort({ createdAt: -1 }).lean(); }
    
    async searchUsers(query) {
        const regex = new RegExp(query, 'i');
        return await User.find({ $or: [{ username: regex }, { firstName: regex }, { lastName: regex }, { phoneNumber: regex }, { email: regex }, { userId: !isNaN(query) ? parseInt(query) : -1 }] }).limit(20).select('userId username firstName lastName phoneNumber email rating isVerified isMerchant');
    }
    
    async setLanguage(userId, language) { await User.updateOne({ userId }, { language }); return true; }
    async updateBankDetails(userId, bankName, accountNumber, accountName) { await User.updateOne({ userId }, { bankName, bankAccountNumber: accountNumber, bankAccountName: accountName }); return true; }
}

module.exports = new Database();
