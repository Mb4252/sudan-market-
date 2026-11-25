(function() {
    'use strict';

    // دالة استخراج الأسعار من المنشورات
    function extractPrices(posts) {
        if (!Array.isArray(posts)) return [];

        return posts.map(post => {
            const price = parseFloat(post.price);
            return isNaN(price) ? 0 : price;
        }).filter(price => price > 0);
    }

    // دالة حساب متوسط السعر
    function calculateAveragePrice(prices) {
        if (!Array.isArray(prices) || prices.length === 0) return 0;

        const sum = prices.reduce((acc, price) => acc + price, 0);
        return sum / prices.length;
    }

    // دالة تحليل اتجاهات الأسعار
    function analyzePriceTrends(posts) {
        if (!Array.isArray(posts) || posts.length < 2) return { trend: 'غير متاح', confidence: 0 };

        // ترتيب المنشورات حسب التاريخ
        const sortedPosts = [...posts].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // حساب الانحدار الخطي
        const n = sortedPosts.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

        sortedPosts.forEach((post, i) => {
            const x = i + 1; // رقم المنشور
            const y = parseFloat(post.price) || 0;

            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumX2 += x * x;
        });

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // تحديد الاتجاه
        let trend;
        if (slope > 0.1) {
            trend = 'ارتفاع'; // انحدار إيجابي
        } else if (slope < -0.1) {
            trend = 'انخفاض'; // انحدار سلبي
        } else {
            trend = 'ثابت'; // انحدار معدوم
        }

        // حساب الثقة (0-1)
        const confidence = Math.min(1, Math.abs(slope) * 0.5 + (n / 100));

        return { trend, confidence };
    }

    window.priceExtractor = {
        extractPrices,
        calculateAveragePrice,
        analyzePriceTrends
    };
})();