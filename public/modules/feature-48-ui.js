(function() {
    'use strict';

    class Feature48UI {
        constructor() {
            this.initUI();
        }

        initUI() {
            const container = document.createElement('div');
            container.id = 'feature-48-container';
            container.innerHTML = `
                <div class="feature-48-controls">
                    <button id="feature-48-btn">تحليل الاتجاهات</button>
                    <div id="feature-48-result"></div>
                </div>
            `;
            document.body.appendChild(container);

            document.getElementById('feature-48-btn').addEventListener('click', () => {
                this.handleAnalysisRequest();
            });
        }

        handleAnalysisRequest() {
            const city = prompt('أدخل اسم المدينة للتحليل:');
            if (city) {
                window.feature48Logic.analyzeCityTrends(city)
                    .then(result => {
                        this.displayResult(result);
                    })
                    .catch(error => {
                        window.handleError(error);
                    });
            }
        }

        displayResult(result) {
            const resultElement = document.getElementById('feature-48-result');
            if (resultElement) {
                resultElement.innerHTML = `
                    <h3>تحليل اتجاهات ${result.city}</h3>
                    <p>الاتجاه: ${result.trend}</p>
                    <p>الثقة: ${result.confidence}%</p>
                    <p>آخر 5 منشورات:</p>
                    <ul>
                        ${result.lastPosts.map(post => `
                            <li>${post.price} SDG - ${new Date(post.timestamp).toLocaleDateString()}</li>
                        `).join('')}
                    </ul>
                `;
            }
        }
    }

    window.feature48UI = new Feature48UI();
})();