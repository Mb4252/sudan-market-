// sdm-module-108.js
// وظيفة: تخزين وتحميل إعدادات المستخدم في localStorage

(function() {
    'use strict';

    // مفتاح التخزين
    const USER_SETTINGS_KEY = 'sdmUserSettings';

    // دالة لتحميل الإعدادات
    function loadUserSettings() {
        try {
            const settings = localStorage.getItem(USER_SETTINGS_KEY);
            return settings ? JSON.parse(settings) : { theme: 'light', notifications: false };
        } catch (e) {
            console.error('Error loading user settings:', e);
            return { theme: 'light', notifications: false };
        }
    }

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

    // تحديث واجهة المستخدم بالإعدادات
    function updateUI(settings) {
        const themeSelector = document.getElementById('theme-selector');
        const notificationsToggle = document.getElementById('notifications-toggle');

        if (themeSelector && notificationsToggle) {
            themeSelector.value = settings.theme;
            notificationsToggle.checked = settings.notifications;
        }
    }

    // تهيئة الإعدادات عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        const settings = loadUserSettings();
        updateUI(settings);

        // تحديث الإعدادات عند تغيير القيم
        const themeSelector = document.getElementById('theme-selector');
        const notificationsToggle = document.getElementById('notifications-toggle');

        if (themeSelector) {
            themeSelector.addEventListener('change', function() {
                settings.theme = this.value;
                saveUserSettings(settings);
            });
        }

        if (notificationsToggle) {
            notificationsToggle.addEventListener('change', function() {
                settings.notifications = this.checked;
                saveUserSettings(settings);
            });
        }
    });

    // تصدير الدوال العامة
    window.sdmUserSettings = {
        load: loadUserSettings,
        save: saveUserSettings
    };
})();