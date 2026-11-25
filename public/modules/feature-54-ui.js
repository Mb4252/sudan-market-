(function() {
    'use strict';

    class Feature54UI {
        constructor() {
            this.initUI();
        }

        initUI() {
            // إنشاء واجهة المستخدم الخاصة بميزة #54
            const container = document.createElement('div');
            container.id = 'feature-54-container';
            container.innerHTML = `
                <div class="feature-54-header">
                    <h2>تحليل اتجاهات المدينة</h2>
                </div>
                <div class="feature-54-controls">
                    <select id="feature-54-city-select">
                        <option value="">اختر مدينة</option>
                    </select>
                    <button id="feature-54-analyze-btn">تحليل</button>
                </div>
                <div id="feature-54-results" class="feature-54-results"></div>
            `;

            // إضافة إلى الصفحة
            document.body.appendChild(container);

            // ربط الأحداث
            this.bindEvents();
        }

        bindEvents() {
            document.getElementById('feature-54-analyze-btn').addEventListener('click', () => {
                const city = document.getElementById('feature-54-city-select').value;
                if (city) {
                    window.store.dispatch('analyzeCityTrends', { city });
                }
            });
        }

        updateResults(data) {
            const resultsContainer = document.getElementById('feature-54-results');
            if (!resultsContainer) return;

            if (data.error) {
                resultsContainer.innerHTML = `<p class="error">${data.error}</p>`;
                return;
            }

            resultsContainer.innerHTML = `
                <div class="trend-chart">
                    <canvas id="trendChart"></canvas>
                </div>
                <div class="trend-summary">
                    <p>الاتجاه: ${data.trend === 'up' ? 'ارتفاع' : 'انخفاض'}</p>
                    <p>الثقة: ${data.confidence}%</p>
                </div>
            `;

            // رسم الرسم البياني
            this.renderChart(data);
        }

        renderChart(data) {
            const ctx = document.getElementById('trendChart').getContext('2d');
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.labels,
                    datasets: [{
                        label: 'سعر المنتج',
                        data: data.values,
                        borderColor: data.trend === 'up' ? 'rgb(255, 99, 132)' : 'rgb(54, 162, 235)',
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true
                }
            });
        }
    }

    window.feature54UI = new Feature54UI();
})();