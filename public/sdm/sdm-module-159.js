// sdm-module-159.js
// وظيفة: تخزين وتحميل إعدادات المستخدم في localStorage

(function() {
    'use strict';

    // مفتاح تخزين localStorage
    const USER_SETTINGS_KEY = 'sdmUserSettings';

    // دالة لتحميل الإعدادات من localStorage
    function loadUserSettings() {
        try {
            const settings = localStorage.getItem(USER_SETTINGS_KEY);
            return settings ? JSON.parse(settings) : { theme: 'light' };
        } catch (e) {
            console.error('Error loading user settings:', e);
            return { theme: 'light' };
        }
    }

    // دالة لحفظ الإعدادات في localStorage
    function saveUserSettings(settings) {
        try {
            localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(settings));
            return true;
        } catch (e) {
            console.error('Error saving user settings:', e);
            return false;
        }
    }

    // دالة لتطبيق الإعدادات على الواجهة
    function applyUserSettings() {
        const settings = loadUserSettings();
        document.body.className = settings.theme;
        const themeSelector = document.getElementById('theme-selector');
        if (themeSelector) {
            themeSelector.value = settings.theme;
        }
    }

    // دالة لتحديث الإعدادات عند تغييرها
    function updateUserSettings() {
        const themeSelector = document.getElementById('theme-selector');
        if (themeSelector) {
            themeSelector.addEventListener('change', function() {
                const newSettings = { theme: this.value };
                saveUserSettings(newSettings);
                applyUserSettings();
            });
        }
    }

    // تنفيذ عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        applyUserSettings();
        updateUserSettings();
    });

    // تصدير الدوال للوصول العام
    window.sdmUserSettings = {
        load: loadUserSettings,
        save: saveUserSettings,
        apply: applyUserSettings
    };
})();