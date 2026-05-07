const { ethers } = require('ethers');
const { Connection, PublicKey } = require('@solana/web3.js');

class BlockchainMonitor {
    constructor() {
        // إعدادات الشبكات
        this.providers = {
            bnb: new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org'),
            polygon: new ethers.JsonRpcProvider('https://polygon-rpc.com'),
            solana: new Connection('https://api.mainnet-beta.solana.com'),
        };
        
        // عنوان عقد USDT على كل شبكة
        this.usdtContracts = {
            bnb: '0x55d398326f99059fF775485246999027B3197955',      // BUSD/USDT BSC
            polygon: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // USDT Polygon
        };
        
        // ABI للتحقق من المعاملات
        this.erc20ABI = [
            'event Transfer(address indexed from, address indexed to, uint256 value)',
            'function balanceOf(address) view returns (uint256)',
            'function decimals() view returns (uint8)'
        ];
        
        this.isMonitoring = false;
        this.monitoredAddresses = new Map(); // address -> { userId, amount }
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
    }
    
    // ========== تحميل العناوين المعلقة ==========
    
    async loadPendingAddresses() {
        try {
            const DepositRequest = require('./models').DepositRequest;
            const pendingDeposits = await DepositRequest.find({ status: 'pending' });
            
            this.monitoredAddresses.clear();
            
            for (const deposit of pendingDeposits) {
                const address = deposit.address?.toLowerCase();
                if (address) {
                    this.monitoredAddresses.set(address, {
                        requestId: deposit._id,
                        userId: deposit.userId,
                        amount: deposit.amount,
                        network: deposit.network,
                        expectedAmount: ethers.parseUnits(deposit.amount.toString(), 18)
                    });
                }
            }
            
            console.log(`📋 ${this.monitoredAddresses.size} عناوين قيد المراقبة`);
            
        } catch (e) {
            console.error('loadPendingAddresses error:', e.message);
        }
    }
    
    // ========== مراقبة BNB ==========
    
    async monitorBNB() {
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
                
                console.log(`🔔 معاملة واردة على BNB:`);
                console.log(`   من: ${from}`);
                console.log(`   إلى: ${toAddress}`);
                console.log(`   القيمة: ${ethers.formatUnits(value, 18)} USDT`);
                
                // التحقق من المبلغ
                const receivedAmount = parseFloat(ethers.formatUnits(value, 18));
                
                if (receivedAmount >= depositInfo.amount) {
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
    }
    
    // ========== مراقبة Polygon ==========
    
    async monitorPolygon() {
        const contract = new ethers.Contract(
            this.usdtContracts.polygon,
            this.erc20ABI,
            this.providers.polygon
        );
        
        contract.on('Transfer', async (from, to, value, event) => {
            const toAddress = to.toLowerCase();
            
            if (this.monitoredAddresses.has(toAddress)) {
                const depositInfo = this.monitoredAddresses.get(toAddress);
                
                console.log(`🔔 معاملة واردة على Polygon:`);
                console.log(`   إلى: ${toAddress}`);
                console.log(`   القيمة: ${ethers.formatUnits(value, 6)} USDT`);
                
                const receivedAmount = parseFloat(ethers.formatUnits(value, 6));
                
                if (receivedAmount >= depositInfo.amount) {
                    await this.confirmDeposit(
                        depositInfo.requestId,
                        depositInfo.userId,
                        receivedAmount,
                        event.transactionHash,
                        'polygon'
                    );
                }
            }
        });
        
        console.log('✅ مراقبة Polygon جاهزة');
    }
    
    // ========== تأكيد الإيداع تلقائياً ==========
    
    async confirmDeposit(requestId, userId, amount, txHash, network) {
        try {
            console.log(`✅ تأكيد إيداع تلقائي: ${userId} - ${amount} USDT - ${network}`);
            
            // تحديث قاعدة البيانات
            const DepositRequest = require('./models').DepositRequest;
            const Wallet = require('./models').Wallet;
            
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
                        `💰 المبلغ: ${amount} USDT\n` +
                        `🌐 الشبكة: ${network}\n` +
                        `🔗 المعاملة: \`${txHash}\`\n\n` +
                        `تم إضافة الرصيد إلى حسابك`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (notifyError) {
                    console.error('Notification error:', notifyError.message);
                }
            }
            
            console.log(`✅ إيداع ${userId} مكتمل`);
            
        } catch (e) {
            console.error('confirmDeposit error:', e.message);
        }
    }
    
    // ========== فحص رصيد عنوان ==========
    
    async checkBalance(address, network = 'bnb') {
        try {
            if (network === 'solana') {
                const publicKey = new PublicKey(address);
                // فحص حسابات SPL Token للسولانا
                const tokenAccounts = await this.providers.solana.getParsedTokenAccountsByOwner(
                    publicKey,
                    { mint: new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB') } // USDT Solana
                );
                return tokenAccounts.value[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
            } else {
                const contract = new ethers.Contract(
                    this.usdtContracts[network],
                    this.erc20ABI,
                    this.providers[network]
                );
                const balance = await contract.balanceOf(address);
                const decimals = await contract.decimals();
                return parseFloat(ethers.formatUnits(balance, decimals));
            }
        } catch (e) {
            console.error(`checkBalance error for ${network}:`, e.message);
            return 0;
        }
    }
}

module.exports = new BlockchainMonitor();
