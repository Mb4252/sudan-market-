'use client';

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

declare global {
  interface Window {
    ethereum?: any;
  }
}

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('');
  const [aiRecommendation, setAiRecommendation] = useState('');
  const [balance, setBalance] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // عنوان USDC على Base Mainnet (للعملات الحقيقية)
  const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  
  const USDC_ABI = [
    'function transfer(address to, uint256 amount) external returns (bool)',
    'function balanceOf(address account) external view returns (uint256)',
    'function decimals() external view returns (uint8)'
  ];

  // ربط المحفظة
  const connectWallet = async () => {
    if (!window.ethereum) {
      setStatus("⚠️ MetaMask غير مثبت");
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile) {
        window.location.href = "https://metamask.app.link/dapp/" + window.location.host;
      } else {
        window.open("https://metamask.io/download/", "_blank");
      }
      return;
    }

    try {
      setStatus("جاري الاتصال...");
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      
      if (accounts && accounts[0]) {
        setAddress(accounts[0]);
        setIsConnected(true);
        setStatus("✅ تم الاتصال");
        
        const provider = new ethers.BrowserProvider(window.ethereum);
        const contract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
        const decimals = await contract.decimals();
        const rawBalance = await contract.balanceOf(accounts[0]);
        setBalance(ethers.formatUnits(rawBalance, decimals));
      }
    } catch (err: any) {
      setStatus("❌ " + (err.message || "فشل"));
    }
  };

  // إرسال USDC
  const sendUSDC = async () => {
    if (!isConnected) { setStatus('⚠️ اربط المحفظة أولاً'); return; }
    if (!toAddress || !amount) { setStatus('⚠️ أدخل العنوان والمبلغ'); return; }
    if (!toAddress.startsWith('0x') || toAddress.length !== 42) { setStatus('⚠️ عنوان غير صالح'); return; }

    setIsLoading(true);
    setStatus('🚀 جاري الإرسال...');

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
      const decimals = await contract.decimals();
      const amountWithDecimals = ethers.parseUnits(amount, decimals);
      
      const tx = await contract.transfer(toAddress, amountWithDecimals);
      setStatus(`⏳ انتظر التأكيد...`);
      await tx.wait();
      
      setStatus(`✅ تم إرسال ${amount} USDC`);
      setToAddress('');
      setAmount('');
      
      const rawBalance = await contract.balanceOf(address);
      setBalance(ethers.formatUnits(rawBalance, decimals));
    } catch (err: any) {
      setStatus('❌ فشل: ' + (err.message || 'خطأ'));
    } finally {
      setIsLoading(false);
    }
  };

  const disconnectWallet = () => {
    setIsConnected(false);
    setAddress('');
    setBalance('');
    setStatus('🔓 تم الخروج');
  };

  // AI Recommendation
  useEffect(() => {
    const getRecommendation = async () => {
      if (isConnected && window.ethereum) {
        try {
          const provider = new ethers.BrowserProvider(window.ethereum);
          const feeData = await provider.getFeeData();
          const gasPrice = feeData.gasPrice;
          const gasPriceGwei = gasPrice ? Number(ethers.formatUnits(gasPrice, 'gwei')) : 30;
          if (gasPriceGwei < 15) setAiRecommendation(`🟢 ممتاز! رسوم منخفضة (${gasPriceGwei.toFixed(0)} Gwei)`);
          else if (gasPriceGwei < 30) setAiRecommendation(`🟡 رسوم متوسطة (${gasPriceGwei.toFixed(0)} Gwei)`);
          else setAiRecommendation(`🔴 رسوم مرتفعة (${gasPriceGwei.toFixed(0)} Gwei)`);
        } catch (err) { setAiRecommendation('🤖 AI جاهز'); }
      } else { setAiRecommendation('🔗 اربط محفظتك'); }
    };
    getRecommendation();
    const interval = setInterval(getRecommendation, 30000);
    return () => clearInterval(interval);
  }, [isConnected]);

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: '20px' }}>
      <div style={{ maxWidth: '500px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontSize: '52px', color: 'white' }}>Pesify 💸</h1>
          <p style={{ color: 'white' }}>مدفوعات العملات المستقرة على Base Chain</p>
        </div>

        {aiRecommendation && (
          <div style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', borderRadius: '15px', padding: '15px', marginBottom: '20px', color: 'white', textAlign: 'center' }}>
            <div style={{ fontSize: '24px' }}>🤖</div>
            <div style={{ fontSize: '12px' }}>AI FEE OPTIMIZER</div>
            <div style={{ fontSize: '11px', marginTop: '5px' }}>{aiRecommendation}</div>
          </div>
        )}

        <div style={{ background: 'white', borderRadius: '20px', padding: '25px', marginBottom: '20px' }}>
          <h2>🔐 المحفظة</h2>
          {!isConnected ? (
            <button onClick={connectWallet} style={{ width: '100%', padding: '14px', background: '#667eea', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>
              ربط MetaMask
            </button>
          ) : (
            <div>
              <div style={{ background: '#e8f5e9', padding: '12px', borderRadius: '12px' }}>
                <div style={{ fontSize: '12px', color: '#2e7d32' }}>✅ متصل</div>
                <div>{address.substring(0, 8)}...{address.substring(36)}</div>
                {balance && <div>الرصيد: {balance} USDC</div>}
              </div>
              <button onClick={disconnectWallet} style={{ width: '100%', padding: '10px', background: '#f44336', color: 'white', border: 'none', borderRadius: '10px', marginTop: '10px', cursor: 'pointer' }}>
                تسجيل الخروج
              </button>
            </div>
          )}
        </div>

        <div style={{ background: 'white', borderRadius: '20px', padding: '25px', marginBottom: '20px' }}>
          <h2>📤 إرسال USDC</h2>
          <input type="text" placeholder="عنوان المستلم (0x...)" value={toAddress} onChange={(e) => setToAddress(e.target.value)} disabled={isLoading} style={{ width: '100%', padding: '12px', marginBottom: '15px', border: '1px solid #ddd', borderRadius: '10px' }} />
          <input type="number" placeholder="المبلغ (USDC)" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={isLoading} style={{ width: '100%', padding: '12px', marginBottom: '15px', border: '1px solid #ddd', borderRadius: '10px' }} />
          <button onClick={sendUSDC} disabled={!isConnected || isLoading} style={{ width: '100%', padding: '14px', background: (isConnected && !isLoading) ? '#4caf50' : '#ccc', color: 'white', border: 'none', borderRadius: '12px', cursor: (isConnected && !isLoading) ? 'pointer' : 'not-allowed' }}>
            {isLoading ? 'جاري الإرسال...' : (isConnected ? 'إرسال 💸' : 'اربط المحفظة أولاً')}
          </button>
        </div>

        {status && <div style={{ background: 'rgba(0,0,0,0.8)', color: 'white', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>{status}</div>}
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.7)', marginTop: '20px' }}>✨ Base Mainnet | AI Fee Optimizer ✨</div>
      </div>
    </div>
  );
}
