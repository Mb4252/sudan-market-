(function() {
    'use strict';

    const plugins = new Map();

    function registerPlugin(name, plugin) {
        if (typeof plugin.init === 'function') {
            plugins.set(name, plugin);
            plugin.init();
        } else {
            console.warn(`الملحق ${name} ليس له دالة 'init'`);
        }
    }

    function getPlugin(name) {
        return plugins.get(name);
    }

    function unregisterPlugin(name) {
        const plugin = plugins.get(name);
        if (plugin && typeof plugin.destroy === 'function') {
            plugin.destroy();
        }
        plugins.delete(name);
    }

    // تصدير الوظائف
    window.pluginRegistry = {
        registerPlugin,
        getPlugin,
        unregisterPlugin
    };
})();