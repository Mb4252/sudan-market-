(function() {
    'use strict';

    // معالجة الأخطاء في جميع الملفات
    function handleError(error) {
        console.error('خطأ:', error);
        const errorLog = JSON.parse(localStorage.getItem('errorLog') || '[]');
        errorLog.push({
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        localStorage.setItem('errorLog', JSON.stringify(errorLog));
    }

    // معالجة الأخطاء غير الملتقطة
    window.onerror = function(message, source, lineno, colno, error) {
        handleError(error);
    };

    // معالجة الرفضات غير الملتقطة
    window.addEventListener('unhandledrejection', function(event) {
        handleError(event.reason);
    });

    // تصدير الدالة لمعالجة الأخطاء
    window.handleError = handleError;
})();