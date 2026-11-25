(function() {
    'use strict';

    async function renderRadarChart() {
        try {
            const radarData = await window.api.fetchRadarData();
            const radarChart = document.getElementById('radarChart');
            radarChart.innerHTML = '';

            // إنشاء رسم بياني نصي مبسط
            const chart = document.createElement('div');
            chart.className = 'radar-chart';

            // إضافة عناوين المحاور
            const axes = ['الخرطوم', 'أم درمان', 'بورتسودان', 'كردفان', 'دارفور'];
            axes.forEach(axis => {
                const axisElement = document.createElement('div');
                axisElement.className = 'radar-axis';
                axisElement.textContent = axis;
                chart.appendChild(axisElement);
            });

            // إضافة نقاط البيانات
            radarData.forEach((point, index) => {
                const pointElement = document.createElement('div');
                pointElement.className = 'radar-point';
                pointElement.style.left = `${(index + 1) * 20}%`;
                pointElement.style.bottom = `${point.price * 0.5}%`;
                pointElement.textContent = point.price;
                chart.appendChild(pointElement);
            });

            radarChart.appendChild(chart);
        } catch (error) {
            console.error('خطأ في عرض الرسم البياني:', error);
        }
    }

    // استدعاء الدالة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', renderRadarChart);

    window.renderRadarChart = renderRadarChart;
})();