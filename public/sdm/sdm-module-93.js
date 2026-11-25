// public/sdm/sdm-module-93.js
(function() {
    'use strict';

    // مفتاح تخزين إعدادات المستخدم
    const USER_SETTINGS_KEY = 'sdmUserSettings';

    // دالة لتخزين إعدادات المستخدم
    function saveUserSettings(settings) {
        try {
            if (!settings || typeof settings !== 'object') {
                throw new Error('Invalid settings object');
            }

            // التحقق من وجود localStorage
            if (typeof localStorage === 'undefined') {
                throw new Error('localStorage is not available');
            }

            // تخزين الإعدادات
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
            // التحقق من وجود localStorage
            if (typeof localStorage === 'undefined') {
                throw new Error('localStorage is not available');
            }

            // تحميل الإعدادات
            const settings = localStorage.getItem(USER_SETTINGS_KEY);
            return settings ? JSON.parse(settings) : null;
        } catch (error) {
            console.error('Error loading user settings:', error);
            return null;
        }
    }

    // تصدير الدوال
    window.sdmModule93 = {
        saveUserSettings,
        loadUserSettings
    };

    // تهيئة الإعدادات الافتراضية عند الحاجة
    if (!loadUserSettings()) {
        saveUserSettings({
            theme: 'light',
            notifications: false
        });
    }

    // تحديث واجهة المستخدم بالإعدادات المحملة
    function updateUIWithSettings() {
        const settings = loadUserSettings();
        if (settings) {
            const themeSelector = document.getElementById('theme-selector');
            const notificationsToggle = document.getElementById('notifications-toggle');

            if (themeSelector) {
                themeSelector.value = settings.theme;
            }

            if (notificationsToggle) {
                notificationsToggle.checked = settings.notifications;
            }
        }
    }

    // استماع لتغييرات الإعدادات
    document.addEventListener('DOMContentLoaded', function() {
        updateUIWithSettings();

        const themeSelector = document.getElementById('theme-selector');
        const notificationsToggle = document.getElementById('notifications-toggle');

        if (themeSelector) {
            themeSelector.addEventListener('change', function() {
                const settings = loadUserSettings() || {};
                settings.theme = this.value;
                saveUserSettings(settings);
            });
        }

        if (notificationsToggle) {
            notificationsToggle.addEventListener('change', function() {
                const settings = loadUserSettings() || {};
                settings.notifications = this.checked;
                saveUserSettings(settings);
            });
        }
    });
})();