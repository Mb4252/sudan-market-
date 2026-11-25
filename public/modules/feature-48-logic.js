(function() {
    'use strict';

    class Feature48Logic {
        constructor() {
            this.lastAnalysis = null;
        }

        async analyzeCityTrends(city) {
            try {
                const posts = await window.api.fetchPosts();
                const cityPosts = posts.filter(post => post.city === city);

                if (cityPosts.length < 2) {
                    throw new Error('لا توجد بيانات كافية لتحليل الاتجاهات');
                }

                const trend = this.calculateTrend(cityPosts);
                const confidence = this.calculateConfidence(cityPosts);

                this.lastAnalysis = {
                    city,
                    trend,
                    confidence,
                    lastPosts: cityPosts.slice(-5)
                };

                return this.lastAnalysis;
            } catch (error) {
                throw error;
            }
        }

        calculateTrend(posts) {
            // منطق انحدار خطي بسيط
            const sortedPosts = posts.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            const prices = sortedPosts.map(post => post.price);
            const timestamps = sortedPosts.map(post => new Date(post.timestamp).getTime());

            const n = prices.length;
            let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

            for (let i = 0; i < n; i++) {
                sumX += timestamps[i];
                sumY += prices[i];
                sumXY += timestamps[i] * prices[i];
                sumXX += timestamps[i] * timestamps[i];
            }

            const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
            return slope > 0 ? 'ارتفاع' : slope < 0 ? 'هبوط' : 'ثابت';
        }

        calculateConfidence(posts) {
            // حساب الثقة بناءً على حجم البيانات والتباين
            const prices = posts.map(post => post.price);
            const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
            const variance = prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / prices.length;
            const stdDev = Math.sqrt(variance);

            // ثقة أعلى عندما يكون التباين منخفضًا وحجم البيانات كبير
            return Math.min(100, Math.max(0, 100 - (stdDev / mean) * 100));
        }
    }

    window.feature48Logic = new Feature48Logic();
})();