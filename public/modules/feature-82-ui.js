// FILE: public/modules/feature-82-ui.js
(function() {
    'use strict';

    class Feature82UI {
        constructor() {
            this.container = document.createElement('div');
            this.container.id = 'feature-82-container';
            this.container.className = 'feature-container';
            this.initUI();
        }

        initUI() {
            this.container.innerHTML = `
                <div class="feature-header">
                    <h3>تحليل الاتجاهات</h3>
                    <button id="analyze-trends-btn">تحليل</button>
                </div>
                <div id="trends-chart-container" class="chart-container"></div>
                <div id="trends-result" class="result-container"></div>
            `;

            document.body.appendChild(this.container);

            document.getElementById('analyze-trends-btn').addEventListener('click', () => {
                this.triggerAnalysis();
            });
        }

        triggerAnalysis() {
            const city = prompt('أدخل اسم المدينة:');
            if (city) {
                window.feature82Logic.analyzeTrends(city);
            }
        }

        updateChart(data) {
            const container = document.getElementById('trends-chart-container');
            container.innerHTML = '';

            // إنشاء الرسم البياني النصي
            const chart = document.createElement('div');
            chart.className = 'text-chart';

            const header = document.createElement('div');
            header.className = 'chart-header';
            header.textContent = `اتجاهات الأسعار في ${data.city}`;
            chart.appendChild(header);

            const body = document.createElement('div');
            body.className = 'chart-body';

            data.trends.forEach(trend => {
                const bar = document.createElement('div');
                bar.className = 'chart-bar';

                const label = document.createElement('span');
                label.className = 'chart-label';
                label.textContent = trend.label;

                const value = document.createElement('span');
                value.className = 'chart-value';
                value.textContent = trend.value;

                bar.appendChild(label);
                bar.appendChild(value);
                body.appendChild(bar);
            });

            chart.appendChild(body);
            container.appendChild(chart);
        }

        updateResult(result) {
            const container = document.getElementById('trends-result');
            container.innerHTML = `
                <h4>النتيجة:</h4>
                <p>${result}</p>
            `;
        }
    }

    window.feature82UI = new Feature82UI();
})();