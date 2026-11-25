// sdm-module-137.js
// وظيفة: تخزين وإسترجاع إعدادات المستخدم في localStorage

(function() {
    'use strict';

    // مفتاح التخزين
    const USER_SETTINGS_KEY = 'sdmUserSettings';

    // دالة لتخزين إعدادات المستخدم
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

    // دالة لاسترجاع إعدادات المستخدم
    function getUserSettings() {
        try {
            const settings = localStorage.getItem(USER_SETTINGS_KEY);
            return settings ? JSON.parse(settings) : {};
        } catch (error) {
            console.error('Error getting user settings:', error);
            return {};
        }
    }

    // ربط الدوال مع النافذة العالمية
    window.sdmSaveUserSettings = saveUserSettings;
    window.sdmGetUserSettings = getUserSettings;

    // تنفيذ عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            // استرجاع الإعدادات عند التحميل
            const settings = getUserSettings();

            // تطبيق الإعدادات على الواجهة
            if (settings.theme) {
                document.body.className = settings.theme;
                const themeSelector = document.getElementById('theme-selector');
                if (themeSelector) {
                    themeSelector.value = settings.theme;
                }
            }

            // إضافة مستمع لتغيير الوضع
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.addEventListener('change', function() {
                    const newTheme = this.value;
                    document.body.className = newTheme;
                    saveUserSettings({ theme: newTheme });
                });
            }
        } catch (error) {
            console.error('Error in DOMContentLoaded:', error);
        }
    });

    // دالة لتحديث الإعدادات عند تغييرها
    function updateSettings(key, value) {
        try {
            const settings = getUserSettings();
            settings[key] = value;
            saveUserSettings(settings);
        } catch (error) {
            console.error('Error updating settings:', error);
        }
    }

    // ربط الدالة مع النافذة العالمية
    window.sdmUpdateSettings = updateSettings;
})();
