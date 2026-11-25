(function() {
    'use strict';

    const plugins = new Map();

    function registerPlugin(name, plugin) {
        if (typeof plugin.init === 'function') {
            plugins.set(name, plugin);
            plugin.init();
        } else {
            console.error(`الملحق ${name} ليس له دالة 'init'`);
        }
    }

    function getPlugin(name) {
        return plugins.get(name);
    }

    function getAllPlugins() {
        return Array.from(plugins.values());
    }

    // تصدير الواجهة
    window.pluginRegistry = {
        registerPlugin,
        getPlugin,
        getAllPlugins
    };
})();