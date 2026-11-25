(function() {
    'use strict';

    function initializeFeature27UI() {
        const feature27Container = document.getElementById('feature-27-container');
        if (!feature27Container) {
            console.error('Feature 27 container not found');
            return;
        }

        // إنشاء واجهة المستخدم للميزة 27
        feature27Container.innerHTML = `
            <div class="feature-27-panel">
                <h3>تحليل اتجاهات المدينة</h3>
                <div class="city-selector">
                    <label for="city-select">اختر مدينة:</label>
                    <select id="city-select">
                        <option value="الخرطوم">الخرطوم</option>
                        <option value="أم درمان">أم درمان</option>
                        <option value="بورت سودان">بورت سودان</option>
                        <option value="كادوقلي">كادوقلي</option>
                    </select>
                </div>
                <button id="analyze-trend">تحليل الاتجاهات</button>
                <div id="trend-result" class="trend-result"></div>
            </div>
        `;

        // إضافة معالجات الأحداث
        document.getElementById('analyze-trend').addEventListener('click', handleTrendAnalysis);
    }

    function handleTrendAnalysis() {
        const city = document.getElementById('city-select').value;
        window.feature27Logic.analyzeCityTrend(city)
            .then(result => {
                displayTrendResult(result);
            })
            .catch(error => {
                console.error('Error analyzing trend:', error);
                displayError('حدث خطأ أثناء تحليل الاتجاهات');
            });
    }

    function displayTrendResult(result) {
        const trendResult = document.getElementById('trend-result');
        trendResult.innerHTML = `
            <h4>نتائج تحليل اتجاهات ${result.city}</h4>
            <p>الاتجاه: ${result.trend}</p>
            <p>الحد الأدنى: ${result.minPrice}</p>
            <p>الحد الأقصى: ${result.maxPrice}</p>
            <p>المتوسط: ${result.avgPrice}</p>
        `;
    }

    function displayError(message) {
        const trendResult = document.getElementById('trend-result');
        trendResult.innerHTML = `<p class="error">${message}</p>`;
    }

    window.feature27UI = {
        initializeFeature27UI
    };
})();