(function() {
    'use strict';

    function initFeature49UI() {
        const feature49Container = document.createElement('div');
        feature49Container.id = 'feature-49-container';
        feature49Container.innerHTML = `
            <div class="feature-49-controls">
                <button id="feature-49-btn">تحليل الاتجاهات</button>
                <div id="feature-49-results"></div>
            </div>
        `;
        document.body.appendChild(feature49Container);

        document.getElementById('feature-49-btn').addEventListener('click', handleFeature49Analysis);
    }

    function handleFeature49Analysis() {
        const city = prompt('أدخل اسم المدينة للتحليل:');
        if (!city) return;

        window.store.dispatch({
            type: 'REQUEST_FEATURE_49_ANALYSIS',
            payload: { city }
        });
    }

    function updateFeature49Results(data) {
        const resultsContainer = document.getElementById('feature-49-results');
        if (!resultsContainer) return;

        resultsContainer.innerHTML = `
            <h3>تحليل اتجاهات ${data.city}</h3>
            <p>الانحدار: ${data.trend.toFixed(2)}</p>
            <p>التنبؤ: ${data.forecast.toFixed(2)}</p>
            <p>الثقة: ${data.confidence.toFixed(2)}%</p>
        `;
    }

    window.feature49UI = {
        init: initFeature49UI,
        updateResults: updateFeature49Results
    };
})();