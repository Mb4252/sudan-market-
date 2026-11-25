(function() {
    'use strict';

    function initFeature74UI() {
        // إنشاء واجهة المستخدم الخاصة بميزة #74
        const feature74Container = document.createElement('div');
        feature74Container.id = 'feature-74-container';
        feature74Container.innerHTML = `
            <h3>تحليل اتجاهات المدينة</h3>
            <div id="city-trend-analysis">
                <select id="city-select">
                    <option value="">اختر مدينة</option>
                    <option value="الخرطوم">الخرطوم</option>
                    <option value="أم درمان">أم درمان</option>
                    <option value="بورتسودان">بورتسودان</option>
                    <option value="كادوقلي">كادوقلي</option>
                </select>
                <button id="analyze-trend-btn">تحليل الاتجاهات</button>
                <div id="trend-chart"></div>
            </div>
        `;

        document.getElementById('main-content').appendChild(feature74Container);

        // ربط الأحداث
        document.getElementById('analyze-trend-btn').addEventListener('click', analyzeCityTrend);
    }

    function analyzeCityTrend() {
        const city = document.getElementById('city-select').value;
        if (!city) {
            alert('يرجى اختيار مدينة');
            return;
        }

        // استدعاء الوظيفة من module logic
        window.feature74Logic.analyzeCityTrend(city)
            .then(trendData => {
                renderTrendChart(trendData);
            })
            .catch(error => {
                console.error('خطأ في تحليل الاتجاهات:', error);
                alert('حدث خطأ أثناء تحليل الاتجاهات');
            });
    }

    function renderTrendChart(trendData) {
        const chartContainer = document.getElementById('trend-chart');
        chartContainer.innerHTML = '';

        // إنشاء الرسم البياني النصي
        const chart = document.createElement('div');
        chart.className = 'trend-chart';
        chart.innerHTML = `
            <h4>اتجاهات الأسعار في ${trendData.city}</h4>
            <p>الانحدار: ${trendData.slope.toFixed(2)}</p>
            <p>التوقيت: ${trendData.intercept.toFixed(2)}</p>
            <p>التوقيت: ${trendData.intercept.toFixed(2)}</p>
            <p>الحد الأدنى للسعر: ${trendData.minPrice.toFixed(2)}</p>
            <p>الحد الأقصى للسعر: ${trendData.maxPrice.toFixed(2)}</p>
            <p>اتجاه: ${trendData.trend === 'up' ? 'ارتفاع' : 'انخفاض'}</p>
        `;

        chartContainer.appendChild(chart);
    }

    // تهيئة الواجهة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', initFeature74UI);

    // تصدير الواجهة للتواصل مع module logic
    window.feature74UI = {
        renderTrendChart
    };
})();