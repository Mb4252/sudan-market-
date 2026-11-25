(function() {
    'use strict';

    class RadarVisualizer {
        render(data) {
            const radarElement = document.getElementById('radar');
            if (!radarElement) return;

            radarElement.innerHTML = '';

            // إنشاء رادار الأسعار
            const radar = document.createElement('div');
            radar.className = 'radar';

            data.forEach(item => {
                const itemElement = document.createElement('div');
                itemElement.className = 'radar-item';
                itemElement.textContent = `${item.product}: ${item.price} جنيه`;
                radar.appendChild(itemElement);
            });

            radarElement.appendChild(radar);
        }
    }

    window.plugins = window.plugins || {};
    window.plugins.RadarVisualizer = RadarVisualizer;
})();