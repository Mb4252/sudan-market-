(function() {
    'use strict';

    const plugins = new Map();

    function registerPlugin(name, plugin) {
        if (!name || typeof name !== 'string') {
            throw new Error('اسم المكوّن الإضافي مطلوب ويجب أن يكون نصًا');
        }
        if (!plugin || typeof plugin !== 'object') {
            throw new Error('المكوّن الإضافي مطلوب ويجب أن يكون كائنًا');
        }
        plugins.set(name, plugin);
    }

    function getPlugin(name) {
        if (!plugins.has(name)) {
            throw new Error(`المكوّن الإضافي ${name} غير مسجل`);
        }
        return plugins.get(name);
    }

    // تصدير الوظائف
    window.plugins = {
        registerPlugin,
        getPlugin
    };
})();