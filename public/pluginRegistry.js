(() => {
  const registry = {
    plugins: {},
    register(name, plugin) {
      if (this.plugins[name]) {
        console.warn(`Plugin "${name}" already registered`);
        return;
      }
      this.plugins[name] = plugin;
      if (typeof plugin.init === "function") plugin.init();
    },
    unregister(name) {
      const p = this.plugins[name];
      if (!p) return;
      if (typeof p.destroy === "function") p.destroy();
      delete this.plugins[name];
    },
    get(name) {
      return this.plugins[name];
    }
  };
  // إتاحة السجل على مستوى النافذة لتسهيل الوصول من أي ملف
  window.pluginRegistry = registry;
})();