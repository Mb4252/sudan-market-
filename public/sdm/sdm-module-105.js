// sdm-module-105.js
(function() {
    'use strict';

    // مفتاح تخزين إعدادات المستخدم
    const USER_SETTINGS_KEY = 'sdmUserSettings';

    // دالة لحفظ إعدادات المستخدم
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

    // دالة لجلب إعدادات المستخدم
    function getUserSettings() {
        try {
            const settings = localStorage.getItem(USER_SETTINGS_KEY);
            return settings ? JSON.parse(settings) : {};
        } catch (error) {
            console.error('Error getting user settings:', error);
            return {};
        }
    }

    // دالة لتحديث واجهة المستخدم بالإعدادات المحفوظة
    function updateUIWithSettings() {
        const settings = getUserSettings();

        // تحديث الوضع (فاتح/داكن)
        if (settings.theme) {
            document.documentElement.setAttribute('data-theme', settings.theme);
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.value = settings.theme;
            }
        }

        // تحديث إعدادات التنبيهات
        if (settings.notifications !== undefined) {
            const notificationsToggle = document.getElementById('notifications-toggle');
            if (notificationsToggle) {
                notificationsToggle.checked = settings.notifications;
            }
        }
    }

    // تحديث الإعدادات عند تغيير القيم
    function setupSettingsListeners() {
        const themeSelector = document.getElementById('theme-selector');
        const notificationsToggle = document.getElementById('notifications-toggle');

        if (themeSelector) {
            themeSelector.addEventListener('change', function() {
                const settings = getUserSettings();
                settings.theme = this.value;
                saveUserSettings(settings);
                updateUIWithSettings();
            });
        }

        if (notificationsToggle) {
            notificationsToggle.addEventListener('change', function() {
                const settings = getUserSettings();
                settings.notifications = this.checked;
                saveUserSettings(settings);
            });
        }
    }

    // تهيئة الوحدة
    function init() {
        try {
            updateUIWithSettings();
            setupSettingsListeners();
        } catch (error) {
            console.error('Error initializing user settings module:', error);
        }
    }

    // بدء التشغيل عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // تصدير الوظائف العامة
    window.sdmUserSettings = {
        save: saveUserSettings,
        get: getUserSettings,
        updateUI: updateUIWithSettings
    };
})();