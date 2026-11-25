(function() {
    'use strict';

    // التحقق من وجود العنصر قبل إسناد .textContent
    function safeSetTextContent(selector, text) {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = text;
        } else {
            console.warn(`العنصر ${selector} غير موجود`);
        }
    }

    // معالجة الأخطاء بشكل عام
    function handleError(error) {
        console.error('خطأ:', error);
        safeSetTextContent('#status', `خطأ: ${error.message}`);
    }

    // تصدير الوظائف
    window.extensions = window.extensions || {};
    window.extensions.module5 = {
        safeSetTextContent,
        handleError
    };
})();