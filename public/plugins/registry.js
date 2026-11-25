(function() {
    'use strict';

    // نظام تسجيل الوحدات
    const pluginRegistry = {
        plugins: new Map(),

        register(name, plugin) {
            if (typeof plugin.init === 'function') {
                this.plugins.set(name, plugin);
                console.log(`تم تسجيل الوحدة ${name}`);
            } else {
                console.error(`الوحدة ${name} غير صالحة: يجب أن تحتوي على دالة init`);
            }
        },

        initAll() {
            this.plugins.forEach((plugin, name) => {
                try {
                    plugin.init();
                    console.log(`تم تهيئة الوحدة ${name}`);
                } catch (error) {
                    console.error(`خطأ في تهيئة الوحدة ${name}:`, error);
                }
            });
        }
    };

    // تصدير النظام
    window.pluginRegistry = pluginRegistry;
})();