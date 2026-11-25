(function() {
    'use strict';

    const plugins = new Map();

    function registerPlugin(name, plugin) {
        if (typeof plugin.init !== 'function') {
            throw new Error('Plugin must have an init function');
        }
        plugins.set(name, plugin);
    }

    function unregisterPlugin(name) {
        plugins.delete(name);
    }

    function getPlugin(name) {
        return plugins.get(name);
    }

    function getAllPlugins() {
        return Array.from(plugins.values());
    }

    function initAllPlugins() {
        plugins.forEach(plugin => plugin.init());
    }

    window.pluginRegistry = {
        registerPlugin,
        unregisterPlugin,
        getPlugin,
        getAllPlugins,
        initAllPlugins
    };
})();