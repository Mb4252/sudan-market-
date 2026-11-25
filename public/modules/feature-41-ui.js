(function() {
    'use strict';

    class Feature41UI {
        constructor() {
            this.initUI();
        }

        initUI() {
            const feature41Container = document.createElement('div');
            feature41Container.id = 'feature-41-container';
            feature41Container.innerHTML = `
                <div class="feature-41-header">
                    <h3>تحليل الاتجاهات</h3>
                </div>
                <div class="feature-41-content">
                    <div id="feature-41-chart"></div>
                    <div id="feature-41-trend-analysis"></div>
                </div>
            `;

            // تأكد من وجود العنصر قبل إضافة المحتوى
            const appContainer = document.getElementById('app-container');
            if (appContainer) {
                appContainer.appendChild(feature41Container);
            } else {
                console.error('Element with id "app-container" not found');
            }
        }

        updateTrendAnalysis(data) {
            const trendAnalysisElement = document.getElementById('feature-41-trend-analysis');
            if (trendAnalysisElement) {
                trendAnalysisElement.innerHTML = `
                    <h4>تحليل الاتجاهات</h4>
                    <p>المنطقة: ${data.city}</p>
                    <p>الاتجاه: ${data.trend}</p>
                    <p>الثقة: ${data.confidence}%</p>
                `;
            }
        }
    }

    window.feature41UI = new Feature41UI();
})();