(function() {
    'use strict';

    // دالة لمعالجة الأخطاء
    function handleError(error) {
        console.error('خطأ:', error);
        // تسجيل الخطأ في localStorage
        const errors = JSON.parse(localStorage.getItem('errors')) || [];
        errors.push({
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        localStorage.setItem('errors', JSON.stringify(errors));
    }

    // دالة للتحقق من وجود العنصر قبل الإسناد
    function safeSetTextContent(elementId, text) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = text;
        } else {
            handleError(new Error(`العنصر مع معرف ${elementId} غير موجود`));
        }
    }

    // تصدير الدوال
    window.extensions = window.extensions || {};
    window.extensions.module3 = {
        handleError,
        safeSetTextContent
    };
})();