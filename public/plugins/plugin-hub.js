(function() {
    'use strict';

    class PluginHub {
        constructor() {
            this.plugins = new Map();
            this.loadedPlugins = [];
            this.initDOM();
        }

        initDOM() {
            const pluginContainer = document.createElement('div');
            pluginContainer.id = 'plugin-container';
            pluginContainer.className = 'plugin-container';
            document.body.appendChild(pluginContainer);

            const pluginList = document.createElement('div');
            pluginList.id = 'plugin-list';
            pluginList.className = 'plugin-list';
            pluginContainer.appendChild(pluginList);

            const pluginStatus = document.createElement('div');
            pluginStatus.id = 'plugin-status';
            pluginStatus.className = 'plugin-status';
            pluginContainer.appendChild(pluginStatus);
        }

        registerPlugin(name, plugin) {
            if (!this.plugins.has(name)) {
                this.plugins.set(name, plugin);
                this.loadedPlugins.push(name);
                this.updatePluginList();
                return true;
            }
            return false;
        }

        unregisterPlugin(name) {
            if (this.plugins.has(name)) {
                this.plugins.delete(name);
                this.loadedPlugins = this.loadedPlugins.filter(p => p !== name);
                this.updatePluginList();
                return true;
            }
            return false;
        }

        updatePluginList() {
            const pluginList = document.getElementById('plugin-list');
            if (pluginList) {
                pluginList.innerHTML = '';
                this.loadedPlugins.forEach(pluginName => {
                    const pluginItem = document.createElement('div');
                    pluginItem.textContent = pluginName;
                    pluginList.appendChild(pluginItem);
                });
            }
        }
    }

    window.pluginHub = new PluginHub();
})();