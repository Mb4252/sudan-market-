// sdm-module-141.js
// وظيفة: حفظ إعدادات المستخدم في localStorage وتحميلها عند تحميل الصفحة

(function() {
    'use strict';

    // مفتاح التخزين
    const USER_SETTINGS_KEY = 'sdmUserSettings';

    // دالة لحفظ الإعدادات
    function saveUserSettings(settings) {
        try {
            if (!settings || typeof settings !== 'object') {
                throw new Error('Invalid settings object');
            }
            localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(settings));
            return true;
        } catch (error) {
            console.error('Error saving user settings:', error);
            return false;
        }
    }

    // دالة لتحميل الإعدادات
    function loadUserSettings() {
        try {
            const settings = localStorage.getItem(USER_SETTINGS_KEY);
            return settings ? JSON.parse(settings) : {};
        } catch (error) {
            console.error('Error loading user settings:', error);
            return {};
        }
    }

    // دالة لتحديث واجهة المستخدم بالإعدادات المحملة
    function updateUIWithSettings(settings) {
        const themeSelector = document.getElementById('theme-selector');
        if (themeSelector && settings.theme) {
            themeSelector.value = settings.theme;
            document.body.className = settings.theme;
        }
    }

    // دالة لتحميل الإعدادات عند تحميل الصفحة
    function initUserSettings() {
        const settings = loadUserSettings();
        updateUIWithSettings(settings);

        // إضافة مستمع حدث لتغيير الوضع
        const themeSelector = document.getElementById('theme-selector');
        if (themeSelector) {
            themeSelector.addEventListener('change', function() {
                const newSettings = { theme: this.value };
                saveUserSettings(newSettings);
                updateUIWithSettings(newSettings);
            });
        }
    }

    // تنفيذ عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUserSettings);
    } else {
        initUserSettings();
    }

    // تصدير الدوال العامة
    window.sdmUserSettings = {
        save: saveUserSettings,
        load: loadUserSettings
    };
})();