(function() {
    'use strict';

    function initializeFeature51UI() {
        // إنشاء واجهة المستخدم الخاصة بميزة #51
        const feature51Container = document.createElement('div');
        feature51Container.id = 'feature-51-container';
        feature51Container.innerHTML = `
            <div class="feature-51-controls">
                <button id="feature-51-btn">تحليل الاتجاهات</button>
                <div id="feature-51-results"></div>
            </div>
        `;

        // إضافة إلى DOM
        const mainContainer = document.getElementById('main-container');
        if (mainContainer) {
            mainContainer.appendChild(feature51Container);
        }

        // ربط الأحداث
        document.getElementById('feature-51-btn').addEventListener('click', handleFeature51Action);
    }

    function handleFeature51Action() {
        // منطق التعامل مع الميزة
        const resultsContainer = document.getElementById('feature-51-results');
        if (resultsContainer) {
            resultsContainer.textContent = 'جاري تحليل الاتجاهات...';
            // استدعاء الوظيفة من module-51-logic.js
            if (window.feature51Logic && typeof window.feature51Logic.analyzeTrends === 'function') {
                window.feature51Logic.analyzeTrends()
                    .then(results => {
                        resultsContainer.textContent = results;
                    })
                    .catch(error => {
                        resultsContainer.textContent = 'خطأ في التحليل: ' + error.message;
                    });
            } else {
                resultsContainer.textContent = 'الوظيفة analyzeTrends غير متاحة';
            }
        }
    }

    // تصدير الوظائف
    window.feature51UI = {
        initializeFeature51UI
    };
})();