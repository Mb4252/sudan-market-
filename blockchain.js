const { ethers } = require('ethers');
const { Connection, PublicKey } = require('@solana/web3.js');

class BlockchainMonitor {
    constructor() {
        // استخدام ethers v5 providers
        this.providers = {
            bnb: new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org'),
            polygon: new ethers.providers.JsonRpcProvider('https://polygon-rpc.com'),
            solana: new Connection('https://api.mainnet-beta.solana.com'),
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
    }
    
    // ========== بدء المراقبة ==========
    
    async startMonitoring(db) {
        if (this.isMonitoring) return;
        this.isMonitoring = true;
        this.db = db;
        
        console.log('🔍 بدء مراقبة البلوكشين...');
        
        // تحميل العناوين المراقبة من الطلبات المعلقة
        await this.loadPendingAddresses();
        
        // مراقبة كل شبكة
        this.monitorBNB();
        this.monitorPolygon();
        
        // تحديث قائمة العناوين كل 5 دقائق
        setInterval(() => this.loadPendingAddresses(), 5 * 60 * 1000);
        
        console.log('✅ مراقب البلوكشين جاهز');
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
    
    // ========== مراقبة BNB ==========
    
    async monitorBNB() {
        try {
            const contract = new ethers.Contract(
                this.usdtContracts.bnb,
                this.erc20ABI,
                this.providers.bnb
            );
            
            // الاستماع لأحداث Transfer
            contract.on('Transfer', async (from, to, value, event) => {
                const toAddress = to.toLowerCase();
                
                if (this.monitoredAddresses.has(toAddress)) {
                    const depositInfo = this.monitoredAddresses.get(toAddress);
                    
                    // استخدام ethers v5 formatUnits
                    const decimals = 18;
                    const receivedAmount = parseFloat(ethers.utils.formatUnits(value, decimals));
                    
                    console.log(`🔔 معاملة واردة على BNB:`);
                    console.log(`   من: ${from}`);
                    console.log(`   إلى: ${toAddress}`);
                    console.log(`   القيمة: ${receivedAmount} USDT`);
                    console.log(`   المطلوب: ${depositInfo.amount} USDT`);
                    
                    if (receivedAmount >= depositInfo.amount * 0.99) { // قبول 99% أو أكثر
                        await this.confirmDeposit(
                            depositInfo.requestId,
                            depositInfo.userId,
                            receivedAmount,
                            event.transactionHash,
                            'bnb'
                        );
                    } else {
                        console.log(`⚠️ مبلغ غير كافٍ: ${receivedAmount} < ${depositInfo.amount}`);
                    }
                }
            });
            
            console.log('✅ مراقبة BNB جاهزة');
            
        } catch (e) {
            console.error('❌ monitorBNB error:', e.message);
        }
    }
    
    // ========== مراقبة Polygon ==========
    
    async monitorPolygon() {
        try {
            const contract = new ethers.Contract(
                this.usdtContracts.polygon,
                this.erc20ABI,
                this.providers.polygon
            );
            
            contract.on('Transfer', async (from, to, value, event) => {
                const toAddress = to.toLowerCase();
                
                if (this.monitoredAddresses.has(toAddress)) {
                    const depositInfo = this.monitoredAddresses.get(toAddress);
                    
                    const decimals = 6; // USDT on Polygon uses 6 decimals
                    const receivedAmount = parseFloat(ethers.utils.formatUnits(value, decimals));
                    
                    console.log(`🔔 معاملة واردة على Polygon:`);
                    console.log(`   إلى: ${toAddress}`);
                    console.log(`   القيمة: ${receivedAmount} USDT`);
                    console.log(`   المطلوب: ${depositInfo.amount} USDT`);
                    
                    if (receivedAmount >= depositInfo.amount * 0.99) {
                        await this.confirmDeposit(
                            depositInfo.requestId,
                            depositInfo.userId,
                            receivedAmount,
                            event.transactionHash,
                            'polygon'
                        );
                    } else {
                        console.log(`⚠️ مبلغ غير كافٍ: ${receivedAmount} < ${depositInfo.amount}`);
                    }
                }
            });
            
            console.log('✅ مراقبة Polygon جاهزة');
            
        } catch (e) {
            console.error('❌ monitorPolygon error:', e.message);
        }
    }
    
    // ========== تأكيد الإيداع تلقائياً ==========
    
    async confirmDeposit(requestId, userId, amount, txHash, network) {
        try {
            console.log(`✅ تأكيد إيداع تلقائي: ${userId} - ${amount} USDT - ${network}`);
            
            // تحديث قاعدة البيانات
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
            
            await DepositRequest.updateOne(
                { _id: requestId },
                {
                    status: 'completed',
                    transactionHash: txHash,
                    completedAt: new Date(),
                    verifiedBy: 0 // 0 يعني تلقائي
                }
            );
            
            // إضافة الرصيد للمستخدم
            await Wallet.updateOne(
                { userId: userId },
                { $inc: { usdtBalance: amount } }
            );
            
            // إزالة من المراقبة
            this.monitoredAddresses.delete(requestId);
            
            // إشعار المستخدم
            if (global.botInstance) {
                try {
                    await global.botInstance.telegram.sendMessage(
                        userId,
                        `✅ *تم تأكيد الإيداع تلقائياً!*\n\n` +
                        `💰 المبلغ: ${amount.toFixed(2)} USDT\n` +
                        `🌐 الشبكة: ${network.toUpperCase()}\n` +
                        `🔗 المعاملة: \`${txHash.slice(0, 20)}...\`\n\n` +
                        `تم إضافة الرصيد إلى حسابك`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (notifyError) {
                    console.error('Notification error:', notifyError.message);
                }
            }
            
            // إشعار الأدمن
            if (global.botInstance) {
                const ADMIN_IDS = (process.env.ADMIN_IDS || '6701743450').split(',').map(Number);
                for (const adminId of ADMIN_IDS) {
                    try {
                        await global.botInstance.telegram.sendMessage(
                            adminId,
                            `🤖 *إيداع تلقائي*\n\n` +
                            `👤 المستخدم: \`${userId}\`\n` +
                            `💰 المبلغ: ${amount.toFixed(2)} USDT\n` +
                            `🌐 الشبكة: ${network.toUpperCase()}\n` +
                            `🔗 TX: \`${txHash.slice(0, 20)}...\``,
                            { parse_mode: 'Markdown' }
                        );
                    } catch (adminNotifyError) {}
                }
            }
            
            console.log(`✅ إيداع ${userId} مكتمل`);
            
        } catch (e) {
            console.error('confirmDeposit error:', e.message);
            console.error(e.stack);
        }
    }
    
    // ========== فحص رصيد عنوان ==========
    
    async checkBalance(address, network = 'bnb') {
        try {
            if (network === 'solana') {
                try {
                    const publicKey = new PublicKey(address);
                    const tokenAccounts = await this.providers.solana.getParsedTokenAccountsByOwner(
                        publicKey,
                        { mint: new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB') }
                    );
                    return tokenAccounts.value[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
                } catch (solanaError) {
                    console.error('Solana balance check error:', solanaError.message);
                    return 0;
                }
            } else {
                const contract = new ethers.Contract(
                    this.usdtContracts[network],
                    this.erc20ABI,
                    this.providers[network]
                );
                const balance = await contract.balanceOf(address);
                const decimals = network === 'polygon' ? 6 : 18;
                return parseFloat(ethers.utils.formatUnits(balance, decimals));
            }
        } catch (e) {
            console.error(`checkBalance error for ${network}:`, e.message);
            return 0;
        }
    }
    
    // ========== إيقاف المراقبة ==========
    
    stop() {
        this.isMonitoring = false;
        this.providers.bnb.removeAllListeners();
        this.providers.polygon.removeAllListeners();
        console.log('🛑 مراقب البلوكشين متوقف');
    }
}

module.exports = new BlockchainMonitor();
