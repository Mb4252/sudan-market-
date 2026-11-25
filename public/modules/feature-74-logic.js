(function() {
    'use strict';

    async function analyzeCityTrend(city) {
        // جلب المنشورات من المدينة المحددة
        const posts = await window.api.fetchPosts();
        const cityPosts = posts.filter(post => post.city === city);

        if (cityPosts.length < 2) {
            throw new Error('لا توجد بيانات كافية لتحليل الاتجاهات');
        }

        // تحضير البيانات لتحليل الانحدار الخطي
        const x = cityPosts.map((_, index) => index);
        const y = cityPosts.map(post => post.price);

        // حساب الانحدار الخطي
        const { slope, intercept } = linearRegression(x, y);

        // تحديد الاتجاه
        const trend = slope > 0 ? 'up' : 'down';

        // حساب الحد الأدنى والحد الأقصى للسعر
        const minPrice = Math.min(...y);
        const maxPrice = Math.max(...y);

        return {
            city,
            slope,
            intercept,
            trend,
            minPrice,
            maxPrice
        };
    }

    function linearRegression(x, y) {
        const n = x.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

        for (let i = 0; i < n; i++) {
            sumX += x[i];
            sumY += y[i];
            sumXY += x[i] * y[i];
            sumXX += x[i] * x[i];
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        return { slope, intercept };
    }

    // تصدير الوظائف للتواصل مع module UI
    window.feature74Logic = {
        analyzeCityTrend
    };
})();