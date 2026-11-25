(function() {
    'use strict';

    async function analyzeCityTrend(city) {
        try {
            const posts = await window.api.fetchPosts();
            const cityPosts = posts.filter(post => post.city === city);

            if (cityPosts.length < 5) {
                throw new Error('عدد المنشورات في المدينة غير كافٍ للتحليل');
            }

            // حساب الاتجاه باستخدام الانحدار الخطي
            const trend = calculateTrend(cityPosts);

            return {
                city,
                trend: trend.slope > 0 ? 'ارتفاع' : 'هبوط',
                minPrice: Math.min(...cityPosts.map(p => p.price)),
                maxPrice: Math.max(...cityPosts.map(p => p.price)),
                avgPrice: cityPosts.reduce((sum, p) => sum + p.price, 0) / cityPosts.length
            };
        } catch (error) {
            console.error('Error analyzing city trend:', error);
            throw error;
        }
    }

    function calculateTrend(posts) {
        // تنزيل البيانات إلى مصفوفات
        const x = posts.map((_, i) => i); // الفهرس الزمني
        const y = posts.map(p => p.price); // الأسعار

        // حساب الانحدار الخطي
        const n = x.length;
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
        const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        return { slope, intercept };
    }

    window.feature27Logic = {
        analyzeCityTrend
    };
})();