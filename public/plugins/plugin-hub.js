(function() {
    'use strict';

    class PluginHub {
        constructor() {
            this.plugins = new Map();
            this.loadedPlugins = new Set();
        }

        register(name, plugin) {
            if (this.plugins.has(name)) {
                console.warn(`Plugin ${name} already registered`);
                return;
            }
            this.plugins.set(name, plugin);
        }

        load(name) {
            if (!this.plugins.has(name)) {
                console.error(`Plugin ${name} not found`);
                return;
            }

            if (this.loadedPlugins.has(name)) {
                console.warn(`Plugin ${name} already loaded`);
                return;
            }

            const plugin = this.plugins.get(name);
            if (typeof plugin.init === 'function') {
                plugin.init();
                this.loadedPlugins.add(name);
                console.log(`Plugin ${name} loaded successfully`);
            } else {
                console.error(`Plugin ${name} has no init function`);
            }
        }

        unload(name) {
            if (!this.loadedPlugins.has(name)) {
                console.warn(`Plugin ${name} not loaded`);
                return;
            }

            const plugin = this.plugins.get(name);
            if (typeof plugin.destroy === 'function') {
                plugin.destroy();
                this.loadedPlugins.delete(name);
                console.log(`Plugin ${name} unloaded successfully`);
            } else {
                console.warn(`Plugin ${name} has no destroy function`);
            }
        }
    }

    window.pluginHub = new PluginHub();
})();