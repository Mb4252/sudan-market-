(function() {
    'use strict';

    class Feature58Logic {
        constructor() {
            this.posts = [];
        }

        async analyzeCityTrend(city) {
            try {
                const posts = await window.api.fetchPosts();
                this.posts = posts.filter(post => post.city === city);

                if (this.posts.length < 5) {
                    throw new Error('لا توجد بيانات كافية لتحليل المدينة');
                }

                const trend = this.calculateTrend();
                const confidence = this.calculateConfidence();

                window.feature58UI.updateChart({ trend, confidence });
            } catch (error) {
                console.error('خطأ في تحليل اتجاهات المدينة:', error);
                alert(error.message);
            }
        }

        calculateTrend() {
            // استخدام الانحدار الخطي لحساب الاتجاه
            const x = this.posts.map((_, i) => i);
            const y = this.posts.map(post => post.price);

            const n = x.length;
            const sumX = x.reduce((a, b) => a + b, 0);
            const sumY = y.reduce((a, b) => a + b, 0);
            const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
            const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

            const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
            return slope;
        }

        calculateConfidence() {
            // حساب الثقة بناءً على حجم البيانات والتباين
            const prices = this.posts.map(post => post.price);
            const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
            const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length;
            const stdDev = Math.sqrt(variance);

            // ثقة أعلى عندما يكون التباين منخفضًا وحجم البيانات كبيرًا
            return Math.min(1, (1 / (stdDev + 1)) * (prices.length / 10));
        }
    }

    window.feature58Logic = new Feature58Logic();
})();