(function() {
    'use strict';

    function analyzeCityTrend(posts, city) {
        if (!posts || !city) return null;

        const cityPosts = posts.filter(post => post.city === city);
        if (cityPosts.length < 2) return null;

        // استخدام نفس منطق الانحدار الخطي من التنبؤ بالأسعار
        const { slope } = window.forecast.calculateTrend(cityPosts);

        return {
            trend: slope > 0 ? 'increase' : 'decrease',
            slope: slope,
            confidence: window.forecast.calculateConfidence(cityPosts)
        };
    }

    function renderTrendChart(trendData) {
        const chartContainer = document.getElementById('city-trend-chart');
        if (!chartContainer) return;

        if (!trendData) {
            chartContainer.innerHTML = '<p>لا توجد بيانات تحليلية متاحة</p>';
            return;
        }

        chartContainer.innerHTML = `
            <div class="trend-chart">
                <p>اتجاه السعر: ${trendData.trend === 'increase' ? 'ارتفاع' : 'انخفاض'}</p>
                <p>ميل الانحدار: ${trendData.slope.toFixed(4)}</p>
                <p>ثقة التحليل: ${trendData.confidence.toFixed(2)}%</p>
            </div>
        `;
    }

    window.feature55Logic = {
        analyzeCityTrend,
        renderTrendChart
    };
})();