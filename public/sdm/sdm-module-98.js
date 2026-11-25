// public/sdm/sdm-module-98.js
(function() {
    'use strict';

    // مفتاح التخزين
    const USER_SETTINGS_KEY = 'sdmUserSettings';

    // دالة لتخزين إعدادات المستخدم
    function saveUserSettings(settings) {
        try {
            if (!settings || typeof settings !== 'object') {
                console.error('Invalid settings object');
                return false;
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
            const data = localStorage.getItem(USER_SETTINGS_KEY);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('Error getting user settings:', error);
            return {};
        }
    }

    // ربط الدوال مع النافذة العالمية
    window.sdmSaveUserSettings = saveUserSettings;
    window.sdmGetUserSettings = getUserSettings;
})();