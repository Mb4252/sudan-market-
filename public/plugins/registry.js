(function() {
    'use strict';

    // مصفوفة لتخزين السجلات
    const registry = [];

    // دالة لتسجيل الوحدات
    function register(moduleName, module) {
        if (!moduleName || !module) {
            throw new Error('اسم الوحدة ووحدة غير صالحين');
        }
        registry.push({ moduleName, module });
        console.log(`تم تسجيل الوحدة: ${moduleName}`);
    }

    // دالة لاسترجاع الوحدة
    function getModule(moduleName) {
        const found = registry.find(item => item.moduleName === moduleName);
        if (!found) {
            throw new Error(`الوحدة ${moduleName} غير مسجلة`);
        }
        return found.module;
    }

    // دالة للحصول على جميع الوحدات المسجلة
    function getAllModules() {
        return registry.map(item => item.module);
    }

    // تصدير الوظائف المطلوبة
    window.registry = {
        register,
        getModule,
        getAllModules
    };
})();