// sdm-module-188.js
// وظيفة: تخزين وتحميل إعدادات المستخدم في localStorage

(function() {
    'use strict';

    const USER_SETTINGS_KEY = 'sdmUserSettings';

    // دالة لتحميل الإعدادات من localStorage
    function loadUserSettings() {
        try {
            const settings = localStorage.getItem(USER_SETTINGS_KEY);
            return settings ? JSON.parse(settings) : {};
        } catch (e) {
            console.error('Error loading user settings:', e);
            return {};
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

    // تهيئة الإعدادات الافتراضية
    function initDefaultSettings() {
        const currentSettings = loadUserSettings();
        if (Object.keys(currentSettings).length === 0) {
            const defaultSettings = {
                theme: 'light',
                notifications: true,
                language: 'ar'
            };
            saveUserSettings(defaultSettings);
        }
    }

    // تهيئة التوسعة
    function init() {
        initDefaultSettings();
        window.sdmUserSettings = {
            load: loadUserSettings,
            save: saveUserSettings
        };
    }

    // تنفيذ التهيئة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();