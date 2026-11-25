(function() {
    'use strict';

    // دالة لمعالجة الأخطاء
    function handleError(error) {
        console.error('خطأ:', error);
        const errorLog = JSON.parse(localStorage.getItem('errorLog')) || [];
        errorLog.push({
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        localStorage.setItem('errorLog', JSON.stringify(errorLog));
    }

    // دالة للتحقق من وجود العنصر قبل استخدام .textContent
    function safeSetTextContent(elementId, text) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = text;
        } else {
            console.warn(`العنصر ${elementId} غير موجود`);
        }
    }

    // تصدير الدوال
    window.module2 = {
        handleError,
        safeSetTextContent
    };
})();