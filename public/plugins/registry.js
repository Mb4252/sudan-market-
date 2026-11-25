(function() {
    'use strict';

    // سجل التوسعات
    const extensions = new Map();

    // دالة لتسجيل توسعة جديدة
    function registerExtension(name, extension) {
        if (!name || typeof extension !== 'object') {
            throw new Error('اسم التوسعة أو التوسعة غير صالح');
        }
        extensions.set(name, extension);
        console.log(`تم تسجيل التوسعة: ${name}`);
    }

    // دالة للحصول على توسعة
    function getExtension(name) {
        return extensions.get(name);
    }

    // دالة للحصول على جميع التوسعات
    function getAllExtensions() {
        return Array.from(extensions.values());
    }

    // تصدير الوظائف
    window.pluginRegistry = {
        registerExtension,
        getExtension,
        getAllExtensions
    };
})();