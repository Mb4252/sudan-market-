(function() {
    'use strict';

    window.PluginRegistry = {
        plugins: new Map(),
        
        register: function(name, plugin) {
            if (!name || !plugin) {
                console.error('Plugin registration failed: name and plugin are required');
                return false;
            }
            
            if (this.plugins.has(name)) {
                console.warn(`Plugin ${name} already exists and will be overwritten`);
            }
            
            this.plugins.set(name, plugin);
            console.log(`Plugin ${name} registered successfully`);
            return true;
        },
        
        unregister: function(name) {
            if (!this.plugins.has(name)) {
                console.warn(`Plugin ${name} not found`);
                return false;
            }
            
            this.plugins.delete(name);
            console.log(`Plugin ${name} unregistered successfully`);
            return true;
        },
        
        get: function(name) {
            return this.plugins.get(name);
        },
        
        getAll: function() {
            return Array.from(this.plugins.values());
        },
        
        execute: function(name, ...args) {
            const plugin = this.get(name);
            if (!plugin) {
                console.error(`Plugin ${name} not found`);
                return null;
            }
            
            if (typeof plugin.execute !== 'function') {
                console.error(`Plugin ${name} has no execute method`);
                return null;
            }
            
            try {
                return plugin.execute(...args);
            } catch (error) {
                console.error(`Error executing plugin ${name}:`, error);
                return null;
            }
        }
    };

    // Example Plugin
    window.PluginRegistry.register('example', {
        execute: function() {
            console.log('Example plugin executed');
            return 'Example result';
        }
    });

    console.log('PluginRegistry initialized');
})();