(function() {
    'use strict';

    async function analyzeTrends() {
        try {
            // جلب المنشورات من الخادم
            const posts = await window.api.fetchPosts();

            // تصفية المنشورات حسب المدينة (مثل الخرطوم)
            const cityPosts = posts.filter(post => post.city === 'الخرطوم');

            // حساب الانحدار الخطي
            const { trend, confidence } = calculateTrend(cityPosts);

            return {
                trend,
                confidence
            };
        } catch (error) {
            console.error('خطأ في تحليل الاتجاهات:', error);
            throw error;
        }
    }

    function calculateTrend(posts) {
        // تحويل التواريخ إلى أرقام (تيمستامب)
        const x = posts.map(post => new Date(post.timestamp).getTime());
        const y = posts.map(post => post.price);

        // حساب الانحدار الخطي
        const n = x.length;
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, val, idx) => sum + val * y[idx], 0);
        const sumX2 = x.reduce((sum, val) => sum + val * val, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // حساب ثقة الانحدار (بناءً على حجم البيانات والتباين)
        const confidence = calculateConfidence(posts, slope);

        // تحديد الاتجاه بناءً على انحدار الخط
        const trend = slope > 0 ? 'ارتفاع' : slope < 0 ? 'هبوط' : 'ثبات';

        return {
            trend,
            confidence
        };
    }

    function calculateConfidence(posts, slope) {
        // حساب ثقة الانحدار (بناءً على حجم البيانات والتباين)
        const n = posts.length;
        const variance = posts.reduce((sum, post) => sum + Math.pow(post.price - (slope * new Date(post.timestamp).getTime() + intercept), 2), 0) / n;
        const stdDev = Math.sqrt(variance);

        // ثقة الانحدار (بناءً على حجم البيانات والتباين)
        const confidence = 100 - (stdDev / (posts.reduce((sum, post) => sum + post.price, 0) / n)) * 100;

        return Math.max(0, Math.min(100, confidence));
    }

    // تصدير الوظائف إلى النافذة العالمية
    window.feature37Logic = {
        analyzeTrends
    };
})();