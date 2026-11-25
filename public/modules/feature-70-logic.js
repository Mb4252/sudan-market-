(function() {
    'use strict';

    class Feature70Logic {
        constructor() {
            this.initStore();
            this.bindStoreEvents();
        }

        initStore() {
            // إضافة حالة جديدة للمخزن
            window.store.setState({
                cityTrends: {}
            });
        }

        bindStoreEvents() {
            // استجابة لطلب تحليل اتجاهات المدينة
            window.store.on('analyzeCityTrend', (e) => {
                const city = e.detail.city;
                this.analyzeCityTrend(city);
            });
        }

        analyzeCityTrend(city) {
            const posts = window.store.getState().posts;
            const cityPosts = posts.filter(post => post.city === city);

            if (cityPosts.length < 2) {
                this.updateTrendResult(city, 'لا توجد بيانات كافية لتحليل الاتجاهات');
                return;
            }

            // حساب الانحدار الخطي
            const { slope, intercept } = this.calculateLinearRegression(cityPosts);

            // تحديد الاتجاه
            let trend;
            if (slope > 0.1) {
                trend = 'ارتفاع';
            } else if (slope < -0.1) {
                trend = 'هبوط';
            } else {
                trend = 'ثبات';
            }

            // تحديث نتيجة التحليل في المخزن
            const trendResult = {
                city,
                trend,
                slope,
                intercept,
                dataPoints: cityPosts.length
            };

            window.store.setState({
                cityTrends: {
                    ...window.store.getState().cityTrends,
                    [city]: trendResult
                }
            });

            this.updateTrendResult(city, trendResult);
        }

        calculateLinearRegression(posts) {
            const n = posts.length;
            let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

            // تحويل التواريخ إلى أرقام (تيمستامب)
            posts.forEach(post => {
                const x = new Date(post.timestamp).getTime();
                const y = post.price;

                sumX += x;
                sumY += y;
                sumXY += x * y;
                sumXX += x * x;
            });

            const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
            const intercept = (sumY - slope * sumX) / n;

            return { slope, intercept };
        }

        updateTrendResult(city, trendResult) {
            const trendResultElement = document.getElementById('trend-result');

            if (typeof trendResult === 'string') {
                trendResultElement.innerHTML = `<p>تحليل اتجاهات مدينة ${city}: ${trendResult}</p>`;
            } else {
                trendResultElement.innerHTML = `
                    <h3>تحليل اتجاهات مدينة ${city}</h3>
                    <p>الاتجاه: ${trendResult.trend}</p>
                    <p>ميل الانحدار: ${trendResult.slope.toFixed(4)}</p>
                    <p>نقاط البيانات: ${trendResult.dataPoints}</p>
                `;
            }
        }
    }

    // تهيئة الميزة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', () => {
        new Feature70Logic();
    });
})();