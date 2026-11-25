(function() {
    'use strict';

    const plugins = {};

    function register(name, plugin) {
        if (!plugins[name]) {
            plugins[name] = plugin;
            if (typeof plugin.init === 'function') {
                plugin.init();
            }
            console.log(`تم تسجيل الوحدة ${name}`);
        } else {
            console.warn(`الوحدة ${name} مسجلة مسبقاً`);
        }
    }

    function update(name, data) {
        if (plugins[name] && typeof plugins[name].update === 'function') {
            plugins[name].update(data);
        } else {
            console.warn(`الوحدة ${name} غير مسجلة أو لا تحتوي على دالة تحديث`);
        }
    }

    // تصدير الدوال العامة
    window.pluginRegistry = {
        register,
        update
    };
})();