(function() {
    'use strict';

    // إضافة التحقق من وجود العنصر قبل الإسناد
    function safeSetTextContent(elementId, text) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = text;
        } else {
            console.warn(`Element with ID ${elementId} not found`);
        }
    }

    // مثال على استخدام الدالة
    function updateStatus(status) {
        safeSetTextContent('status', status);
    }

    // تصدير الوظائف المطلوبة
    window.feature86UI = {
        updateStatus,
        safeSetTextContent
    };
})();