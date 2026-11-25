// sdm-module-121.js
(function() {
    'use strict';

    // دالة لحفظ إعدادات المستخدم
    function saveUserSettings() {
        try {
            const themeSelector = document.getElementById('theme-selector');
            const notificationsToggle = document.getElementById('notifications-toggle');

            if (!themeSelector || !notificationsToggle) {
                console.error('Elements not found');
                return false;
            }

            const settings = {
                theme: themeSelector.value,
                notifications: notificationsToggle.checked
            };

            localStorage.setItem('userSettings', JSON.stringify(settings));
            return true;
        } catch (error) {
            console.error('Error saving user settings:', error);
            return false;
        }
    }

    // دالة لتحميل إعدادات المستخدم
    function loadUserSettings() {
        try {
            const settings = localStorage.getItem('userSettings');
            if (!settings) return;

            const parsedSettings = JSON.parse(settings);
            const themeSelector = document.getElementById('theme-selector');
            const notificationsToggle = document.getElementById('notifications-toggle');

            if (themeSelector) themeSelector.value = parsedSettings.theme || 'light';
            if (notificationsToggle) notificationsToggle.checked = parsedSettings.notifications || false;
        } catch (error) {
            console.error('Error loading user settings:', error);
        }
    }

    // تهيئة التطبيق
    document.addEventListener('DOMContentLoaded', function() {
        loadUserSettings();

        // إضافة مستمعين للأحداث
        const themeSelector = document.getElementById('theme-selector');
        const notificationsToggle = document.getElementById('notifications-toggle');

        if (themeSelector) {
            themeSelector.addEventListener('change', saveUserSettings);
        }

        if (notificationsToggle) {
            notificationsToggle.addEventListener('change', saveUserSettings);
        }
    });

    // تصدير الدوال
    window.sdmSaveUserSettings = saveUserSettings;
    window.sdmLoadUserSettings = loadUserSettings;
})();