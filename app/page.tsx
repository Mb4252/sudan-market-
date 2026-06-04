'use client';

import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import QRCode from 'qrcode';

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
  const [qrCode, setQrCode] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  // عنوان USDC على Base Mainnet (للعملات الحقيقية)
  const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  
  const USDC_ABI = [
    'function transfer(address to, uint256 amount) external returns (bool)',
    'function balanceOf(address account) external view returns (uint256)',
    'function decimals() external view returns (uint8)'
  ];

  // إنشاء باركود QR لربط المحفظة
  const generateQRCode = async () => {
    // الرابط العميق لفتح التطبيق في MetaMask
    const dappUrl = `https://metamask.app.link/dapp/${window.location.host}`;
    
    try {
      const canvas = qrCanvasRef.current;
      if (canvas) {
        await QRCode.toCanvas(canvas, dappUrl, {
          width: 250,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#ffffff'
          }
        });
        setQrCode(dappUrl);
      }
    } catch (err) {
      console.error('خطأ في إنشاء الباركود:', err);
      setStatus('❌ فشل في إنشاء الباركود');
    }
  };

  // التحقق من الاتصال (يتم استدعاؤها كل ثانية للكشف عن الربط)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (showQr && !isConnected) {
      interval = setInterval(async () => {
        if (window.ethereum) {
          try {
            const accounts = await window.ethereum.request({ 
              method: 'eth_accounts' 
            });
            
            if (accounts && accounts.length > 0 && !isConnected) {
              // تم الربط! إخفاء الباركود وتسجيل الدخول
              setShowQr(false);
              setAddress(accounts[0]);
              setIsConnected(true);
              setStatus('✅ تم الاتصال بالمحفظة بنجاح!');
              setIsConnecting(false);
              
              // جلب الرصيد
              const provider = new ethers.BrowserProvider(window.ethereum);
              const contract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
              const decimals = await contract.decimals();
              const rawBalance = await contract.balanceOf(accounts[0]);
              setBalance(ethers.formatUnits(rawBalance, decimals));
              
              clearInterval(interval);
            }
          } catch (err) {
            console.error('خطأ في التحقق:', err);
          }
        }
      }, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [showQr, isConnected]);

  // ربط المحفظة بالباركود
  const connectWithQR = async () => {
    setShowQr(true);
    setIsConnecting(true);
    setStatus('📱 افتح MetaMask → اضغط على Scan → امسح الباركود');
    await generateQRCode();
  };

  // إلغاء الباركود
  const cancelQR = () => {
    setShowQr(false);
    setIsConnecting(false);
    setStatus('');
  };

  // ربط المحفظة بالطريقة العادية (للاختبار على الكمبيوتر)
  const connectWalletDirect = async () => {
    if (!window.ethereum) {
      setStatus("⚠️ MetaMask غير مثبت");
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
        setStatus("✅ تم الاتصال بالمحفظة بنجاح");
        
        const provider = new ethers.BrowserProvider(window.ethereum);
        const contract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
        const decimals = await contract.decimals();
        const rawBalance = await contract.balanceOf(accounts[0]);
        setBalance(ethers.formatUnits(rawBalance, decimals));
      }
    } catch (err: any) {
      setStatus("❌ فشل الاتصال: " + (err.message || "خطأ غير معروف"));
    }
  };

  // الحصول على رصيد USDC
  const getBalance = async (walletAddress: string) => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
      const decimals = await contract.decimals();
      const rawBalance = await contract.balanceOf(walletAddress);
      setBalance(ethers.formatUnits(rawBalance, decimals));
    } catch (err) {
      console.error('خطأ في جلب الرصيد:', err);
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
    setStatus('🚀 جاري تجهيز المعاملة...');

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
      const decimals = await contract.decimals();
      const amountWithDecimals = ethers.parseUnits(amount, decimals);
      
      setStatus('⏳ جاري إرسال المعاملة إلى الشبكة...');
      const tx = await contract.transfer(toAddress, amountWithDecimals);
      
      setStatus(`⏳ في انتظار التأكيدات... (Hash: ${tx.hash.substring(0, 12)}...)`);
      await tx.wait();
      
      setStatus(`✅ تم إرسال ${amount} USDC بنجاح إلى ${toAddress.substring(0, 8)}...`);
      setToAddress('');
      setAmount('');
      
      // تحديث الرصيد
      const provider2 = new ethers.BrowserProvider(window.ethereum);
      const contract2 = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider2);
      const decimals2 = await contract2.decimals();
      const rawBalance = await contract2.balanceOf(address);
      setBalance(ethers.formatUnits(rawBalance, decimals2));
      
    } catch (err: any) {
      console.error(err);
      if (err.code === 'ACTION_REJECTED') {
        setStatus('❌ تم رفض المعاملة من قبلك');
      } else if (err.message?.includes('insufficient funds')) {
        setStatus('❌ رصيد غير كافٍ. تأكد من وجود USDC و ETH في محفظتك');
      } else {
        setStatus('❌ فشل الإرسال: ' + (err.message || 'خطأ غير معروف'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // تسجيل الخروج
  const disconnectWallet = () => {
    setIsConnected(false);
    setAddress('');
    setBalance('');
    setStatus('🔓 تم تسجيل الخروج من المحفظة');
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
            setAiRecommendation(`🟢 وقت ممتاز! رسوم الغاز منخفضة (${gasPriceGwei.toFixed(0)} Gwei)`);
          } else if (gasPriceGwei < 30) {
            setAiRecommendation(`🟡 رسوم متوسطة (${gasPriceGwei.toFixed(0)} Gwei) - يمكنك الإرسال الآن`);
          } else {
            setAiRecommendation(`🔴 رسوم مرتفعة (${gasPriceGwei.toFixed(0)} Gwei) - انتظر قليلاً`);
          }
        } catch (err) {
          setAiRecommendation('🤖 AI جاهز لتوصية الرسوم');
        }
      } else if (!isConnected) {
        setAiRecommendation('🔗 اربط محفظتك لتفعيل AI Fee Optimizer');
      }
    };
    
    getRecommendation();
    const interval = setInterval(getRecommendation, 30000);
    return () => clearInterval(interval);
  }, [isConnected]);

  // واجهة المستخدم
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
            <div>
              {!showQr ? (
                <div>
                  <button
                    onClick={connectWithQR}
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
                      marginBottom: '10px'
                    }}
                  >
                    📱 ربط بالباركود (للهاتف)
                  </button>
                  <button
                    onClick={connectWalletDirect}
                    style={{
                      width: '100%',
                      padding: '14px',
                      background: '#4caf50',
                      color: 'white',
                      border: 'none',
                      borderRadius: '12px',
                      fontSize: '16px',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    🖥️ ربط مباشر (للكمبيوتر)
                  </button>
                </div>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    background: 'white',
                    padding: '20px',
                    borderRadius: '16px',
                    marginBottom: '15px'
                  }}>
                    <canvas ref={qrCanvasRef} style={{ width: '250px', height: '250px', margin: '0 auto', display: 'block' }}></canvas>
                  </div>
                  <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>
                    1. افتح تطبيق MetaMask<br/>
                    2. اضغط على زر Scan (الماسح الضوئي)<br/>
                    3. امسح الباركود<br/>
                    4. وافق على الاتصال
                  </p>
                  <button
                    onClick={cancelQR}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: '#f44336',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    إلغاء
                  </button>
                </div>
              )}
            </div>
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
                {balance && (
                  <div style={{ fontSize: '13px', marginTop: '8px', color: '#1b5e20' }}>
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
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '14px',
              marginBottom: '15px',
              border: '2px solid #e0e0e0',
              borderRadius: '12px',
              fontSize: '14px',
              opacity: isLoading ? 0.6 : 1
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
              padding: '14px',
              marginBottom: '15px',
              border: '2px solid #e0e0e0',
              borderRadius: '12px',
              fontSize: '14px',
              opacity: isLoading ? 0.6 : 1
            }}
          />
          
          <button
            onClick={sendUSDC}
            disabled={!isConnected || isLoading}
            style={{
              width: '100%',
              padding: '14px',
              background: (isConnected && !isLoading) ? 'linear-gradient(135deg, #4caf50 0%, #45a049 100%)' : '#cccccc',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '16px',
              cursor: (isConnected && !isLoading) ? 'pointer' : 'not-allowed',
              fontWeight: 'bold'
            }}
          >
            {isLoading ? 'جاري الإرسال...' : (isConnected ? 'إرسال 💸' : 'اربط المحفظة أولاً')}
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
          <p>✨ يعمل على شبكة <strong>Base Mainnet</strong> | AI Fee Optimizer نشط ✨</p>
          <p style={{ marginTop: '5px', fontSize: '10px' }}>
            💰 الإرسال حقيقي | يتطلب USDC و ETH حقيقيين في محفظتك
          </p>
        </div>
      </div>
    </div>
  );
}
