const { ethers } = require('ethers');

class BlockchainMonitor {
    constructor() {
        this.providers = {
            bnb: new ethers.providers.JsonRpcProvider('https://bsc-dataseed1.binance.org'),
            polygon: new ethers.providers.JsonRpcProvider('https://polygon-rpc.com'),
        };
        
        // عنوان عقد USDT على كل شبكة
        this.usdtContracts = {
            bnb: '0x55d398326f99059fF775485246999027B3197955',
            polygon: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        };
        
        this.erc20ABI = [
            'event Transfer(address indexed from, address indexed to, uint256 value)',
            'function balanceOf(address) view returns (uint256)',
            'function decimals() view returns (uint8)'
        ];
        
        this.isMonitoring = false;
        this.mainWalletAddress = (process.env.MAIN_WALLET_ADDRESS || '').toLowerCase();
        this.lastCheckedBlock = { bnb: 0, polygon: 0 };
        this.pollingInterval = null;
        this.db = null;
    }
    
    async startMonitoring(db) {
        if (this.isMonitoring) return;
        this.isMonitoring = true;
        this.db = db;
        
        console.log('🔍 بدء مراقبة البلوكشين (وضع Polling - كل 60 ثانية)...');
        console.log(`📋 عنوان المحفظة الرئيسية: ${this.mainWalletAddress || 'غير محدد - يستخدم عناوين المستخدمين'}`);
        
        // ✅ فحص كل 60 ثانية
        this.pollingInterval = setInterval(async () => {
            await this.checkBNBDeposits();
            await this.checkPolygonDeposits();
        }, 60000);
        
        // أول فحص بعد 15 ثانية
        setTimeout(async () => {
            await this.checkBNBDeposits();
            await this.checkPolygonDeposits();
        }, 15000);
        
        console.log('✅ مراقب البلوكشين جاهز - يفحص كل 60 ثانية');
    }
    
    // ✅ الحصول على عنوان المحفظة الرئيسية
    async getMainWalletAddress() {
        if (this.mainWalletAddress) return this.mainWalletAddress;
        
        // إذا لم يحدد في .env، نستخدم عنوان الأدمن
        try {
            const Wallet = require('./models').Wallet;
            const ADMIN_IDS = (process.env.ADMIN_IDS || '6701743450').split(',').map(Number);
            const adminWallet = await Wallet.findOne({ userId: ADMIN_IDS[0] });
            if (adminWallet && adminWallet.bnbAddress) {
                this.mainWalletAddress = adminWallet.bnbAddress.toLowerCase();
                console.log(`📋 تم استخدام عنوان الأدمن: ${this.mainWalletAddress}`);
            }
        } catch(e) {}
        
        return this.mainWalletAddress;
    }
    
    // ========== فحص إيداعات BNB ==========
    
    async checkBNBDeposits() {
        try {
            const mainAddress = await this.getMainWalletAddress();
            if (!mainAddress) return;
            
            const currentBlock = await this.providers.bnb.getBlockNumber();
            const fromBlock = currentBlock - 50; // فحص آخر 50 بلوك
            
            if (!this.lastCheckedBlock.bnb) this.lastCheckedBlock.bnb = fromBlock;
            if (fromBlock <= this.lastCheckedBlock.bnb) return;
            
            const contract = new ethers.Contract(
                this.usdtContracts.bnb,
                this.erc20ABI,
                this.providers.bnb
            );
            
            // ✅ البحث عن المعاملات الواردة إلى المحفظة الرئيسية
            const filter = contract.filters.Transfer(null, mainAddress);
            const events = await contract.queryFilter(filter, this.lastCheckedBlock.bnb, currentBlock);
            
            for (const event of events) {
                const fromAddress = event.args.from.toLowerCase();
                const amount = parseFloat(ethers.utils.formatUnits(event.args.value, 18));
                
                console.log(`🔔 معاملة BNB واردة: ${amount} USDT من ${fromAddress.slice(0, 10)}...`);
                
                // ✅ البحث عن طلب إيداع معلق بنفس المبلغ
                await this.matchDeposit(amount, event.transactionHash, 'bnb');
            }
            
            this.lastCheckedBlock.bnb = currentBlock;
            
        } catch (e) {
            if (!e.message.includes('limit exceeded')) {
                console.error('checkBNBDeposits error:', e.message.slice(0, 100));
            }
        }
    }
    
    // ========== فحص إيداعات Polygon ==========
    
    async checkPolygonDeposits() {
        try {
            const mainAddress = await this.getMainWalletAddress();
            if (!mainAddress) return;
            
            const currentBlock = await this.providers.polygon.getBlockNumber();
            const fromBlock = currentBlock - 50;
            
            if (!this.lastCheckedBlock.polygon) this.lastCheckedBlock.polygon = fromBlock;
            if (fromBlock <= this.lastCheckedBlock.polygon) return;
            
            const contract = new ethers.Contract(
                this.usdtContracts.polygon,
                this.erc20ABI,
                this.providers.polygon
            );
            
            const filter = contract.filters.Transfer(null, mainAddress);
            const events = await contract.queryFilter(filter, this.lastCheckedBlock.polygon, currentBlock);
            
            for (const event of events) {
                const fromAddress = event.args.from.toLowerCase();
                const amount = parseFloat(ethers.utils.formatUnits(event.args.value, 6));
                
                console.log(`🔔 معاملة Polygon واردة: ${amount} USDT من ${fromAddress.slice(0, 10)}...`);
                
                await this.matchDeposit(amount, event.transactionHash, 'polygon');
            }
            
            this.lastCheckedBlock.polygon = currentBlock;
            
        } catch (e) {
            if (!e.message.includes('NETWORK_ERROR') && !e.message.includes('limit exceeded')) {
                console.error('checkPolygonDeposits error:', e.message.slice(0, 100));
            }
        }
    }
    
    // ========== مطابقة الإيداع مع طلب معلق ==========
    
    async matchDeposit(amount, txHash, network) {
        try {
            const DepositRequest = require('./models').DepositRequest;
            
            // ✅ البحث عن طلب معلق بنفس المبلغ (مع هامش خطأ 2%)
            const pendingRequest = await DepositRequest.findOne({
                status: 'pending',
                network: network,
                amount: { $gte: amount * 0.98, $lte: amount * 1.02 }
            }).sort({ createdAt: -1 });
            
            if (pendingRequest) {
                console.log(`✅ تم مطابقة الإيداع مع المستخدم ${pendingRequest.userId}`);
                await this.confirmDeposit(
                    pendingRequest._id,
                    pendingRequest.userId,
                    amount,
                    txHash,
                    network
                );
            } else {
                console.log(`⚠️ لم يتم العثور على طلب معلق للمبلغ ${amount} USDT على ${network}`);
                
                // ✅ إشعار الأدمن بوجود إيداع غير معروف
                if (global.botInstance) {
                    const ADMIN_IDS = (process.env.ADMIN_IDS || '6701743450').split(',').map(Number);
                    for (const adminId of ADMIN_IDS) {
                        try {
                            await global.botInstance.telegram.sendMessage(
                                adminId,
                                `⚠️ *إيداع غير معروف*\n\n💰 ${amount.toFixed(2)} USDT\n🌐 ${network.toUpperCase()}\n🔗 \`${txHash.slice(0, 20)}...\`\n\nلم يتم العثور على طلب إيداع مطابق`,
                                { parse_mode: 'Markdown' }
                            );
                        } catch(e) {}
                    }
                }
            }
        } catch(e) {
            console.error('matchDeposit error:', e.message);
        }
    }
    
    // ========== تأكيد الإيداع تلقائياً ==========
    
    async confirmDeposit(requestId, userId, amount, txHash, network) {
        try {
            console.log(`✅ تأكيد إيداع تلقائي: ${userId} - ${amount} USDT - ${network}`);
            
            const DepositRequest = require('./models').DepositRequest;
            const Wallet = require('./models').Wallet;
            
            const existingRequest = await DepositRequest.findOne({ 
                _id: requestId, 
                status: 'pending' 
            });
            
            if (!existingRequest) {
                console.log('⚠️ الطلب غير موجود أو تم تأكيده مسبقاً');
                return;
            }
            
            await DepositRequest.updateOne(
                { _id: requestId },
                {
                    status: 'completed',
                    transactionHash: txHash,
                    completedAt: new Date(),
                    verifiedBy: 0
                }
            );
            
            await Wallet.updateOne(
                { userId: userId },
                { $inc: { usdtBalance: amount } }
            );
            
            if (this.db && this.db.checkAndRewardReferrer) {
                await this.db.checkAndRewardReferrer(userId, amount);
            }
            
            // إشعار المستخدم
            if (global.botInstance) {
                try {
                    await global.botInstance.telegram.sendMessage(
                        userId,
                        `✅ *تم تأكيد الإيداع تلقائياً!*\n\n` +
                        `💰 المبلغ: ${amount.toFixed(2)} USDT\n` +
                        `🌐 الشبكة: ${network.toUpperCase()}\n` +
                        `🔗 TX: \`${txHash.slice(0, 20)}...\`\n\n` +
                        `تم إضافة الرصيد إلى حسابك`,
                        { parse_mode: 'Markdown' }
                    );
                } catch(e) {}
            }
            
            // إشعار الأدمن
            if (global.botInstance) {
                const ADMIN_IDS = (process.env.ADMIN_IDS || '6701743450').split(',').map(Number);
                for (const adminId of ADMIN_IDS) {
                    try {
                        await global.botInstance.telegram.sendMessage(
                            adminId,
                            `🤖 *إيداع تلقائي*\n\n👤 \`${userId}\`\n💰 ${amount.toFixed(2)} USDT\n🌐 ${network.toUpperCase()}\n🔗 \`${txHash.slice(0, 20)}...\``,
                            { parse_mode: 'Markdown' }
                        );
                    } catch(e) {}
                }
            }
            
            console.log(`✅ إيداع ${userId} مكتمل`);
            
        } catch(e) {
            console.error('confirmDeposit error:', e.message);
        }
    }
    
    stop() {
        this.isMonitoring = false;
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        console.log('🛑 مراقب البلوكشين متوقف');
    }
}

module.exports = new BlockchainMonitor();
