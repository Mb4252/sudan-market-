(function() {
    'use strict';

    // دالة تنبؤ السعر باستخدام الانحدار الخطي
    function forecastPrice(prices) {
        if (!prices || prices.length < 2) return null;

        const n = prices.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += prices[i];
            sumXY += i * prices[i];
            sumX2 += i * i;
        }

        const denominator = (n * sumX2 - sumX * sumX);
        if (denominator === 0) return null;

        const slope = (n * sumXY - sumX * sumY) / denominator;
        const intercept = (sumY - slope * sumX) / n;
        const nextX = n;

        return slope * nextX + intercept;
    }

    // دالة حساب الثقة بناءً على حجم البيانات والتباين
    function calculateConfidence(prices) {
        if (!prices || prices.length < 2) return 0;

        const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
        const variance = prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / prices.length;
        const stdDev = Math.sqrt(variance);

        // نسبة التباين
        const cv = mean !== 0 ? stdDev / mean : 1;

        // حجم البيانات
        const sizeFactor = Math.min(prices.length / 10, 1);

        // الثقة النهائية
        const confidence = Math.max(0, Math.min(1, (1 - cv) * sizeFactor));

        return Math.round(confidence * 100);
    }

    // تصدير الدوال
    window.forecast = {
        forecastPrice,
        calculateConfidence
    };
})();