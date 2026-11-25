// sdm-module-116.js
// وظيفة: حفظ وتحميل إعدادات المستخدم في localStorage

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
            const data = localStorage.getItem(USER_SETTINGS_KEY);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('Error loading user settings:', error);
            return {};
        }
    }

    // ربط الدوال مع النافذة العالمية
    window.sdmSaveUserSettings = saveUserSettings;
    window.sdmLoadUserSettings = loadUserSettings;

    // تهيئة الإعدادات الافتراضية عند أول تحميل
    if (!localStorage.getItem(USER_SETTINGS_KEY)) {
        saveUserSettings({
            theme: 'light',
            notifications: false
        });
    }
})();