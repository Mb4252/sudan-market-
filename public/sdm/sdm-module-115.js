// public/sdm/sdm-module-115.js
(function() {
    'use strict';

    // مفتاح تخزين إعدادات المستخدم في localStorage
    const USER_SETTINGS_KEY = 'sdmUserSettings';

    // دالة لتحميل إعدادات المستخدم
    function loadUserSettings() {
        try {
            const settings = localStorage.getItem(USER_SETTINGS_KEY);
            return settings ? JSON.parse(settings) : { theme: 'light', notifications: false };
        } catch (e) {
            console.error('Error loading user settings:', e);
            return { theme: 'light', notifications: false };
        }
    }

    // دالة لحفظ إعدادات المستخدم
    function saveUserSettings(settings) {
        try {
            localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(settings));
            return true;
        } catch (e) {
            console.error('Error saving user settings:', e);
            return false;
        }
    }

    // دالة لتحديث واجهة المستخدم بناءً على الإعدادات
    function updateUI(settings) {
        const themeSelector = document.getElementById('theme-selector');
        const notificationsToggle = document.getElementById('notifications-toggle');

        if (themeSelector && notificationsToggle) {
            themeSelector.value = settings.theme;
            notificationsToggle.checked = settings.notifications;
        }
    }

    // تهيئة الوحدة
    function init() {
        const settings = loadUserSettings();
        updateUI(settings);

        // إضافة مستمعين للأحداث
        const themeSelector = document.getElementById('theme-selector');
        const notificationsToggle = document.getElementById('notifications-toggle');

        if (themeSelector) {
            themeSelector.addEventListener('change', function() {
                const newSettings = {
                    ...settings,
                    theme: this.value
                };
                saveUserSettings(newSettings);
                updateUI(newSettings);
            });
        }

        if (notificationsToggle) {
            notificationsToggle.addEventListener('change', function() {
                const newSettings = {
                    ...settings,
                    notifications: this.checked
                };
                saveUserSettings(newSettings);
            });
        }
    }

    // تشغيل التهيئة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // تصدير الوظائف العامة
    window.sdmUserSettings = {
        load: loadUserSettings,
        save: saveUserSettings
    };
})();