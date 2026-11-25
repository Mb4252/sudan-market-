(function() {
    'use strict';

    function initFeature47UI() {
        const feature47Container = document.createElement('div');
        feature47Container.id = 'feature-47-container';
        feature47Container.innerHTML = `
            <div class="feature-47-controls">
                <button id="feature-47-btn">تحليل الاتجاهات</button>
                <div id="feature-47-results"></div>
            </div>
        `;

        document.body.appendChild(feature47Container);

        document.getElementById('feature-47-btn').addEventListener('click', async () => {
            try {
                const city = prompt('أدخل اسم المدينة:');
                if (!city) return;

                const analysis = await window.feature47Logic.analyzeCityTrends(city);
                displayAnalysisResults(analysis);
            } catch (error) {
                handleError(error);
            }
        });
    }

    function displayAnalysisResults(analysis) {
        const resultsContainer = document.getElementById('feature-47-results');
        if (!resultsContainer) return;

        resultsContainer.innerHTML = `
            <h3>تحليل اتجاهات ${analysis.city}</h3>
            <p>الترند: ${analysis.trend}</p>
            <p>الثقة: ${analysis.confidence.toFixed(2)}%</p>
            <div class="chart">${analysis.chart}</div>
        `;
    }

    window.feature47UI = {
        init: initFeature47UI
    };
})();