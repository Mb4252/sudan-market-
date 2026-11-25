(function() {
    'use strict';

    try {
        // دالة لتحميل إعدادات المستخدم من localStorage
        function loadUserSettings() {
            try {
                const settings = localStorage.getItem('sdmUserSettings');
                if (settings) {
                    return JSON.parse(settings);
                }
            } catch (e) {
                console.error('Error loading user settings:', e);
            }
            return null;
        }

        // دالة لحفظ إعدادات المستخدم في localStorage
        function saveUserSettings(settings) {
            try {
                localStorage.setItem('sdmUserSettings', JSON.stringify(settings));
                return true;
            } catch (e) {
                console.error('Error saving user settings:', e);
                return false;
            }
        }

        // تحديث الواجهة بناءً على الإعدادات
        function updateUI(settings) {
            const themeSelector = document.getElementById('theme-selector');
            const notificationsToggle = document.getElementById('notifications-toggle');

            if (themeSelector && settings.theme) {
                themeSelector.value = settings.theme;
            }

            if (notificationsToggle && settings.notifications !== undefined) {
                notificationsToggle.checked = settings.notifications;
            }
        }

        // تحميل الإعدادات عند تحميل الصفحة
        document.addEventListener('DOMContentLoaded', function() {
            const settings = loadUserSettings();
            if (settings) {
                updateUI(settings);
            }

            // إضافة مستمعين للأحداث
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
    } catch (e) {
        console.error('Error in sdm-module-99:', e);
    }
})();