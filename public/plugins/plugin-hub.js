(function() {
    'use strict';

    // قائمة الإضافة
    const plugins = {
        forecast: window.forecastPrice,
        priceAnalyzer: window.analyzePrice,
        schemaGuard: window.validateSchema
    };

    // واجهة برمجة تطبيقات الإضافة
    const pluginHub = {
        // تحميل الإضافة
        loadPlugin: function(pluginName) {
            if (plugins[pluginName]) {
                console.log(`تم تحميل الإضافة: ${pluginName}`);
                return plugins[pluginName];
            }
            throw new Error(`الإضافة ${pluginName} غير موجودة`);
        },

        // تنشيط الإضافة
        activatePlugin: function(pluginName, ...args) {
            const plugin = this.loadPlugin(pluginName);
            return plugin(...args);
        },

        // قائمة الإضافة المتاحة
        getAvailablePlugins: function() {
            return Object.keys(plugins);
        }
    };

    // إضافة واجهة برمجة تطبيقات الإضافة إلى النافذة
    window.pluginHub = pluginHub;

    // تهيئة الإضافة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        const pluginStatusElement = document.getElementById('pluginStatus');
        if (pluginStatusElement) {
            pluginStatusElement.textContent = `تم تحميل ${pluginHub.getAvailablePlugins().length} إضافات`;
        }
    });
})();