// public/sdm/sdm-module-85.js
(function() {
    'use strict';

    // مفتاح تخزين إعدادات المستخدم
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

    // تهيئة الإعدادات الافتراضية عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            const settings = getUserSettings();

            // تطبيق الإعدادات على الواجهة
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector && settings.theme) {
                themeSelector.value = settings.theme;
            }

            const notificationsToggle = document.getElementById('notifications-toggle');
            if (notificationsToggle && settings.notifications !== undefined) {
                notificationsToggle.checked = settings.notifications;
            }
        } catch (error) {
            console.error('Error initializing user settings:', error);
        }
    });

    // حفظ الإعدادات عند تغييرها
    document.addEventListener('change', function(event) {
        try {
            if (event.target.id === 'theme-selector' || event.target.id === 'notifications-toggle') {
                const settings = {
                    theme: document.getElementById('theme-selector').value,
                    notifications: document.getElementById('notifications-toggle').checked
                };
                saveUserSettings(settings);
            }
        } catch (error) {
            console.error('Error saving settings on change:', error);
        }
    });
})();