// public/sdm/sdm-module-107.js

/**
 * sdm-module-107.js
 * وظيفة: حفظ وإسترجاع إعدادات المستخدم في localStorage
 * التبعيات: localStorage
 * الحجم: 120 سطر
 */

(function() {
    'use strict';

    // مفتاح التخزين
    const USER_SETTINGS_KEY = 'sdmUserSettings';

    // إعدادات افتراضية
    const DEFAULT_SETTINGS = {
        theme: 'light',
        notifications: false
    };

    // دالة لحفظ الإعدادات
    function saveUserSettings(settings) {
        try {
            if (!settings || typeof settings !== 'object') {
                throw new Error('Invalid settings object');
            }

            const currentSettings = getUserSettings();
            const updatedSettings = { ...currentSettings, ...settings };

            localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(updatedSettings));
            return true;
        } catch (error) {
            console.error('Error saving user settings:', error);
            return false;
        }
    }

    // دالة لاسترجاع الإعدادات
    function getUserSettings() {
        try {
            const settings = localStorage.getItem(USER_SETTINGS_KEY);
            return settings ? JSON.parse(settings) : DEFAULT_SETTINGS;
        } catch (error) {
            console.error('Error getting user settings:', error);
            return DEFAULT_SETTINGS;
        }
    }

    // دالة لتطبيق الإعدادات على الواجهة
    function applyUserSettings() {
        try {
            const settings = getUserSettings();

            // تطبيق الوضع (فاتح/داكن)
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.value = settings.theme;
                document.body.className = settings.theme;
            }

            // تطبيق التنبيهات
            const notificationsToggle = document.getElementById('notifications-toggle');
            if (notificationsToggle) {
                notificationsToggle.checked = settings.notifications;
            }
        } catch (error) {
            console.error('Error applying user settings:', error);
        }
    }

    // تهيئة الوحدة
    function init() {
        try {
            // تطبيق الإعدادات عند التحميل
            applyUserSettings();

            // إضافة مستمعين للأحداث
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.addEventListener('change', function() {
                    saveUserSettings({ theme: this.value });
                    document.body.className = this.value;
                });
            }

            const notificationsToggle = document.getElementById('notifications-toggle');
            if (notificationsToggle) {
                notificationsToggle.addEventListener('change', function() {
                    saveUserSettings({ notifications: this.checked });
                });
            }
        } catch (error) {
            console.error('Error initializing user settings module:', error);
        }
    }

    // بدء التهيئة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // تصدير الدوال العامة
    window.sdmUserSettings = {
        save: saveUserSettings,
        get: getUserSettings,
        apply: applyUserSettings
    };
})();