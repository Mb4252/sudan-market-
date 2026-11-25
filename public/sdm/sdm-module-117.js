// sdm-module-117.js
// وظيفة: حفظ وإعادة تحميل إعدادات المستخدم في localStorage

(function() {
    'use strict';

    // مفتاح تخزين localStorage
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
            return settings ? JSON.parse(settings) : null;
        } catch (error) {
            console.error('Error loading user settings:', error);
            return null;
        }
    }

    // دالة لتطبيق إعدادات المستخدم على الواجهة
    function applyUserSettings() {
        try {
            const settings = loadUserSettings();
            if (!settings) return;

            // تطبيق الوضع (فاتح/داكن)
            if (settings.theme) {
                document.documentElement.setAttribute('data-theme', settings.theme);
                const themeSelector = document.getElementById('theme-selector');
                if (themeSelector) themeSelector.value = settings.theme;
            }

            // تطبيق التنبيهات
            if (typeof settings.notifications !== 'undefined') {
                const notificationsToggle = document.getElementById('notifications-toggle');
                if (notificationsToggle) notificationsToggle.checked = settings.notifications;
            }
        } catch (error) {
            console.error('Error applying user settings:', error);
        }
    }

    // تهيئة الإعدادات عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            // تطبيق الإعدادات المحفوظة
            applyUserSettings();

            // إضافة مستمعين للأحداث
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.addEventListener('change', function() {
                    const settings = loadUserSettings() || {};
                    settings.theme = this.value;
                    saveUserSettings(settings);
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
            console.error('Initialization error:', error);
        }
    });

    // تصدير الدوال للوصول العام
    window.sdmUserSettings = {
        save: saveUserSettings,
        load: loadUserSettings,
        apply: applyUserSettings
    };
})();