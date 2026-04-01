const mongoose = require('mongoose');
const CryptoJS = require('crypto-js');
const { ethers } = require('ethers');
const { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } = require('@solana/web3.js');
const { AptosClient, AptosAccount, HexString } = require('aptos');
const bip39 = require('bip39');
const bip32 = require('bip32');

// نماذج المحفظة
const walletSchema = new mongoose.Schema({
    userId: { type: Number, required: true, unique: true },
    // BNB (BEP-20)
    bnbAddress: { type: String, unique: true, sparse: true },
    bnbEncryptedPrivateKey: { type: String },
    bnbBalance: { type: Number, default: 0 },
    // POLYGON
    polygonAddress: { type: String, unique: true, sparse: true },
    polygonEncryptedPrivateKey: { type: String },
    polygonBalance: { type: Number, default: 0 },
    // SOLANA
    solanaAddress: { type: String, unique: true, sparse: true },
    solanaEncryptedPrivateKey: { type: String },
    solanaBalance: { type: Number, default: 0 },
    // APTOS
    aptosAddress: { type: String, unique: true, sparse: true },
    aptosEncryptedPrivateKey: { type: String },
    aptosBalance: { type: Number, default: 0 },
    // بصمة فريدة للمحفظة
    walletSignature: { type: String, required: true, unique: true },
    // تاريخ الإنشاء
    createdAt: { type: Date, default: Date.now },
    lastUpdated: { type: Date, default: Date.now }
});

const Wallet = mongoose.model('Wallet', walletSchema);

class WalletManager {
    constructor() {
        this.encryptionKey = process.env.ENCRYPTION_KEY;
        
        // إعدادات الشبكات
        this.networks = {
            bnb: {
                name: 'BNB (BEP-20)',
                symbol: 'BNB',
                chainId: 56,
                rpc: 'https://bsc-dataseed.binance.org/',
                explorer: 'https://bscscan.com/tx/',
                decimals: 18
            },
            polygon: {
                name: 'POLYGON (MATIC)',
                symbol: 'MATIC',
                chainId: 137,
                rpc: 'https://polygon-rpc.com/',
                explorer: 'https://polygonscan.com/tx/',
                decimals: 18
            },
            solana: {
                name: 'SOLANA',
                symbol: 'SOL',
                rpc: 'https://api.mainnet-beta.solana.com',
                explorer: 'https://solscan.io/tx/',
                decimals: 9
            },
            aptos: {
                name: 'APTOS',
                symbol: 'APT',
                rpc: 'https://fullnode.mainnet.aptoslabs.com/v1',
                explorer: 'https://explorer.aptoslabs.com/txn/',
                decimals: 8
            }
        };
    }

    // تشفير المفتاح الخاص
    encryptPrivateKey(privateKey) {
        return CryptoJS.AES.encrypt(privateKey, this.encryptionKey).toString();
    }

    // فك تشفير المفتاح الخاص
    decryptPrivateKey(encryptedKey) {
        const bytes = CryptoJS.AES.decrypt(encryptedKey, this.encryptionKey);
        return bytes.toString(CryptoJS.enc.Utf8);
    }

    // إنشاء بصمة فريدة للمحفظة
    generateWalletSignature(userId, timestamp) {
        return CryptoJS.SHA256(`${userId}-${timestamp}-${Math.random()}`).toString();
    }

    // ========== BNB (BEP-20) ==========
    async createBnbWallet(userId) {
        try {
            const wallet = ethers.Wallet.createRandom();
            const address = wallet.address;
            const encryptedKey = this.encryptPrivateKey(wallet.privateKey);
            
            return {
                address,
                encryptedPrivateKey: encryptedKey,
                balance: 0
            };
        } catch (error) {
            console.error('BNB wallet creation error:', error);
            return null;
        }
    }

    async getBnbBalance(address) {
        try {
            const provider = new ethers.JsonRpcProvider(this.networks.bnb.rpc);
            const balance = await provider.getBalance(address);
            return parseFloat(ethers.formatEther(balance));
        } catch (error) {
            console.error('BNB balance error:', error);
            return 0;
        }
    }

    async transferBnb(fromPrivateKey, toAddress, amount) {
        try {
            const provider = new ethers.JsonRpcProvider(this.networks.bnb.rpc);
            const wallet = new ethers.Wallet(fromPrivateKey, provider);
            
            const tx = await wallet.sendTransaction({
                to: toAddress,
                value: ethers.parseEther(amount.toString())
            });
            
            await tx.wait();
            return { success: true, hash: tx.hash, explorer: `${this.networks.bnb.explorer}${tx.hash}` };
        } catch (error) {
            console.error('BNB transfer error:', error);
            return { success: false, error: error.message };
        }
    }

    // ========== POLYGON ==========
    async createPolygonWallet(userId) {
        try {
            const wallet = ethers.Wallet.createRandom();
            const address = wallet.address;
            const encryptedKey = this.encryptPrivateKey(wallet.privateKey);
            
            return {
                address,
                encryptedPrivateKey: encryptedKey,
                balance: 0
            };
        } catch (error) {
            console.error('POLYGON wallet creation error:', error);
            return null;
        }
    }

    async getPolygonBalance(address) {
        try {
            const provider = new ethers.JsonRpcProvider(this.networks.polygon.rpc);
            const balance = await provider.getBalance(address);
            return parseFloat(ethers.formatEther(balance));
        } catch (error) {
            console.error('POLYGON balance error:', error);
            return 0;
        }
    }

    async transferPolygon(fromPrivateKey, toAddress, amount) {
        try {
            const provider = new ethers.JsonRpcProvider(this.networks.polygon.rpc);
            const wallet = new ethers.Wallet(fromPrivateKey, provider);
            
            const tx = await wallet.sendTransaction({
                to: toAddress,
                value: ethers.parseEther(amount.toString())
            });
            
            await tx.wait();
            return { success: true, hash: tx.hash, explorer: `${this.networks.polygon.explorer}${tx.hash}` };
        } catch (error) {
            console.error('POLYGON transfer error:', error);
            return { success: false, error: error.message };
        }
    }

    // ========== SOLANA ==========
    async createSolanaWallet(userId) {
        try {
            const keypair = Keypair.generate();
            const address = keypair.publicKey.toString();
            const encryptedKey = this.encryptPrivateKey(JSON.stringify(Array.from(keypair.secretKey)));
            
            return {
                address,
                encryptedPrivateKey: encryptedKey,
                balance: 0
            };
        } catch (error) {
            console.error('SOLANA wallet creation error:', error);
            return null;
        }
    }

    async getSolanaBalance(address) {
        try {
            const connection = new Connection(this.networks.solana.rpc);
            const publicKey = new PublicKey(address);
            const balance = await connection.getBalance(publicKey);
            return balance / LAMPORTS_PER_SOL;
        } catch (error) {
            console.error('SOLANA balance error:', error);
            return 0;
        }
    }

    async transferSolana(fromPrivateKey, toAddress, amount) {
        try {
            const connection = new Connection(this.networks.solana.rpc);
            const secretKey = Uint8Array.from(JSON.parse(fromPrivateKey));
            const fromKeypair = Keypair.fromSecretKey(secretKey);
            const toPublicKey = new PublicKey(toAddress);
            
            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: fromKeypair.publicKey,
                    toPubkey: toPublicKey,
                    lamports: amount * LAMPORTS_PER_SOL
                })
            );
            
            const signature = await connection.sendTransaction(transaction, [fromKeypair]);
            await connection.confirmTransaction(signature);
            
            return { success: true, hash: signature, explorer: `${this.networks.solana.explorer}${signature}` };
        } catch (error) {
            console.error('SOLANA transfer error:', error);
            return { success: false, error: error.message };
        }
    }

    // ========== APTOS ==========
    async createAptosWallet(userId) {
        try {
            const account = new AptosAccount();
            const address = account.address().hex();
            const encryptedKey = this.encryptPrivateKey(account.toPrivateKeyObject().privateKeyHex);
            
            return {
                address,
                encryptedPrivateKey: encryptedKey,
                balance: 0
            };
        } catch (error) {
            console.error('APTOS wallet creation error:', error);
            return null;
        }
    }

    async getAptosBalance(address) {
        try {
            const client = new AptosClient(this.networks.aptos.rpc);
            const resources = await client.getAccountResources(address);
            const accountResource = resources.find(r => r.type === '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>');
            if (accountResource && accountResource.data) {
                return accountResource.data.coin.value / Math.pow(10, this.networks.aptos.decimals);
            }
            return 0;
        } catch (error) {
            console.error('APTOS balance error:', error);
            return 0;
        }
    }

    async transferAptos(fromPrivateKey, toAddress, amount) {
        try {
            const client = new AptosClient(this.networks.aptos.rpc);
            const account = new AptosAccount(new HexString(fromPrivateKey).toUint8Array());
            const toAccount = new HexString(toAddress);
            
            const payload = {
                function: "0x1::coin::transfer",
                type_arguments: ["0x1::aptos_coin::AptosCoin"],
                arguments: [toAccount.toUint8Array(), amount * Math.pow(10, this.networks.aptos.decimals)]
            };
            
            const txnRequest = await client.generateTransaction(account.address(), payload);
            const signedTxn = await client.signTransaction(account, txnRequest);
            const transactionRes = await client.submitTransaction(signedTxn);
            await client.waitForTransaction(transactionRes.hash);
            
            return { success: true, hash: transactionRes.hash, explorer: `${this.networks.aptos.explorer}${transactionRes.hash}` };
        } catch (error) {
            console.error('APTOS transfer error:', error);
            return { success: false, error: error.message };
        }
    }

    // ========== إدارة المحفظة الكاملة ==========
    async getUserWallet(userId) {
        let wallet = await Wallet.findOne({ userId });
        
        if (!wallet) {
            // إنشاء محفظة جديدة للمستخدم
            const [bnbWallet, polygonWallet, solanaWallet, aptosWallet] = await Promise.all([
                this.createBnbWallet(userId),
                this.createPolygonWallet(userId),
                this.createSolanaWallet(userId),
                this.createAptosWallet(userId)
            ]);
            
            const walletSignature = this.generateWalletSignature(userId, Date.now());
            
            wallet = await Wallet.create({
                userId,
                bnbAddress: bnbWallet.address,
                bnbEncryptedPrivateKey: bnbWallet.encryptedPrivateKey,
                polygonAddress: polygonWallet.address,
                polygonEncryptedPrivateKey: polygonWallet.encryptedPrivateKey,
                solanaAddress: solanaWallet.address,
                solanaEncryptedPrivateKey: solanaWallet.encryptedPrivateKey,
                aptosAddress: aptosWallet.address,
                aptosEncryptedPrivateKey: aptosWallet.encryptedPrivateKey,
                walletSignature
            });
        }
        
        return wallet;
    }

    async getWalletBalance(userId) {
        const wallet = await this.getUserWallet(userId);
        
        const [bnbBalance, polygonBalance, solanaBalance, aptosBalance] = await Promise.all([
            this.getBnbBalance(wallet.bnbAddress),
            this.getPolygonBalance(wallet.polygonAddress),
            this.getSolanaBalance(wallet.solanaAddress),
            this.getAptosBalance(wallet.aptosAddress)
        ]);
        
        return {
            bnb: bnbBalance,
            polygon: polygonBalance,
            solana: solanaBalance,
            aptos: aptosBalance,
            total: bnbBalance + polygonBalance + solanaBalance + aptosBalance
        };
    }

    async withdraw(userId, network, amount, toAddress) {
        const wallet = await this.getUserWallet(userId);
        const networkConfig = this.networks[network];
        
        if (!networkConfig) {
            return { success: false, error: 'شبكة غير مدعومة' };
        }
        
        // التحقق من الرصيد
        let currentBalance;
        switch(network) {
            case 'bnb':
                currentBalance = await this.getBnbBalance(wallet.bnbAddress);
                break;
            case 'polygon':
                currentBalance = await this.getPolygonBalance(wallet.polygonAddress);
                break;
            case 'solana':
                currentBalance = await this.getSolanaBalance(wallet.solanaAddress);
                break;
            case 'aptos':
                currentBalance = await this.getAptosBalance(wallet.aptosAddress);
                break;
            default:
                return { success: false, error: 'شبكة غير مدعومة' };
        }
        
        if (currentBalance < amount) {
            return { success: false, error: `الرصيد غير كافٍ. الرصيد الحالي: ${currentBalance} ${networkConfig.symbol}` };
        }
        
        // تنفيذ التحويل
        let result;
        switch(network) {
            case 'bnb':
                const bnbPrivateKey = this.decryptPrivateKey(wallet.bnbEncryptedPrivateKey);
                result = await this.transferBnb(bnbPrivateKey, toAddress, amount);
                break;
            case 'polygon':
                const polygonPrivateKey = this.decryptPrivateKey(wallet.polygonEncryptedPrivateKey);
                result = await this.transferPolygon(polygonPrivateKey, toAddress, amount);
                break;
            case 'solana':
                const solanaPrivateKey = this.decryptPrivateKey(wallet.solanaEncryptedPrivateKey);
                result = await this.transferSolana(solanaPrivateKey, toAddress, amount);
                break;
            case 'aptos':
                const aptosPrivateKey = this.decryptPrivateKey(wallet.aptosEncryptedPrivateKey);
                result = await this.transferAptos(aptosPrivateKey, toAddress, amount);
                break;
        }
        
        if (result.success) {
            // تحديث الرصيد في قاعدة البيانات
            await Wallet.updateOne({ userId }, { $set: { lastUpdated: new Date() } });
            
            // تسجيل المعاملة
            return {
                success: true,
                hash: result.hash,
                explorer: result.explorer,
                network: networkConfig.name,
                amount,
                toAddress
            };
        }
        
        return result;
    }

    async getWalletInfo(userId) {
        const wallet = await this.getUserWallet(userId);
        const balances = await this.getWalletBalance(userId);
        
        return {
            userId,
            walletSignature: wallet.walletSignature,
            addresses: {
                bnb: wallet.bnbAddress,
                polygon: wallet.polygonAddress,
                solana: wallet.solanaAddress,
                aptos: wallet.aptosAddress
            },
            balances,
            networks: this.networks
        };
    }
}

module.exports = new WalletManager();
