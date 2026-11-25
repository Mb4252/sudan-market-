(function() {
    'use strict';

    class Feature65UI {
        constructor() {
            this.container = document.createElement('div');
            this.container.id = 'feature-65-container';
            this.container.className = 'feature-container';
        }

        init() {
            this.setupDOM();
            this.bindEvents();
        }

        setupDOM() {
            // إنشاء عناصر واجهة المستخدم
            this.container.innerHTML = `
                <div class="feature-header">
                    <h2>تحليل السوق المتقدم</h2>
                </div>
                <div class="feature-controls">
                    <button id="analyze-btn" class="btn">بدء التحليل</button>
                    <select id="analysis-type">
                        <option value="price-trend">اتجاهات الأسعار</option>
                        <option value="market-share">حصة السوق</option>
                    </select>
                </div>
                <div id="analysis-results" class="results-container"></div>
            `;

            document.body.appendChild(this.container);
        }

        bindEvents() {
            const analyzeBtn = document.getElementById('analyze-btn');
            const analysisType = document.getElementById('analysis-type');

            analyzeBtn.addEventListener('click', () => {
                const type = analysisType.value;
                this.triggerAnalysis(type);
            });
        }

        triggerAnalysis(type) {
            // إرسال الحدث إلى المنطق
            const event = new CustomEvent('feature65:analyze', {
                detail: { type }
            });
            document.dispatchEvent(event);
        }

        updateResults(results) {
            const resultsContainer = document.getElementById('analysis-results');
            resultsContainer.innerHTML = '';

            if (results.error) {
                resultsContainer.innerHTML = `<div class="error">${results.error}</div>`;
                return;
            }

            // عرض النتائج حسب نوع التحليل
            if (results.type === 'price-trend') {
                this.renderPriceTrend(results.data);
            } else if (results.type === 'market-share') {
                this.renderMarketShare(results.data);
            }
        }

        renderPriceTrend(data) {
            const resultsContainer = document.getElementById('analysis-results');
            resultsContainer.innerHTML = `
                <h3>اتجاهات الأسعار</h3>
                <div class="chart-container">
                    <canvas id="price-trend-chart"></canvas>
                </div>
                <div class="analysis-summary">
                    <p>اتجاه السعر: ${data.trend}</p>
                    <p>تغير السعر: ${data.change}%</p>
                </div>
            `;

            // إنشاء الرسم البياني
            const ctx = document.getElementById('price-trend-chart').getContext('2d');
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.labels,
                    datasets: [{
                        label: 'سعر المنتج',
                        data: data.values,
                        borderColor: 'rgb(75, 192, 192)',
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: {
                            beginAtZero: false
                        }
                    }
                }
            });
        }

        renderMarketShare(data) {
            const resultsContainer = document.getElementById('analysis-results');
            resultsContainer.innerHTML = `
                <h3>حصة السوق</h3>
                <div class="chart-container">
                    <canvas id="market-share-chart"></canvas>
                </div>
                <div class="analysis-summary">
                    <p>حصة السوق: ${data.share}%</p>
                    <p>مركز السوق: ${data.position}</p>
                </div>
            `;

            // إنشاء الرسم البياني
            const ctx = document.getElementById('market-share-chart').getContext('2d');
            new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: data.labels,
                    datasets: [{
                        data: data.values,
                        backgroundColor: [
                            'rgb(255, 99, 132)',
                            'rgb(54, 162, 235)',
                            'rgb(255, 206, 86)',
                            'rgb(75, 192, 192)',
                            'rgb(153, 102, 255)'
                        ]
                    }]
                },
                options: {
                    responsive: true
                }
            });
        }
    }

    // تهيئة الواجهة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', () => {
        const feature65UI = new Feature65UI();
        feature65UI.init();

        // استماع لنتائج التحليل
        document.addEventListener('feature65:results', (e) => {
            feature65UI.updateResults(e.detail);
        });
    });

    // تصدير الواجهة إلى النافذة العالمية
    window.feature65UI = Feature65UI;
})();