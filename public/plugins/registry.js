(function() {
    'use strict';

    const plugins = new Map();

    function registerPlugin(name, plugin) {
        if (typeof plugin.init === 'function') {
            plugins.set(name, plugin);
            plugin.init();
        } else {
            throw new Error(`Plugin ${name} must have an init function`);
        }
    }

    function getPlugin(name) {
        return plugins.get(name);
    }

    function getAllPlugins() {
        return Array.from(plugins.values());
    }

    window.pluginRegistry = {
        registerPlugin,
        getPlugin,
        getAllPlugins
    };
})();