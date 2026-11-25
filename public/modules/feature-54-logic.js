(function() {
    'use strict';

    class Feature54Logic {
        constructor() {
            this.cities = ['الخرطوم', 'أم درمان', 'بورتسودان', 'كسلا', 'عطبرة', 'الدمازين'];
            this.init();
        }

        init() {
            // تحميل المدن في قائمة الاختيار
            const citySelect = document.getElementById('feature-54-city-select');
            if (citySelect) {
                this.cities.forEach(city => {
                    const option = document.createElement('option');
                    option.value = city;
                    option.textContent = city;
                    citySelect.appendChild(option);
                });
            }

            // تسجيل الاستماع إلى الأحداث
            window.store.on('analyzeCityTrends', (e) => this.analyzeCityTrends(e.detail));
        }

        async analyzeCityTrends({ city }) {
            try {
                // جلب المنشورات للمدينة المحددة
                const posts = await window.api.fetchPosts();
                const cityPosts = posts.filter(post => post.city === city);

                if (cityPosts.length < 5) {
                    throw new Error('لا توجد بيانات كافية لتحليل اتجاهات المدينة');
                }

                // تحليل الاتجاه
                const trendData = this.calculateTrend(cityPosts);
                window.feature54UI.updateResults(trendData);
            } catch (error) {
                window.feature54UI.updateResults({ error: error.message });
            }
        }

        calculateTrend(posts) {
            // ترتيب المنشورات حسب التاريخ
            const sortedPosts = posts.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            // استخراج الأسعار والأوقات
            const prices = sortedPosts.map(post => post.price);
            const times = sortedPosts.map((post, index) => index);

            // حساب الانحدار الخطي
            const { slope, intercept } = this.linearRegression(times, prices);

            // حساب الاتجاه
            const trend = slope > 0 ? 'up' : 'down';

            // حساب الثقة (بناءً على حجم البيانات والتباين)
            const confidence = this.calculateConfidence(posts.length, prices);

            return {
                trend,
                confidence,
                labels: times.map(t => `منشور ${t + 1}`),
                values: prices
            };
        }

        linearRegression(x, y) {
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

        calculateConfidence(dataSize, prices) {
            // حساب التباين
            const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
            const variance = prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / prices.length;
            const stdDev = Math.sqrt(variance);

            // حساب الثقة (بناءً على حجم البيانات والتباين)
            // هنا نستخدم صيغة بسيطة: الثقة = (حجم البيانات / 10) * (1 - (التباين / متوسط السعر))
            const confidence = Math.min(100, Math.max(0, (dataSize / 10) * (1 - (stdDev / mean)) * 100));

            return Math.round(confidence);
        }
    }

    window.feature54Logic = new Feature54Logic();
})();