(function() {
    'use strict';

    // تسجيل الأخطاء
    function registerErrorHandler() {
        window.onerror = function(message, source, lineno, colno, error) {
            window.extensions.module3.handleError(error);
        };

        window.addEventListener('unhandledrejection', function(event) {
            window.extensions.module3.handleError(event.reason);
        });
    }

    // دالة لتحميل السكربتات
    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // تصدير الدوال
    window.plugins = window.plugins || {};
    window.plugins.registry = {
        registerErrorHandler,
        loadScript
    };
})();