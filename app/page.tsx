'use client';

import { useState, useEffect } from 'react';

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('');

  // ربط المحفظة (محاكاة بسيطة)
  const connectWallet = async () => {
    if (typeof window !== 'undefined' && window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        setAddress(accounts[0]);
        setIsConnected(true);
        setStatus('✅ محفظة متصلة!');
      } catch (err) {
        setStatus('❌ فشل الاتصال');
      }
    } else {
      setStatus('⚠️ الرجاء تثبيت MetaMask');
    }
  };

  // إرسال العملة (محاكاة)
  const sendPayment = () => {
    if (!isConnected) {
      setStatus('⚠️ الرجاء ربط المحفظة أولاً');
      return;
    }
    if (!toAddress || !amount) {
      setStatus('⚠️ الرجاء إدخال العنوان والمبلغ');
      return;
    }
    setStatus(`🚀 جاري إرسال ${amount} USDC إلى ${toAddress.substring(0, 6)}...`);
    setTimeout(() => {
      setStatus('✅ تم الإرسال بنجاح على Base Chain!');
    }, 2000);
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px',
      fontFamily: 'sans-serif'
    }}>
      <div style={{ maxWidth: '500px', margin: '0 auto' }}>
        
        {/* العنوان */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontSize: '48px', margin: '0', color: 'white' }}>
            Pesify 💸
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.9)', marginTop: '10px' }}>
            Stablecoin Payments on Base Chain
          </p>
        </div>

        {/* بطاقة المحفظة */}
        <div style={{ 
          background: 'white', 
          borderRadius: '20px', 
          padding: '20px',
          marginBottom: '20px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
        }}>
          <h2 style={{ margin: '0 0 15px 0', fontSize: '20px' }}>🔐 المحفظة</h2>
          
          {!isConnected ? (
            <button
              onClick={connectWallet}
              style={{
                width: '100%',
                padding: '15px',
                background: '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '16px',
                cursor: 'pointer'
              }}
            >
              ربط MetaMask
            </button>
          ) : (
            <div style={{ 
              background: '#e8f5e9', 
              padding: '10px', 
              borderRadius: '10px',
              wordBreak: 'break-all'
            }}>
              ✅ متصل: {address.substring(0, 6)}...{address.substring(38)}
            </div>
          )}
        </div>

        {/* بطاقة الإرسال */}
        <div style={{ 
          background: 'white', 
          borderRadius: '20px', 
          padding: '20px',
          marginBottom: '20px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
        }}>
          <h2 style={{ margin: '0 0 15px 0', fontSize: '20px' }}>📤 إرسال USDC</h2>
          
          <input
            type="text"
            placeholder="عنوان المستلم"
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '15px',
              border: '1px solid #ddd',
              borderRadius: '10px',
              fontSize: '14px'
            }}
          />
          
          <input
            type="number"
            placeholder="المبلغ (USDC)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '15px',
              border: '1px solid #ddd',
              borderRadius: '10px',
              fontSize: '14px'
            }}
          />
          
          <button
            onClick={sendPayment}
            style={{
              width: '100%',
              padding: '15px',
              background: '#4caf50',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '16px',
              cursor: 'pointer'
            }}
          >
            إرسال 💸
          </button>
        </div>

        {/* حالة التطبيق */}
        {status && (
          <div style={{ 
            background: 'rgba(0,0,0,0.7)', 
            color: 'white', 
            padding: '15px', 
            borderRadius: '10px',
            textAlign: 'center'
          }}>
            {status}
          </div>
        )}

        {/* معلومات إضافية */}
        <div style={{ 
          textAlign: 'center', 
          color: 'rgba(255,255,255,0.7)', 
          marginTop: '30px',
          fontSize: '12px'
        }}>
          <p>✨ يعمل على شبكة Base Sepolia | AI Fee Optimizer قادم قريباً ✨</p>
        </div>
      </div>
    </div>
  );
}
