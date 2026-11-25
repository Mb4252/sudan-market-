// sdm-module-91.js
(function() {
    'use strict';

    // مفتاح تخزين إعدادات المستخدم
    const USER_SETTINGS_KEY = 'sdmUserSettings';

    // دالة لحفظ إعدادات المستخدم
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

    // دالة لتحميل إعدادات المستخدم
    function loadUserSettings() {
        try {
            const settings = localStorage.getItem(USER_SETTINGS_KEY);
            return settings ? JSON.parse(settings) : {};
        } catch (error) {
            console.error('Error loading user settings:', error);
            return {};
        }
    }

    // ربط الدوال مع النافذة العالمية
    window.sdmSaveUserSettings = saveUserSettings;
    window.sdmLoadUserSettings = loadUserSettings;

    // تهيئة إعدادات المستخدم عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            const settings = loadUserSettings();

            // تطبيق إعدادات المستخدم على الواجهة
            const themeSelector = document.getElementById('theme-selector');
            const notificationsToggle = document.getElementById('notifications-toggle');

            if (themeSelector && settings.theme) {
                themeSelector.value = settings.theme;
            }

            if (notificationsToggle && settings.notifications !== undefined) {
                notificationsToggle.checked = settings.notifications;
            }

            // تحديث إعدادات عند تغييرها
            if (themeSelector) {
                themeSelector.addEventListener('change', function() {
                    saveUserSettings({
                        theme: this.value,
                        notifications: notificationsToggle ? notificationsToggle.checked : false
                    });
                });
            }

            if (notificationsToggle) {
                notificationsToggle.addEventListener('change', function() {
                    saveUserSettings({
                        theme: themeSelector ? themeSelector.value : 'light',
                        notifications: this.checked
                    });
                });
            }
        } catch (error) {
            console.error('Error initializing user settings:', error);
        }
    });
})();