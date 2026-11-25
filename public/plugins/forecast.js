(function() {
    'use strict';

    // دالة الانحدار الخطي البسيط للتنبؤ بالسعر
    function forecastPrice(prices) {
        if (!Array.isArray(prices) || prices.length < 2) return null;
        const clean = prices.filter(p => typeof p === 'number' && p > 0);
        if (clean.length < 2) return null;
        
        const n = clean.length;
        const xs = clean.map((_, i) => i);
        const sumX = xs.reduce((a, b) => a + b, 0);
        const sumY = clean.reduce((a, b) => a + b, 0);
        const sumXY = xs.reduce((a, x, i) => a + x * clean[i], 0);
        const sumX2 = xs.reduce((a, x) => a + x * x, 0);
        
        const denominator = n * sumX2 - sumX * sumX;
        if (denominator === 0) return null;

        const slope = (n * sumXY - sumX * sumY) / denominator;
        const intercept = (sumY - slope * sumX) / n;
        
        // التنبؤ للخطوة التالية (n)
        const predicted = intercept + slope * n;
        return Math.round(predicted);
    }

    // حساب مؤشر الثقة (Confidence Score) بناءً على حجم البيانات وتباينها
    function calculateConfidence(prices) {
        if (!Array.isArray(prices) || prices.length < 2) return 0;
        const clean = prices.filter(p => typeof p === 'number' && p > 0);
        if (clean.length < 2) return 0;

        // عامل الحجم: كلما زادت البيانات زادت الثقة
        const sizeFactor = Math.min(clean.length / 10, 1); // 10+ points = 100% size factor

        // عامل التباين: كلما قل التباين (نسبة الانحراف المعياري للمتوسط) زادت الثقة
        const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
        if (mean === 0) return 0;
        
        const variance = clean.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / clean.length;
        const stdDev = Math.sqrt(variance);
        const cv = stdDev / mean; // Coefficient of Variation
        const stabilityFactor = Math.max(0, 1 - cv); // إذا كان التباين عالياً تنخفض الثقة

        // دمج العوامل
        const confidence = sizeFactor * 0.4 + stabilityFactor * 0.6;
        return Math.round(confidence * 100);
    }

    // دالة موحدة للتحليل والتنبؤ
    window.ForecastPlugin = {
        predict: function(prices) {
            return {
                predictedPrice: forecastPrice(prices),
                confidence: calculateConfidence(prices)
            };
        }
    };

    console.log('[Forecast Plugin] Loaded successfully.');
})();