(function() {
    'use strict';

    async function analyzeTrends(city) {
        try {
            const posts = await window.api.fetchPosts();
            const cityPosts = posts.filter(post => post.city === city);

            if (cityPosts.length < 2) {
                throw new Error('لا توجد بيانات كافية لتحليل الاتجاهات');
            }

            const sortedPosts = cityPosts.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            const prices = sortedPosts.map(post => post.price);

            const { slope, intercept } = linearRegression(prices);
            const trend = slope > 0 ? 'increase' : 'decrease';
            const changePercentage = (slope / prices[0]) * 100;
            const confidence = calculateConfidence(cityPosts.length, prices);

            return {
                city,
                trend,
                changePercentage: changePercentage.toFixed(2),
                confidence: confidence.toFixed(2)
            };
        } catch (error) {
            console.error('خطأ في تحليل الاتجاهات:', error);
            throw error;
        }
    }

    function linearRegression(y) {
        const n = y.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += y[i];
            sumXY += i * y[i];
            sumXX += i * i;
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        return { slope, intercept };
    }

    function calculateConfidence(dataSize, prices) {
        const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
        const variance = prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / prices.length;
        const stdDev = Math.sqrt(variance);

        // ثقة أعلى مع حجم بيانات أكبر وتباين أقل
        return Math.min(100, (dataSize / 10) * (1 - (stdDev / mean)) * 100);
    }

    window.api.analyzeTrends = analyzeTrends;
})();