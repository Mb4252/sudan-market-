(function() {
  'use strict';

  // Plugin Registry System
  window.pluginRegistry = {
    plugins: {},
    currentPlugin: null,

    register: function(name, plugin) {
      if (this.plugins[name]) {
        console.warn(`Plugin '${name}