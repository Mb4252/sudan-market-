(function() {
    'use strict';

    function initFeature37UI() {
        const feature37Container = document.createElement('div');
        feature37Container.id = 'feature-37-container';
        feature37Container.innerHTML = `
            <div class="feature-37-controls">
                <button id="feature-37-btn">تحليل الاتجاهات</button>
                <div id="feature-37-result" class="hidden"></div>
            </div>
        `;

        // تأكد من وجود العنصر قبل محاولة الإضافة
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.appendChild(feature37Container);

            document.getElementById('feature-37-btn').addEventListener('click', () => {
                const resultElement = document.getElementById('feature-37-result');
                if (resultElement) {
                    resultElement.classList.remove('hidden');
                    resultElement.textContent = 'جاري تحليل الاتجاهات...';

                    // استدعاء الوظيفة من logic
                    if (window.feature37Logic && typeof window.feature37Logic.analyzeTrends === 'function') {
                        window.feature37Logic.analyzeTrends()
                            .then(result => {
                                if (resultElement) {
                                    resultElement.textContent = `الاتجاه: ${result.trend} (ثقة: ${result.confidence.toFixed(2)}%)`;
                                }
                            })
                            .catch(error => {
                                if (resultElement) {
                                    resultElement.textContent = `خطأ: ${error.message}`;
                                }
                            });
                    } else {
                        if (resultElement) {
                            resultElement.textContent = 'الوظيفة غير متاحة';
                        }
                    }
                }
            });
        }
    }

    // تأكد من أن الواجهة جاهزة قبل التهيئة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFeature37UI);
    } else {
        initFeature37UI();
    }

    // تصدير الواجهة إلى النافذة العالمية
    window.feature37UI = {
        init: initFeature37UI
    };
})();