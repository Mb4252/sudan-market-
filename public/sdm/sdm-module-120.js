// sdm-module-120.js
// وظيفة: تخزين وإسترجاع إعدادات المستخدم في localStorage

(function() {
    'use strict';

    // مفتاح التخزين
    const USER_SETTINGS_KEY = 'sdmUserSettings';

    // دالة لحفظ الإعدادات
    function saveUserSettings(settings) {
        try {
            localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(settings));
            return true;
        } catch (e) {
            console.error('Error saving user settings:', e);
            return false;
        }
    }

    // دالة لاسترجاع الإعدادات
    function getUserSettings() {
        try {
            const settings = localStorage.getItem(USER_SETTINGS_KEY);
            return settings ? JSON.parse(settings) : null;
        } catch (e) {
            console.error('Error getting user settings:', e);
            return null;
        }
    }

    // ربط الدوال مع النافذة العالمية
    window.sdmSaveUserSettings = saveUserSettings;
    window.sdmGetUserSettings = getUserSettings;
})();
