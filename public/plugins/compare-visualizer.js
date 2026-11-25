(function() {
    'use strict';

    class CompareVisualizer {
        render(data) {
            const compareElement = document.getElementById('compare');
            if (!compareElement) return;

            compareElement.innerHTML = '';

            // إنشاء مقارنة الأسعار
            const compare = document.createElement('div');
            compare.className = 'compare';

            data.forEach(item => {
                const itemElement = document.createElement('div');
                itemElement.className = 'compare-item';
                itemElement.textContent = `${item.product}: ${item.price} جنيه (${item.seller})`;
                compare.appendChild(itemElement);
            });

            compareElement.appendChild(compare);
        }
    }

    window.plugins = window.plugins || {};
    window.plugins.CompareVisualizer = CompareVisualizer;
})()