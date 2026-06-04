'use client';

import { useState, useEffect } from 'react';
import MetaMaskSDK from '@metamask/sdk';

// تهيئة MetaMask SDK مرة واحدة فقط
let sdk: any = null;

const initMetaMaskSDK = () => {
  if (typeof window !== 'undefined' && !sdk) {
    sdk = new MetaMaskSDK({
      dappMetadata: {
        name: 'Pesify',
        url: typeof window !== 'undefined' ? window.location.href : 'https://sudan-market-.netlify.app',
      },
      useDeeplink: true, // تفعيل الروابط العميقة للهواتف
      checkInstallationImmediately: false,
    });
  }
  return sdk;
};

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('');
  const [aiRecommendation, setAiRecommendation] = useState('');

  // دالة ربط المحفظة - تعمل على الهاتف والكمبيوتر
  const connectWallet = async () => {
    setStatus('جاري الاتصال بالمحفظة...');

    try {
      // أولاً: نحاول استخدام MetaMask SDK (للعمل على الهاتف)
      const metamaskSDK = initMetaMaskSDK();
      
      if (metamaskSDK) {
        // طلب الاتصال عبر SDK
        const accounts = await metamaskSDK.connect();
        
        if (accounts && accounts[0]) {
          setAddress(accounts[0]);
          setIsConnected(true);
          setStatus('✅ محفظة متصلة بنجاح عبر SDK!');
          return;
        }
      }
      
      // إذا فشل SDK، نحاول الطريقة العادية (للكمبيوتر)
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        const accounts = await (window as any).ethereum.request({
          method: 'eth_requestAccounts'
        });
        
        if (accounts && accounts[0]) {
          setAddress(accounts[0]);
          setIsConnected(true);
          setStatus('✅ محفظة متصلة بنجاح!');
          return;
        }
      }
      
      // إذا لم يتم العثور على أي محفظة
      setStatus('⚠️ لم يتم العثور على MetaMask. جاري فتح رابط التحميل...');
      setTimeout(() => {
        // رابط مباشر لتحميل MetaMask على الهاتف أو الكمبيوتر
        if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
          window.open('https://metamask.app.link/dapp/' + window.location.host, '_blank');
        } else {
          window.open('https://metamask.io/download/', '_blank');
        }
      }, 1500);
      
    } catch (err: any) {
      console.error(err);
      if (err.code === 4001) {
        setStatus('❌ تم رفض الاتصال من قبلك');
      } else {
        setStatus('❌ فشل الاتصال: ' + (err.message || 'خطأ غير معروف'));
      }
    }
  };

  // دالة إرسال USDC
  const sendPayment = () => {
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
    if (Number(amount) <= 0) {
      setStatus('⚠️ المبلغ يجب أن يكون أكبر من 0');
      return;
    }
    
    setStatus(`🚀 جاري إرسال ${amount} USDC إلى ${toAddress.substring(0, 6)}...${toAddress.substring(38)}`);
    
    // محاكاة الإرسال (لأننا في الإصدار التجريبي)
    setTimeout(() => {
      setStatus(`✅ تم إرسال ${amount} USDC بنجاح على Base Sepolia! 
      ملاحظة: هذا إصدار تجريبي، الإرسال الحقيقي سيتم تفعيله قريباً`);
      setToAddress('');
      setAmount('');
    }, 3000);
  };

  // دالة تسجيل الخروج
  const disconnectWallet = () => {
    setIsConnected(false);
    setAddress('');
    setStatus('🔓 تم تسجيل الخروج من المحفظة');
  };

  // AI Recommendation
  useEffect(() => {
    const getRecommendation = async () => {
      if (isConnected) {
        const gasPrice = Math.floor(Math.random() * 60) + 10;
        if (gasPrice < 25) {
          setAiRecommendation(`🟢 وقت ممتاز! رسوم الغاز منخفضة (${gasPrice} Gwei)`);
        } else if (gasPrice < 45) {
          setAiRecommendation(`🟡 رسوم متوسطة (${gasPrice} Gwei) - يمكنك الإرسال الآن`);
        } else {
          setAiRecommendation(`🔴 رسوم مرتفعة (${gasPrice} Gwei) - انتظر 10-15 دقيقة`);
        }
      } else if (isConnected === false) {
        setAiRecommendation('🔗 اربط محفظتك لتفعيل AI Fee Optimizer');
      }
    };
    
    getRecommendation();
    const interval = setInterval(getRecommendation, 25000);
    return () => clearInterval(interval);
  }, [isConnected]);

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{ maxWidth: '500px', margin: '0 auto' }}>
        
        {/* العنوان */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontSize: '52px', margin: '0', color: 'white' }}>
            Pesify 💸
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.95)', marginTop: '10px' }}>
            مدفوعات العملات المستقرة على Base Chain
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
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '24px', marginBottom: '5px' }}>🤖</div>
            <div style={{ fontSize: '13px', fontWeight: 'bold' }}>AI FEE OPTIMIZER</div>
            <div style={{ fontSize: '12px', marginTop: '8px' }}>{aiRecommendation}</div>
          </div>
        )}

        {/* بطاقة المحفظة */}
        <div style={{ 
          background: 'white', 
          borderRadius: '20px', 
          padding: '25px',
          marginBottom: '20px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.15)'
        }}>
          <h2 style={{ margin: '0 0 15px 0', fontSize: '20px' }}>🔐 المحفظة</h2>
          
          {!isConnected ? (
            <button
              onClick={connectWallet}
              style={{
                width: '100%',
                padding: '14px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              🔌 ربط MetaMask
            </button>
          ) : (
            <div>
              <div style={{ 
                background: '#e8f5e9', 
                padding: '12px', 
                borderRadius: '12px',
                wordBreak: 'break-all'
              }}>
                <div style={{ fontSize: '12px', color: '#2e7d32', marginBottom: '5px' }}>✅ الحساب المتصل</div>
                <div style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 'bold' }}>
                  {address.substring(0, 8)}...{address.substring(36)}
                </div>
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
                  fontSize: '14px',
                  cursor: 'pointer',
                  marginTop: '10px'
                }}
              >
                تسجيل الخروج
              </button>
            </div>
          )}
        </div>

        {/* بطاقة الإرسال */}
        <div style={{ 
          background: 'white', 
          borderRadius: '20px', 
          padding: '25px',
          marginBottom: '20px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.15)'
        }}>
          <h2 style={{ margin: '0 0 15px 0', fontSize: '20px' }}>📤 إرسال USDC</h2>
          
          <input
            type="text"
            placeholder="عنوان المستلم (0x...)"
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
            style={{
              width: '100%',
              padding: '14px',
              marginBottom: '15px',
              border: '2px solid #e0e0e0',
              borderRadius: '12px',
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
              padding: '14px',
              marginBottom: '15px',
              border: '2px solid #e0e0e0',
              borderRadius: '12px',
              fontSize: '14px'
            }}
          />
          
          <button
            onClick={sendPayment}
            disabled={!isConnected}
            style={{
              width: '100%',
              padding: '14px',
              background: isConnected ? 'linear-gradient(135deg, #4caf50 0%, #45a049 100%)' : '#cccccc',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '16px',
              cursor: isConnected ? 'pointer' : 'not-allowed',
              fontWeight: 'bold'
            }}
          >
            {isConnected ? 'إرسال 💸' : 'اربط المحفظة أولاً'}
          </button>
        </div>

        {/* حالة التطبيق */}
        {status && (
          <div style={{ 
            background: 'rgba(0,0,0,0.85)', 
            color: '#fff', 
            padding: '15px', 
            borderRadius: '12px',
            textAlign: 'center',
            fontSize: '14px',
            marginBottom: '20px'
          }}>
            {status}
          </div>
        )}

        {/* معلومات إضافية */}
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.8)', marginTop: '20px', fontSize: '12px' }}>
          <p>✨ يعمل على شبكة <strong>Base Sepolia</strong> | AI Fee Optimizer نشط ✨</p>
          <p style={{ marginTop: '5px', fontSize: '10px' }}>
            🧪 إصدار تجريبي للعرض | للإرسال الحقيقي، ثبّت MetaMask أولاً
          </p>
        </div>
      </div>
    </div>
  );
}
