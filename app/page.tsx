'use client';

import { useState, useEffect } from 'react';

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('');
  const [aiRecommendation, setAiRecommendation] = useState('');

  // دالة ربط المحفظة - هذه هي النسخة الصحيحة التي تعمل
  const connectWallet = async () => {
    setStatus('جاري الاتصال بالمحفظة...');
    
    // التحقق من وجود MetaMask
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      try {
        // هذا السطر يفتح نافذة MetaMask
        const accounts = await (window as any).ethereum.request({ 
          method: 'eth_requestAccounts' 
        });
        
        setAddress(accounts[0]);
        setIsConnected(true);
        setStatus('✅ محفظة متصلة بنجاح!');
      } catch (err) {
        console.error(err);
        setStatus('❌ فشل الاتصال أو تم رفضه من قبلك.');
      }
    } else {
      setStatus('⚠️ لم يتم العثور على MetaMask. الرجاء تثبيت الإضافة.');
    }
  };

  // دالة إرسال USDC - نسخة محاكاة
  const sendPayment = () => {
    if (!isConnected) {
      setStatus('⚠️ الرجاء ربط المحفظة أولاً');
      return;
    }
    if (!toAddress || !amount) {
      setStatus('⚠️ الرجاء إدخال العنوان والمبلغ');
      return;
    }
    if (toAddress.length !== 42 || !toAddress.startsWith('0x')) {
      setStatus('⚠️ العنوان غير صالح. يجب أن يبدأ بـ 0x ويتكون من 42 حرفاً');
      return;
    }
    
    setStatus(`🚀 جاري إرسال ${amount} USDC إلى ${toAddress.substring(0, 6)}...${toAddress.substring(38)}`);
    
    // محاكاة الإرسال
    setTimeout(() => {
      setStatus(`✅ تم إرسال ${amount} USDC بنجاح على Base Sepolia!`);
      setToAddress('');
      setAmount('');
    }, 3000);
  };

  // AI Recommendation - تحليل رسوم الشبكة
  useEffect(() => {
    const getRecommendation = async () => {
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        try {
          // محاكاة جلب رسوم الغاز من الشبكة
          const gasPrice = Math.floor(Math.random() * 50) + 10; // 10-60 Gwei
          
          if (gasPrice < 25) {
            setAiRecommendation('🟢 وقت ممتاز للإرسال! رسوم الغاز منخفضة (' + gasPrice + ' Gwei)');
          } else if (gasPrice < 40) {
            setAiRecommendation('🟡 رسوم متوسطة (' + gasPrice + ' Gwei) - يمكنك الإرسال الآن');
          } else {
            setAiRecommendation('🔴 رسوم مرتفعة (' + gasPrice + ' Gwei) - يفضل الانتظار 10 دقائق');
          }
        } catch (err) {
          setAiRecommendation('🤖 AI جاهز لتوصية الرسوم');
        }
      } else {
        setAiRecommendation('📱 ثبّت MetaMask لتفعيل AI');
      }
    };
    
    getRecommendation();
    const interval = setInterval(getRecommendation, 30000); // تحديث كل 30 ثانية
    
    return () => clearInterval(interval);
  }, []);

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

        {/* AI Recommendation Card */}
        {aiRecommendation && (
          <div style={{ 
            background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            borderRadius: '15px', 
            padding: '15px',
            marginBottom: '20px',
            color: 'white',
            textAlign: 'center',
            boxShadow: '0 5px 20px rgba(0,0,0,0.2)'
          }}>
            <div style={{ fontSize: '24px', marginBottom: '5px' }}>🤖</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>AI Fee Optimizer</div>
            <div style={{ fontSize: '12px', marginTop: '8px' }}>{aiRecommendation}</div>
          </div>
        )}

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
                cursor: 'pointer',
                fontWeight: 'bold'
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
              ✅ متصل: {address.substring(0, 8)}...{address.substring(36)}
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
            placeholder="عنوان المستلم (0x...)"
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
            disabled={!isConnected}
            style={{
              width: '100%',
              padding: '15px',
              background: isConnected ? '#4caf50' : '#cccccc',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '16px',
              cursor: isConnected ? 'pointer' : 'not-allowed',
              fontWeight: 'bold'
            }}
          >
            إرسال 💸
          </button>
        </div>

        {/* حالة التطبيق */}
        {status && (
          <div style={{ 
            background: 'rgba(0,0,0,0.8)', 
            color: 'white', 
            padding: '15px', 
            borderRadius: '10px',
            textAlign: 'center',
            fontSize: '14px'
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
          <p>✨ يعمل على شبكة Base Sepolia | AI Fee Optimizer ✨</p>
          <p style={{ marginTop: '10px', fontSize: '10px' }}>
            🧪 هذا إصدار تجريبي | الإرسال يعمل بشكل محاكاة للعرض
          </p>
        </div>
      </div>
    </div>
  );
}
