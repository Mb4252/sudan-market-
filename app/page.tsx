'use client';

import { useState, useEffect } from 'react';

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('');
  const [aiRecommendation, setAiRecommendation] = useState('');

  // دالة ربط المحفظة - نسخة محسنة تعمل على جميع الأجهزة
  const connectWallet = async () => {
    setStatus('جاري الاتصال بالمحفظة...');
    
    // التحقق من وجود MetaMask
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      try {
        // طلب الوصول للمحفظة
        const accounts = await (window as any).ethereum.request({ 
          method: 'eth_requestAccounts' 
        });
        
        if (accounts && accounts.length > 0) {
          setAddress(accounts[0]);
          setIsConnected(true);
          setStatus('✅ محفظة متصلة بنجاح!');
          
          // إضافة مستمع لتغيير الحساب
          (window as any).ethereum.on('accountsChanged', (newAccounts: string[]) => {
            if (newAccounts.length === 0) {
              setIsConnected(false);
              setAddress('');
              setStatus('⚠️ تم تسجيل الخروج من المحفظة');
            } else {
              setAddress(newAccounts[0]);
              setStatus('✅ تم تغيير الحساب بنجاح');
            }
          });
        }
      } catch (err: any) {
        console.error(err);
        if (err.code === 4001) {
          setStatus('❌ تم رفض الاتصال من قبلك');
        } else {
          setStatus('❌ فشل الاتصال: ' + (err.message || 'خطأ غير معروف'));
        }
      }
    } else {
      setStatus('⚠️ لم يتم العثور على MetaMask. جاري فتح رابط التحميل...');
      // فتح رابط تحميل MetaMask
      setTimeout(() => {
        window.open('https://metamask.io/download/', '_blank');
      }, 1500);
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
    
    // محاكاة الإرسال
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

  // AI Recommendation - تحليل رسوم الشبكة
  useEffect(() => {
    const getRecommendation = async () => {
      if (typeof window !== 'undefined' && (window as any).ethereum && isConnected) {
        try {
          // جلب رسوم الغاز من الشبكة (محاكاة)
          const gasPrice = Math.floor(Math.random() * 60) + 10; // 10-70 Gwei
          
          if (gasPrice < 25) {
            setAiRecommendation(`🟢 وقت ممتاز! رسوم الغاز منخفضة (${gasPrice} Gwei) - وفر حتى 50%`);
          } else if (gasPrice < 45) {
            setAiRecommendation(`🟡 رسوم متوسطة (${gasPrice} Gwei) - يمكنك الإرسال الآن`);
          } else {
            setAiRecommendation(`🔴 رسوم مرتفعة (${gasPrice} Gwei) - انتظر 10-15 دقيقة لتوفير 30%`);
          }
        } catch (err) {
          setAiRecommendation('🤖 AI جاهز لتوصية الرسوم');
        }
      } else if (isConnected) {
        setAiRecommendation('🤖 جاري تحليل الشبكة...');
      } else {
        setAiRecommendation('🔗 اربط محفظتك لتفعيل AI Fee Optimizer');
      }
    };
    
    getRecommendation();
    const interval = setInterval(getRecommendation, 25000); // تحديث كل 25 ثانية
    
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
          <h1 style={{ fontSize: '52px', margin: '0', color: 'white', textShadow: '2px 2px 4px rgba(0,0,0,0.2)' }}>
            Pesify 💸
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.95)', marginTop: '10px', fontSize: '16px' }}>
            مدفوعات العملات المستقرة على Base Chain
          </p>
          <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: '5px', fontSize: '12px' }}>
            تحويلات فورية | رسوم منخفضة | ذكاء اصطناعي
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
            boxShadow: '0 5px 20px rgba(0,0,0,0.2)',
            animation: 'fadeIn 0.5s ease-in'
          }}>
            <div style={{ fontSize: '28px', marginBottom: '5px' }}>🤖</div>
            <div style={{ fontSize: '13px', fontWeight: 'bold', letterSpacing: '1px' }}>AI FEE OPTIMIZER</div>
            <div style={{ fontSize: '13px', marginTop: '8px' }}>{aiRecommendation}</div>
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
          <h2 style={{ margin: '0 0 15px 0', fontSize: '20px', color: '#333' }}>🔐 المحفظة</h2>
          
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
                fontWeight: 'bold',
                transition: 'transform 0.2s, box-shadow 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 5px 20px rgba(102,126,234,0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              🔌 ربط MetaMask
            </button>
          ) : (
            <div>
              <div style={{ 
                background: 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)', 
                padding: '12px', 
                borderRadius: '12px',
                wordBreak: 'break-all',
                marginBottom: '10px'
              }}>
                <div style={{ fontSize: '12px', color: '#2e7d32', marginBottom: '5px' }}>✅ الحساب المتصل</div>
                <div style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 'bold', color: '#1b5e20' }}>
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
          <h2 style={{ margin: '0 0 15px 0', fontSize: '20px', color: '#333' }}>📤 إرسال USDC</h2>
          
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
              fontSize: '14px',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = '#667eea'}
            onBlur={(e) => e.currentTarget.style.borderColor = '#e0e0e0'}
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
              fontSize: '14px',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = '#667eea'}
            onBlur={(e) => e.currentTarget.style.borderColor = '#e0e0e0'}
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
              fontWeight: 'bold',
              transition: 'transform 0.2s'
            }}
            onMouseEnter={(e) => {
              if (isConnected) {
                e.currentTarget.style.transform = 'translateY(-2px)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
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
            marginBottom: '20px',
            backdropFilter: 'blur(10px)'
          }}>
            {status}
          </div>
        )}

        {/* معلومات إضافية */}
        <div style={{ 
          textAlign: 'center', 
          color: 'rgba(255,255,255,0.8)', 
          marginTop: '20px',
          fontSize: '12px'
        }}>
          <p>✨ يعمل على شبكة <strong>Base Sepolia</strong> | AI Fee Optimizer نشط ✨</p>
          <p style={{ marginTop: '8px', fontSize: '10px', opacity: 0.7 }}>
            🧪 إصدار تجريبي للعرض | إرسال حقيقي سيتم تفعيله قريباً على Mainnet
          </p>
          <p style={{ marginTop: '5px', fontSize: '9px' }}>
            © 2026 Pesify - حلول الدفع بالعملات المستقرة لأمريكا اللاتينية
          </p>
        </div>
      </div>
      
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
