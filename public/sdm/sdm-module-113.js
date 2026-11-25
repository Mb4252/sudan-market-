// public/sdm/sdm-module-113.js
(function() {
    'use strict';

    // دالة لحفظ إعدادات المستخدم في localStorage
    function saveUserSettings() {
        try {
            const themeSelector = document.getElementById('theme-selector');
            const notificationsToggle = document.getElementById('notifications-toggle');

            if (themeSelector && notificationsToggle) {
                const settings = {
                    theme: themeSelector.value,
                    notifications: notificationsToggle.checked
                };

                localStorage.setItem('sdmUserSettings', JSON.stringify(settings));
            }
        } catch (error) {
            console.error('Error saving user settings:', error);
        }
    }

    // استرجاع إعدادات المستخدم من localStorage
    function loadUserSettings() {
        try {
            const settings = localStorage.getItem('sdmUserSettings');
            if (settings) {
                const parsedSettings = JSON.parse(settings);
                const themeSelector = document.getElementById('theme-selector');
                const notificationsToggle = document.getElementById('notifications-toggle');

                if (themeSelector) {
                    themeSelector.value = parsedSettings.theme || 'light';
                }
                if (notificationsToggle) {
                    notificationsToggle.checked = parsedSettings.notifications || false;
                }
            }
        } catch (error) {
            console.error('Error loading user settings:', error);
        }
    }

    // تهيئة الواجهة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        loadUserSettings();
        const themeSelector = document.getElementById('theme-selector');
        const notificationsToggle = document.getElementById('notifications-toggle');

        if (themeSelector) {
            themeSelector.addEventListener('change', saveUserSettings);
        }
        if (notificationsToggle) {
            notificationsToggle.addEventListener('change', saveUserSettings);
        }
    });

    // تصدير الدوال للوصول العالمي
    window.sdmSaveUserSettings = saveUserSettings;
    window.sdmLoadUserSettings = loadUserSettings;
})();
