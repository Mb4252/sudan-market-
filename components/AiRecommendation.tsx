'use client';

import { useEffect, useState } from 'react';
import { useFeeData } from 'wagmi';

interface FeeRecommendation {
  bestTime: string;
  estimatedFee: string;
  recommendation: string;
}

export default function AiRecommendation() {
  const [recommendation, setRecommendation] = useState<FeeRecommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const { data: feeData } = useFeeData();

  useEffect(() => {
    // محاكاة الذكاء الاصطناعي - في الواقع ستستدعي API
    const simulateAI = async () => {
      setLoading(true);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const gasPrice = feeData?.gasPrice;
      const recommendation_text = gasPrice && gasPrice < 1000000000 
        ? '🟢 وقت ممتاز للإرسال - رسوم الغاز منخفضة'
        : '🟡 رسوم مرتفعة حالياً - انتظر 10 دقائق';
      
      setRecommendation({
        bestTime: new Date().toLocaleTimeString(),
        estimatedFee: gasPrice ? `${Number(gasPrice) / 1e9} Gwei` : 'غير متوفر',
        recommendation: recommendation_text
      });
      setLoading(false);
    };
    
    simulateAI();
  }, [feeData]);

  if (loading) return <div className="text-center p-4">🤖 AI is analyzing fees...</div>;
  if (!recommendation) return null;

  return (
    <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg p-4 shadow-lg">
      <h3 className="text-lg font-bold mb-2">🤖 AI Fee Optimizer</h3>
      <div className="space-y-1 text-sm">
        <p>⏰ Best time: {recommendation.bestTime}</p>
        <p>💰 Current fee: {recommendation.estimatedFee}</p>
        <p>💡 {recommendation.recommendation}</p>
      </div>
    </div>
  );
}
