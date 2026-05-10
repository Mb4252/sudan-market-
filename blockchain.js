const { ethers } = require('ethers');

class BlockchainMonitor {
    constructor() {
        // استخدام ethers v5 providers
        this.providers = {
            bnb: new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org'),
            polygon: new ethers.providers.JsonRpcProvider('https://polygon-rpc.com'),
        };
        
        // عنوان عقد USDT على كل شبكة
        this.usdtContracts = {
            bnb: '0x55d398326f99059fF775485246999027B3197955',
            polygon: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        };
        
        // ABI للتحقق من المعاملات
        this.erc20ABI = [
            'event Transfer(address indexed from, address indexed to, uint256 value)',
            'function balanceOf(address) view returns (uint256)',
            'function decimals() view returns (uint8)'
        ];
        
        this.isMonitoring = false;
        this.monitoredAddresses = new Map();
        this.lastCheckedBlock = { bnb: 0, polygon: 0 };
        this.pollingInterval = null;
        this.db = null;
    }
    
    // ========== بدء المراقبة بنظام Polling ==========
    
    async startMonitoring(db) {
        if (this.isMonitoring) return;
        this.isMonitoring = true;
        this.db = db;
        
        console.log('🔍 بدء مراقبة البلوكشين (وضع Polling)...');
        
        // تحميل العناوين المراقبة
        await this.loadPendingAddresses();
        
        // ✅ استخدام Polling كل 30 ثانية بدل WebSocket
        this.pollingInterval = setInterval(async () => {
            await this.checkBNBDeposits();
            await this.checkPolygonDeposits();
            // تحديث قائمة العناوين كل 5 دقائق
            if (Math.random() < 0.1) await this.loadPendingAddresses();
        }, 30000); // كل 30 ثانية
        
        // أول فحص فوري
        await this.checkBNBDeposits();
        await this.checkPolygonDeposits();
        
        console.log('✅ مراقب البلوكشين (Polling) جاهز - يفحص كل 30 ثانية');
    }
    
    // ========== تحميل العناوين المعلقة ==========
    
    async loadPendingAddresses() {
        try {
            const DepositRequest = require('./models').DepositRequest;
            const pendingDeposits = await DepositRequest.find({ 
                status: 'pending',
                network: { $in: ['bnb', 'polygon'] }
            });
            
            this.monitoredAddresses.clear();
            
            for (const deposit of pendingDeposits) {
                const address = deposit.address?.toLowerCase();
                if (address) {
                    this.monitoredAddresses.set(address, {
                        requestId: deposit._id,
                        userId: deposit.userId,
                        amount: deposit.amount,
                        network: deposit.network
                    });
                }
            }
            
            if (this.monitoredAddresses.size > 0) {
                console.log(`📋 ${this.monitoredAddresses.size} عناوين قيد المراقبة`);
            }
            
        } catch (e) {
            console.error('loadPendingAddresses error:', e.message);
        }
    }
    
    // ========== فحص إيداعات BNB ==========
    
    async checkBNBDeposits() {
        try {
            // ✅ الحصول على آخر بلوك
            const currentBlock = await this.providers.bnb.getBlockNumber();
            const fromBlock = Math.max(this.lastCheckedBlock.bnb || currentBlock - 100, currentBlock - 500);
            
            if (fromBlock >= currentBlock) return;
            
            const contract = new ethers.Contract(
                this.usdtContracts.bnb,
                this.erc20ABI,
                this.providers.bnb
            );
            
            // ✅ البحث عن أحداث Transfer في البلوكات الجديدة
            const filter = contract.filters.Transfer();
            const events = await contract.queryFilter(filter, fromBlock, currentBlock);
            
            for (const event of events) {
                const toAddress = event.args.to.toLowerCase();
                
                if (this.monitoredAddresses.has(toAddress)) {
                    const depositInfo = this.monitoredAddresses.get(toAddress);
                    const receivedAmount = parseFloat(ethers.utils.formatUnits(event.args.value, 18));
                    
                    console.log(`🔔 معاملة BNB: ${receivedAmount} USDT → ${toAddress.slice(0, 10)}...`);
                    
                    if (receivedAmount >= depositInfo.amount * 0.99) {
                        await this.confirmDeposit(
                            depositInfo.requestId,
                            depositInfo.userId,
                            receivedAmount,
                            event.transactionHash,
                            'bnb'
                        );
                        // إزالة من المراقبة بعد التأكيد
                        this.monitoredAddresses.delete(toAddress);
                    }
                }
            }
            
            this.lastCheckedBlock.bnb = currentBlock;
            
        } catch (e) {
            console.error('checkBNBDeposits error:', e.message);
        }
    }
    
    // ========== فحص إيداعات Polygon ==========
    
    async checkPolygonDeposits() {
        try {
            const currentBlock = await this.providers.polygon.getBlockNumber();
            const fromBlock = Math.max(this.lastCheckedBlock.polygon || currentBlock - 100, currentBlock - 500);
            
            if (fromBlock >= currentBlock) return;
            
            const contract = new ethers.Contract(
                this.usdtContracts.polygon,
                this.erc20ABI,
                this.providers.polygon
            );
            
            const filter = contract.filters.Transfer();
            const events = await contract.queryFilter(filter, fromBlock, currentBlock);
            
            for (const event of events) {
                const toAddress = event.args.to.toLowerCase();
                
                if (this.monitoredAddresses.has(toAddress)) {
                    const depositInfo = this.monitoredAddresses.get(toAddress);
                    const receivedAmount = parseFloat(ethers.utils.formatUnits(event.args.value, 6));
                    
                    console.log(`🔔 معاملة Polygon: ${receivedAmount} USDT → ${toAddress.slice(0, 10)}...`);
                    
                    if (receivedAmount >= depositInfo.amount * 0.99) {
                        await this.confirmDeposit(
                            depositInfo.requestId,
                            depositInfo.userId,
                            receivedAmount,
                            event.transactionHash,
                            'polygon'
                        );
                        this.monitoredAddresses.delete(toAddress);
                    }
                }
            }
            
            this.lastCheckedBlock.polygon = currentBlock;
            
        } catch (e) {
            console.error('checkPolygonDeposits error:', e.message);
        }
    }
    
    // ========== تأكيد الإيداع تلقائياً ==========
    
    async confirmDeposit(requestId, userId, amount, txHash, network) {
        try {
            console.log(`✅ تأكيد إيداع تلقائي: ${userId} - ${amount} USDT - ${network}`);
            
            const DepositRequest = require('./models').DepositRequest;
            const Wallet = require('./models').Wallet;
            
            // التحقق من أن الطلب لم يتم تأكيده مسبقاً
            const existingRequest = await DepositRequest.findOne({ 
                _id: requestId, 
                status: 'pending' 
            });
            
            if (!existingRequest) {
                console.log('⚠️ الطلب غير موجود أو تم تأكيده مسبقاً');
                return;
            }
            
            // ✅ تحديث الطلب إلى مكتمل
            await DepositRequest.updateOne(
                { _id: requestId },
                {
                    status: 'completed',
                    transactionHash: txHash,
                    completedAt: new Date(),
                    verifiedBy: 0 // 0 = تلقائي
                }
            );
            
            // ✅ إضافة الرصيد للمستخدم
            await Wallet.updateOne(
                { userId: userId },
                { $inc: { usdtBalance: amount } }
            );
            
            // ✅ مكافأة المحيل إذا كان أول إيداع
            if (this.db && this.db.checkAndRewardReferrer) {
                await this.db.checkAndRewardReferrer(userId, amount);
            }
            
            // ✅ إشعار المستخدم
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
                } catch (e) {}
            }
            
            // ✅ إشعار الأدمن
            if (global.botInstance) {
                const ADMIN_IDS = (process.env.ADMIN_IDS || '6701743450').split(',').map(Number);
                for (const adminId of ADMIN_IDS) {
                    try {
                        await global.botInstance.telegram.sendMessage(
                            adminId,
                            `🤖 *إيداع تلقائي*\n\n👤 \`${userId}\`\n💰 ${amount.toFixed(2)} USDT\n🌐 ${network.toUpperCase()}\n🔗 \`${txHash.slice(0, 20)}...\``,
                            { parse_mode: 'Markdown' }
                        );
                    } catch (e) {}
                }
            }
            
            console.log(`✅ إيداع ${userId} مكتمل`);
            
        } catch (e) {
            console.error('confirmDeposit error:', e.message);
        }
    }
    
    // ========== إيقاف المراقبة ==========
    
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
