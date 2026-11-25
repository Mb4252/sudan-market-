(function() {
    'use strict';

    const plugins = new Map();

    function registerPlugin(name, plugin) {
        if (!plugins.has(name)) {
            plugins.set(name, plugin);
            console.log(`Plugin ${name} registered successfully`);
        } else {
            console.warn(`Plugin ${name} is already registered`);
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