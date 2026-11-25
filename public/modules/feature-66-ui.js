(function() {
    'use strict';

    function initializeUI() {
        // تهيئة واجهة المستخدم الخاصة بميزة التوسع #66
        const feature66Container = document.createElement('div');
        feature66Container.id = 'feature-66-container';
        feature66Container.innerHTML = `
            <div class="feature-66-controls">
                <button id="feature-66-refresh" class="btn">تحديث البيانات</button>
                <div id="feature-66-status" class="status-indicator"></div>
            </div>
            <div id="feature-66-content" class="feature-content"></div>
        `;

        // إضافة إلى واجهة المستخدم الرئيسية
        const mainContainer = document.getElementById('main-container');
        if (mainContainer) {
            mainContainer.appendChild(feature66Container);
        }

        // تهيئة الأحداث
        document.getElementById('feature-66-refresh')?.addEventListener('click', refreshFeature66Data);
    }

    function refreshFeature66Data() {
        const statusElement = document.getElementById('feature-66-status');
        if (statusElement) {
            statusElement.textContent = 'جاري تحديث البيانات...';
            statusElement.className = 'status-indicator loading';
        }

        // استدعاء منطق الميزة
        window.feature66Logic.refreshData()
            .then(() => {
                if (statusElement) {
                    statusElement.textContent = 'تم التحديث بنجاح';
                    statusElement.className = 'status-indicator success';
                }
            })
            .catch(error => {
                if (statusElement) {
                    statusElement.textContent = 'خطأ في التحديث';
                    statusElement.className = 'status-indicator error';
                }
                console.error('خطأ في تحديث ميزة التوسع #66:', error);
            });
    }

    // تصدير الواجهة
    window.feature66UI = {
        initializeUI
    };
})();