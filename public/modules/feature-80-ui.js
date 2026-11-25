document.addEventListener('DOMContentLoaded', function() {
    const container = document.createElement('div');
    container.id = 'feature-80-container';
    container.innerHTML = '<button id="analyzeBtn">تحليل اتجاهات المدينة</button><div id="results"></div>';
    document.body.appendChild(container);

    document.getElementById('analyzeBtn').addEventListener('click', function() {
        const city = prompt('أدخل اسم المدينة:');
        if (city) {
            window.feature80Logic.analyzeCityTrend(city);
        }
    });

    window.feature80UI = {
        updateResults: function(results) {
            document.getElementById('results').innerHTML = `<p>المدينة: ${results.city}</p><p>الاتجاه: ${results.trend}</p><p>الثقة: ${results.confidence}%</p>`;
        }
    };
});