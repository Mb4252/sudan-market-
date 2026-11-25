// public/modules/feature-36-ui.js
(function() {
    'use strict';

    // دالة لتحديث واجهة المستخدم عند وجود خطأ
    function updateErrorUI(error) {
        const errorElement = document.getElementById('error-message');
        if (errorElement) {
            errorElement.textContent = error.message;
            errorElement.style.display = 'block';
        }
    }

    // دالة لتحديث واجهة المستخدم عند تحديث البيانات
    function updateUI(data) {
        const statusElement = document.getElementById('status');
        if (statusElement) {
            statusElement.textContent = data.status;
        }

        // إضافة منطق تحديث واجهة المستخدم الأخرى هنا
    }

    // تصدير الوظائف العامة
    window.feature36UI = {
        updateErrorUI,
        updateUI
    };
})();