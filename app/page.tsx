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
      setStatus("⚠️ MetaMask غير مثبت. جاري فتح رابط التحميل...");
      window.open("https://metamask.io/download/", "_blank");
      return;
    }

    try {
      setStatus("جاري الاتصال بالمحفظة...");
      
      const accounts = await window.ethereum.request({ 
        method: "eth_requestAccounts" 
      });
      
      if (accounts && accounts[0]) {
        setAddress(accounts[0]);
        setIsConnected(true);
        setStatus("✅ تم الاتصال بنجاح");
        
        const provider = new ethers.BrowserProvider(window.ethereum);
        const contract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
        const decimals = await contract.decimals();
        const rawBalance = await contract.balanceOf(accounts[0]);
        const formattedBalance = ethers.formatUnits(rawBalance, decimals);
        setBalance(formattedBalance);
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 4001) {
        setStatus("❌ تم رفض الاتصال");
      } else {
        setStatus("❌ فشل الاتصال: " + (err.message || "خطأ غير معروف"));
      }
    }
  };

  // إرسال USDC
  const sendUSDC = async () => {
    if (!isConnected) {
      setStatus('⚠️ الرجاء ربط المحفظة أولاً');
      return;
    }
    
    if (!toAddress || !amount) {
      setStatus('⚠️ الرجاء إدخال العنوان والمبلغ');
      return;
    }
    
    if (!toAddress.startsWith('0x') || toAddress.length !== 42) {
      setStatus('⚠️ العنوان غير صالح. يجب أن يبدأ بـ 0x ويتكون من 42 حرفاً');
      return;
    }

    setIsLoading(true);
    setStatus('🚀 جاري الإرسال...');

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      const contract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
      const decimals = await contract.decimals();
      const amountWithDecimals = ethers.parseUnits(amount, decimals);
      
      const tx = await contract.transfer(toAddress, amountWithDecimals);
      setStatus(`⏳ جاري التأكيد...`);
      await tx.wait();
      
      setStatus(`✅ تم إرسال ${amount} USDC بنجاح`);
      setToAddress('');
      setAmount('');
      
      const rawBalance = await contract.balanceOf(address);
      const formattedBalance = ethers.formatUnits(rawBalance, decimals);
      setBalance(formattedBalance);
      
    } catch (err: any) {
      setStatus('❌ فشل الإرسال: ' + (err.message || 'خطأ'));
    } finally {
      setIsLoading(false);
    }
  };

  const disconnectWallet = () => {
    setIsConnected(false);
    setAddress('');
    setBalance('');
    setStatus('🔓 تم تسجيل الخروج');
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
          
          if (gasPriceGwei < 15) {
            setAiRecommendation(`🟢 ممتاز! رسوم منخفضة (${gasPriceGwei.toFixed(0)} Gwei)`);
          } else if (gasPriceGwei < 30) {
            setAiRecommendation(`🟡 رسوم متوسطة (${gasPriceGwei.toFixed(0)} Gwei)`);
          } else {
            setAiRecommendation(`🔴 رسوم مرتفعة (${gasPriceGwei.toFixed(0)} Gwei)`);
          }
        } catch (err) {
          setAiRecommendation('🤖 AI جاهز');
        }
      } else if (!isConnected) {
        setAiRecommendation('🔗 اربط محفظتك');
      }
    };
    
    getRecommendation();
    const interval = setInterval(getRecommendation, 30000);
    return () => clearInterval(interval);
  }, [isConnected]);

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px',
      fontFamily: 'sans-serif'
    }}>
      <div style={{ maxWidth: '500px', margin: '0 auto' }}>
        
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontSize: '52px', margin: '0', color: 'white' }}>
            Pesify 💸
          </h1>
          <p style={{ color: 'white', marginTop: '10px' }}>
            مدفوعات العملات المستقرة على Base Chain
          </p>
        </div>

        {aiRecommendation && (
          <div style={{ 
            background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            borderRadius: '15px', 
            padding: '15px',
            marginBottom: '20px',
            color: 'white',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '24px' }}>🤖</div>
            <div style={{ fontSize: '12px' }}>AI FEE OPTIMIZER</div>
            <div style={{ fontSize: '11px', marginTop: '5px' }}>{aiRecommendation}</div>
          </div>
        )}

        <div style={{ 
          background: 'white', 
          borderRadius: '20px', 
          padding: '25px',
          marginBottom: '20px'
        }}>
          <h2 style={{ margin: '0 0 15px 0' }}>🔐 المحفظة</h2>
          
          {!isConnected ? (
            <button
              onClick={connectWallet}
              style={{
                width: '100%',
                padding: '14px',
                background: '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                cursor: 'pointer'
              }}
            >
              ربط MetaMask
            </button>
          ) : (
            <div>
              <div style={{ 
                background: '#e8f5e9', 
                padding: '12px', 
                borderRadius: '12px'
              }}>
                <div style={{ fontSize: '12px', color: '#2e7d32' }}>✅ متصل</div>
                <div style={{ fontSize: '13px' }}>
                  {address.substring(0, 8)}...{address.substring(36)}
                </div>
                {balance && (
                  <div style={{ fontSize: '13px', marginTop: '5px' }}>
                    الرصيد: {balance} USDC
                  </div>
                )}
              </div>
              <button
                onClick={disconnectWallet}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  marginTop: '10px',
                  cursor: 'pointer'
                }}
              >
                تسجيل الخروج
              </button>
            </div>
          )}
        </div>

        <div style={{ 
          background: 'white', 
          borderRadius: '20px', 
          padding: '25px',
          marginBottom: '20px'
        }}>
          <h2 style={{ margin: '0 0 15px 0' }}>📤 إرسال USDC</h2>
          
          <input
            type="text"
            placeholder="عنوان المستلم (0x...)"
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '15px',
              border: '1px solid #ddd',
              borderRadius: '10px'
            }}
          />
          
          <input
            type="number"
            placeholder="المبلغ (USDC)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '15px',
              border: '1px solid #ddd',
              borderRadius: '10px'
            }}
          />
          
          <button
            onClick={sendUSDC}
            disabled={!isConnected || isLoading}
            style={{
              width: '100%',
              padding: '14px',
              background: (isConnected && !isLoading) ? '#4caf50' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              cursor: (isConnected && !isLoading) ? 'pointer' : 'not-allowed'
            }}
          >
            {isLoading ? 'جاري الإرسال...' : (isConnected ? 'إرسال 💸' : 'اربط المحفظة أولاً')}
          </button>
        </div>

        {status && (
          <div style={{ 
            background: 'rgba(0,0,0,0.8)', 
            color: 'white', 
            padding: '12px', 
            borderRadius: '10px',
            textAlign: 'center',
            fontSize: '13px'
          }}>
            {status}
          </div>
        )}

        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.7)', marginTop: '20px', fontSize: '11px' }}>
          <p>✨ Base Mainnet | AI Fee Optimizer ✨</p>
        </div>
      </div>
    </div>
  );
}
