(function() {
    'use strict';

    async function fetchTrendAnalysis() {
        try {
            const posts = await window.api.fetchPosts();
            if (!posts || posts.length === 0) throw new Error('لا توجد منشورات للتحليل');

            const prices = posts.map(post => post.price);
            const timestamps = posts.map(post => new Date(post.timestamp).getTime());

            // حساب الانحدار الخطي
            const n = prices.length;
            const sumX = timestamps.reduce((a, b) => a + b, 0);
            const sumY = prices.reduce((a, b) => a + b, 0);
            const sumXY = timestamps.reduce((sum, x, i) => sum + x * prices[i], 0);
            const sumX2 = timestamps.reduce((sum, x) => sum + x * x, 0);

            const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
            const intercept = (sumY - slope * sumX) / n;

            // حساب ثقة التحليل (بناءً على حجم البيانات والتباين)
            const mean = sumY / n;
            const variance = prices.reduce((sum, y) => sum + Math.pow(y - mean, 2), 0) / n;
            const confidence = Math.min(100, Math.max(0, 100 - (variance / mean) * 100));

            return {
                trend: slope > 0 ? 'ارتفاع' : slope < 0 ? 'هبوط' : 'ثابت',
                confidence: Math.round(confidence)
            };
        } catch (error) {
            console.error('خطأ في تحليل الاتجاهات:', error);
            throw error;
        }
    }

    window.api.fetchTrendAnalysis = fetchTrendAnalysis;
})();