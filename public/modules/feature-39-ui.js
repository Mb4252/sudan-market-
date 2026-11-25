(function() {
    'use strict';

    function renderFeature39UI() {
        const container = document.createElement('div');
        container.id = 'feature-39-container';
        container.innerHTML = `
            <div class="feature-39-controls">
                <button id="feature-39-btn">تحليل السعر</button>
                <div id="feature-39-results"></div>
            </div>
        `;

        document.body.appendChild(container);

        document.getElementById('feature-39-btn').addEventListener('click', async () => {
            try {
                const results = await window.feature39Logic.analyzePrices();
                document.getElementById('feature-39-results').innerHTML = `
                    <h3>تحليل السعر</h3>
                    <p>السعر المتوسط: ${results.average}</p>
                    <p>الحد الأدنى: ${results.min}</p>
                    <p>الحد الأقصى: ${results.max}</p>
                `;
            } catch (error) {
                handleError(error);
            }
        });
    }

    window.feature39UI = {
        renderFeature39UI
    };
})();