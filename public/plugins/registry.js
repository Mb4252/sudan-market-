(function() {
    'use strict';

    // تسجيل الوحدات
    const modules = {
        module12: window.module12
    };

    // دالة للحصول على وحدة
    function getModule(moduleName) {
        if (modules[moduleName]) {
            return modules[moduleName];
        } else {
            console.warn(`الوحدة ${moduleName} غير مسجلة`);
            return null;
        }
    }

    // تصدير الدالة
    window.registry = {
        getModule
    };
})();