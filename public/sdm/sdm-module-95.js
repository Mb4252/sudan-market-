// sdm-module-95.js
// وظيفة: تخزين وإسترجاع إعدادات المستخدم في localStorage

(function() {
    'use strict';

    // مفتاح التخزين
    const USER_SETTINGS_KEY = 'sdmUserSettings';

    // دالة لتخزين الإعدادات
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

    // دالة لاسترجاع الإعدادات
    function getUserSettings() {
        try {
            const data = localStorage.getItem(USER_SETTINGS_KEY);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('Error getting user settings:', error);
            return {};
        }
    }

    // دالة لتحديث عنصر DOM إذا كان موجوداً
    function updateElementIfExists(elementId, value) {
        const element = document.getElementById(elementId);
        if (element && typeof element.textContent !== 'undefined') {
            element.textContent = value;
        }
    }

    // تصدير الدوال
    window.sdmModule95 = {
        saveUserSettings,
        getUserSettings,
        updateElementIfExists
    };
})();