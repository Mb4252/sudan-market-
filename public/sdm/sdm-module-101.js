// sdm-module-101.js
// وظيفة: حفظ وتحميل إعدادات المستخدم في localStorage

(function() {
    'use strict';

    // مفتاح تخزين localStorage
    const USER_SETTINGS_KEY = 'sdmUserSettings';

    // دالة لحفظ الإعدادات
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

    // دالة لتحميل الإعدادات
    function loadUserSettings() {
        try {
            const settings = localStorage.getItem(USER_SETTINGS_KEY);
            return settings ? JSON.parse(settings) : null;
        } catch (error) {
            console.error('Error loading user settings:', error);
            return null;
        }
    }

    // دالة لتطبيق الإعدادات على الواجهة
    function applyUserSettings() {
        const settings = loadUserSettings();
        if (!settings) return;

        // تطبيق إعدادات الثيم
        if (settings.theme) {
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.value = settings.theme;
                document.body.className = settings.theme;
            }
        }

        // تطبيق إعدادات التنبيهات
        if (settings.notifications !== undefined) {
            const notificationsToggle = document.getElementById('notifications-toggle');
            if (notificationsToggle) {
                notificationsToggle.checked = settings.notifications;
            }
        }
    }

    // تهيئة الإعدادات عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            applyUserSettings();

            // إضافة مستمعين لتغيير الإعدادات
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.addEventListener('change', function() {
                    const settings = loadUserSettings() || {};
                    settings.theme = this.value;
                    saveUserSettings(settings);
                    document.body.className = this.value;
                });
            }

            const notificationsToggle = document.getElementById('notifications-toggle');
            if (notificationsToggle) {
                notificationsToggle.addEventListener('change', function() {
                    const settings = loadUserSettings() || {};
                    settings.notifications = this.checked;
                    saveUserSettings(settings);
                });
            }
        } catch (error) {
            console.error('Error initializing user settings:', error);
        }
    });

    // تصدير الدوال
    window.sdmUserSettings = {
        save: saveUserSettings,
        load: loadUserSettings,
        apply: applyUserSettings
    };
})();