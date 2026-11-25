(function() {
    'use strict';

    function analyzeTrend(posts, city) {
        const cityPosts = posts.filter(post => post.city === city);
        if (cityPosts.length < 2) {
            return {
                trend: 0,
                forecast: 0,
                confidence: 0
            };
        }

        // حساب الانحدار الخطي
        const x = cityPosts.map((_, i) => i);
        const y = cityPosts.map(post => post.price);

        const n = x.length;
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
        const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // التنبؤ بالأسعار المستقبلية
        const forecast = intercept + slope * (n + 1);

        // حساب الثقة (بناءً على حجم البيانات والتباين)
        const prices = cityPosts.map(post => post.price);
        const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
        const variance = prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / prices.length;
        const stdDev = Math.sqrt(variance);
        const confidence = Math.min(100, (1 - stdDev / mean) * 100);

        return {
            trend: slope,
            forecast: forecast,
            confidence: confidence
        };
    }

    window.feature49Logic = {
        analyzeTrend: analyzeTrend
    };
})();