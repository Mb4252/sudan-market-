(function() {
    'use strict';

    const plugins = new Map();

    function registerPlugin(name, plugin) {
        if (typeof plugin.init !== 'function') {
            console.error('البرنامج المساعد يجب أن يحتوي على دالة init');
            return;
        }
        plugins.set(name, plugin);
        plugin.init();
    }

    function getPlugin(name) {
        return plugins.get(name);
    }

    function initAllPlugins() {
        plugins.forEach(plugin => {
            if (typeof plugin.init === 'function') {
                plugin.init();
            }
        });
    }

    window.pluginRegistry = {
        registerPlugin,
        getPlugin,
        initAllPlugins
    };
})();