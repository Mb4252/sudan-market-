'use client';

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { MetaMaskSDK } from '@metamask/sdk';

declare global {
  interface Window {
    ethereum?: any;
  }
}

// MetaMask SDK (للهاتف)
const MMSDK = typeof window !== 'undefined'
  ? new MetaMaskSDK({
      dappMetadata: {
        name: 'Pesify',
        url: typeof window.location !== 'undefined' ? window.location.href : '',
      },
    })
  : null;

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('');
  const [aiRecommendation, setAiRecommendation] = useState('');
  const [balance, setBalance] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

  const USDC_ABI = [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)'
  ];

  const getProvider = () => {
    const ethereum = MMSDK?.getProvider() || window.ethereum;
    if (!ethereum) throw new Error('MetaMask not found');
    return ethereum;
  };

  const connectWallet = async () => {
    try {
      const ethereum = getProvider();

      setStatus('جاري الاتصال...');

      const accounts = await ethereum.request({
        method: 'eth_requestAccounts'
      });

      const userAddress = accounts[0];
      setAddress(userAddress);
      setIsConnected(true);

      await switchToBase(ethereum);

      await getBalance(userAddress);

      setStatus('✅ تم الاتصال بنجاح');
    } catch (err: any) {
      setStatus('❌ ' + (err.message || 'فشل الاتصال'));
    }
  };

  const switchToBase = async (ethereum: any) => {
    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x2105' }],
      });
    } catch (switchError) {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x2105',
          chainName: 'Base Mainnet',
          nativeCurrency: {
            name: 'ETH',
            symbol: 'ETH',
            decimals: 18
          },
          rpcUrls: ['https://mainnet.base.org'],
          blockExplorerUrls: ['https://basescan.org']
        }]
      });
    }
  };

  const getBalance = async (wallet: string) => {
    try {
      const ethereum = getProvider();
      const provider = new ethers.BrowserProvider(ethereum);

      const contract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
      const decimals = await contract.decimals();
      const raw = await contract.balanceOf(wallet);

      setBalance(ethers.formatUnits(raw, decimals));
    } catch (e) {
      console.log(e);
    }
  };

  const sendUSDC = async () => {
    if (!isConnected) return setStatus('اربط المحفظة أولاً');
    if (!toAddress || !amount) return setStatus('أدخل البيانات');

    try {
      setIsLoading(true);
      setStatus('جاري الإرسال...');

      const ethereum = getProvider();
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();

      const contract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
      const decimals = await contract.decimals();

      const tx = await contract.transfer(
        toAddress,
        ethers.parseUnits(amount, decimals)
      );

      setStatus('⏳ انتظار التأكيد...');
      await tx.wait();

      setStatus('✅ تم الإرسال بنجاح');

      await getBalance(address);

      setToAddress('');
      setAmount('');
    } catch (err: any) {
      setStatus('❌ ' + (err.message || 'فشل الإرسال'));
    } finally {
      setIsLoading(false);
    }
  };

  const disconnectWallet = () => {
    setIsConnected(false);
    setAddress('');
    setBalance('');
    setStatus('تم تسجيل الخروج');
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (isConnected && window.ethereum) {
        setAiRecommendation('🟢 الشبكة جاهزة');
      } else {
        setAiRecommendation('🔗 اربط المحفظة');
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isConnected]);

  return (
    <div style={{ padding: 20 }}>
      <h1>Pesify 💸</h1>

      {aiRecommendation && <p>{aiRecommendation}</p>}

      <div>
        {!isConnected ? (
          <button onClick={connectWallet}>
            ربط MetaMask
          </button>
        ) : (
          <>
            <p>Connected: {address}</p>
            <p>Balance: {balance} USDC</p>
            <button onClick={disconnectWallet}>Disconnect</button>
          </>
        )}
      </div>

      <hr />

      <input
        placeholder="To address"
        value={toAddress}
        onChange={(e) => setToAddress(e.target.value)}
      />

      <input
        placeholder="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />

      <button onClick={sendUSDC} disabled={isLoading || !isConnected}>
        Send USDC
      </button>

      <p>{status}</p>
    </div>
  );
}
