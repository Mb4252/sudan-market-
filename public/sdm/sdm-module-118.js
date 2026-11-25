// public/sdm/sdm-module-118.js

(function() {
    'use strict';

    try {
        // دالة لحفظ إعدادات المستخدم في localStorage
        function saveUserSettings() {
            const themeSelector = document.getElementById('theme-selector');
            const notificationsToggle = document.getElementById('notifications-toggle');

            if (!themeSelector || !notificationsToggle) {
                console.error('Required elements not found');
                return;
            }

            const settings = {
                theme: themeSelector.value,
                notifications: notificationsToggle.checked
            };

            try {
                localStorage.setItem('userSettings', JSON.stringify(settings));
                console.log('Settings saved successfully');
            } catch (e) {
                console.error('Error saving settings:', e);
            }
        }

        // دالة لتحميل الإعدادات المحفوظة
        function loadUserSettings() {
            const themeSelector = document.getElementById('theme-selector');
            const notificationsToggle = document.getElementById('notifications-toggle');

            if (!themeSelector || !notificationsToggle) {
                console.error('Required elements not found');
                return;
            }

            try {
                const savedSettings = localStorage.getItem('userSettings');
                if (savedSettings) {
                    const settings = JSON.parse(savedSettings);
                    themeSelector.value = settings.theme || 'light';
                    notificationsToggle.checked = settings.notifications || false;
                }
            } catch (e) {
                console.error('Error loading settings:', e);
            }
        }

        // تحميل الإعدادات عند تحميل الصفحة
        document.addEventListener('DOMContentLoaded', loadUserSettings);

        // حفظ الإعدادات عند تغييرها
        document.getElementById('theme-selector').addEventListener('change', saveUserSettings);
        document.getElementById('notifications-toggle').addEventListener('change', saveUserSettings);
    } catch (e) {
        console.error('Error in sdm-module-118:', e);
    }
})();