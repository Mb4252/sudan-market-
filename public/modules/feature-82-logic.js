// FILE: public/modules/feature-82-logic.js
(function() {
    'use strict';

    class Feature82Logic {
        constructor() {
            this.trendsData = null;
        }

        async analyzeTrends(city) {
            try {
                // جلب البيانات من الخادم
                const response = await fetch(`https://sudan-market-2.onrender.com/trends?city=${encodeURIComponent(city)}`);
                if (!response.ok) throw new Error('خطأ في جلب بيانات الاتجاهات');

                const data = await response.json();
                this.trendsData = data;

                // تحديث واجهة المستخدم
                window.feature82UI.updateChart(data);

                // تحليل الاتجاهات
                const trendAnalysis = this.analyzeTrendData(data.trends);
                window.feature82UI.updateResult(trendAnalysis);

                // حفظ البيانات في localStorage
                localStorage.setItem('feature82Data', JSON.stringify(data));
            } catch (error) {
                console.error('خطأ في تحليل الاتجاهات:', error);
                window.feature82UI.updateResult('حدث خطأ أثناء تحليل الاتجاهات. يرجى المحاولة مرة أخرى.');
            }
        }

        analyzeTrendData(trends) {
            // تحليل الاتجاهات باستخدام الانحدار الخطي
            const points = trends.map((trend, index) => [index, trend.value]);
            const { slope, intercept } = this.linearRegression(points);

            if (slope > 0) {
                return `الأسعار في هذه المدينة تزداد بشكل متزايد (ميل الانحدار: ${slope.toFixed(2)})`;
            } else if (slope < 0) {
                return `الأسعار في هذه المدينة تنخفض بشكل متزايد (ميل الانحدار: ${slope.toFixed(2)})`;
            } else {
                return 'الأسعار في هذه المدينة مستقرة (لا يوجد اتجاه واضح)';
            }
        }

        linearRegression(points) {
            const n = points.length;
            let sumX = 0;
            let sumY = 0;
            let sumXY = 0;
            let sumXX = 0;

            for (const [x, y] of points) {
                sumX += x;
                sumY += y;
                sumXY += x * y;
                sumXX += x * x;
            }

            const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
            const intercept = (sumY - slope * sumX) / n;

            return { slope, intercept };
        }
    }

    window.feature82Logic = new Feature82Logic();
})();