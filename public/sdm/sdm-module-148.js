// sdm-module-148.js
(function() {
    'use strict';

    // مفتاح تخزين الإعدادات في localStorage
    const SETTINGS_KEY = 'sdmUserSettings';

    // دالة لتحميل الإعدادات
    function loadSettings() {
        try {
            const settings = localStorage.getItem(SETTINGS_KEY);
            return settings ? JSON.parse(settings) : { theme: 'light' };
        } catch (e) {
            console.error('Error loading settings:', e);
            return { theme: 'light' };
        }
    }

    // دالة لحفظ الإعدادات
    function saveSettings(settings) {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
            return true;
        } catch (e) {
            console.error('Error saving settings:', e);
            return false;
        }
    }

    // دالة لتطبيق الإعدادات
    function applySettings(settings) {
        document.body.className = settings.theme;
        const themeSelector = document.getElementById('theme-selector');
        if (themeSelector) {
            themeSelector.value = settings.theme;
        }
    }

    // دالة لتحميل وتطبيق الإعدادات عند تحميل الصفحة
    function initSettings() {
        const settings = loadSettings();
        applySettings(settings);

        // إضافة مستمع لتغييرات في اختيار السمة
        const themeSelector = document.getElementById('theme-selector');
        if (themeSelector) {
            themeSelector.addEventListener('change', function() {
                const newSettings = { theme: this.value };
                saveSettings(newSettings);
                applySettings(newSettings);
            });
        }
    }

    // تهيئة الإعدادات عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSettings);
    } else {
        initSettings();
    }

    // تصدير الدوال العامة
    window.sdmSettings = {
        load: loadSettings,
        save: saveSettings,
        apply: applySettings
    };
})();