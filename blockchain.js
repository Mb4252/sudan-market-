const { ethers } = require('ethers');

class BlockchainMonitor {
    constructor() {
        this.providers = {
            bnb: new ethers.providers.JsonRpcProvider('https://bsc-dataseed1.binance.org'),
            polygon: new ethers.providers.JsonRpcProvider('https://polygon-rpc.com'),
        };
        
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
        this.monitoredAddresses = new Map();
        this.lastCheckedBlock = { bnb: 0, polygon: 0 };
        this.pollingInterval = null;
        this.db = null;
    }
    
    async startMonitoring(db) {
        if (this.isMonitoring) return;
        this.isMonitoring = true;
        this.db = db;
        
        console.log('🔍 بدء مراقبة البلوكشين (وضع Polling - كل 60 ثانية)...');
        await this.loadPendingAddresses();
        
        // ✅ فحص كل 60 ثانية
        this.pollingInterval = setInterval(async () => {
            await this.checkBNBDeposits();
            await this.checkPolygonDeposits();
            // تحديث قائمة العناوين كل 10 دورات (10 دقائق)
            if (Math.random() < 0.05) await this.loadPendingAddresses();
        }, 60000);
        
        // أول فحص بعد 15 ثانية
        setTimeout(async () => {
            await this.checkBNBDeposits();
            await this.checkPolygonDeposits();
        }, 15000);
        
        console.log('✅ مراقب البلوكشين جاهز - يفحص كل 60 ثانية');
    }
    
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
    
    async checkBNBDeposits() {
        try {
            const currentBlock = await this.providers.bnb.getBlockNumber();
            // ✅ فحص آخر 30 بلوك فقط (أقل من دقيقة)
            const fromBlock = currentBlock - 30;
            
            if (!this.lastCheckedBlock.bnb) this.lastCheckedBlock.bnb = fromBlock;
            if (fromBlock <= this.lastCheckedBlock.bnb) return;
            
            const contract = new ethers.Contract(
                this.usdtContracts.bnb,
                this.erc20ABI,
                this.providers.bnb
            );
            
            const filter = contract.filters.Transfer();
            const events = await contract.queryFilter(filter, this.lastCheckedBlock.bnb, currentBlock);
            
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
                        this.monitoredAddresses.delete(toAddress);
                    } else {
                        console.log(`⚠️ مبلغ غير كافٍ: ${receivedAmount} < ${depositInfo.amount}`);
                    }
                }
            }
            
            this.lastCheckedBlock.bnb = currentBlock;
            
        } catch (e) {
            // ✅ تجاهل أخطاء rate limit
            if (!e.message.includes('limit exceeded')) {
                console.error('checkBNBDeposits error:', e.message.slice(0, 100));
            }
        }
    }
    
    async checkPolygonDeposits() {
        try {
            const currentBlock = await this.providers.polygon.getBlockNumber();
            const fromBlock = currentBlock - 30;
            
            if (!this.lastCheckedBlock.polygon) this.lastCheckedBlock.polygon = fromBlock;
            if (fromBlock <= this.lastCheckedBlock.polygon) return;
            
            const contract = new ethers.Contract(
                this.usdtContracts.polygon,
                this.erc20ABI,
                this.providers.polygon
            );
            
            const filter = contract.filters.Transfer();
            const events = await contract.queryFilter(filter, this.lastCheckedBlock.polygon, currentBlock);
            
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
            if (!e.message.includes('limit exceeded') && !e.message.includes('NETWORK_ERROR')) {
                console.error('checkPolygonDeposits error:', e.message.slice(0, 100));
            }
        }
    }
    
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
