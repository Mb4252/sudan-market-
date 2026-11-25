// sdm-module-83.js
(function() {
    'use strict';

    // دالة لحفظ إعدادات المستخدم في localStorage
    function saveUserSettings(settings) {
        try {
            if (!settings || typeof settings !== 'object') {
                console.error('Invalid settings object');
                return false;
            }

            // حفظ الإعدادات في localStorage
            localStorage.setItem('sdmUserSettings', JSON.stringify(settings));
            return true;
        } catch (error) {
            console.error('Error saving user settings:', error);
            return false;
        }
    }

    // دالة لجلب إعدادات المستخدم من localStorage
    function getUserSettings() {
        try {
            const settings = localStorage.getItem('sdmUserSettings');
            return settings ? JSON.parse(settings) : {};
        } catch (error) {
            console.error('Error getting user settings:', error);
            return {};
        }
    }

    // تحديث الواجهة بناءً على الإعدادات المحفوظة
    function updateUIFromSettings() {
        try {
            const settings = getUserSettings();
            const themeSelector = document.getElementById('theme-selector');
            const notificationsToggle = document.getElementById('notifications-toggle');

            if (themeSelector && settings.theme) {
                themeSelector.value = settings.theme;
            }
            if (notificationsToggle && settings.notifications !== undefined) {
                notificationsToggle.checked = settings.notifications;
            }
        } catch (error) {
            console.error('Error updating UI from settings:', error);
        }
    }

    // تهيئة الوحدة
    function init() {
        try {
            // تحديث الواجهة عند تحميل الصفحة
            document.addEventListener('DOMContentLoaded', updateUIFromSettings);

            // تحديث الإعدادات عند تغيير القيم
            const themeSelector = document.getElementById('theme-selector');
            const notificationsToggle = document.getElementById('notifications-toggle');

            if (themeSelector) {
                themeSelector.addEventListener('change', function() {
                    const settings = getUserSettings();
                    settings.theme = this.value;
                    saveUserSettings(settings);
                });
            }

            if (notificationsToggle) {
                notificationsToggle.addEventListener('change', function() {
                    const settings = getUserSettings();
                    settings.notifications = this.checked;
                    saveUserSettings(settings);
                });
            }
        } catch (error) {
            console.error('Error initializing module:', error);
        }
    }

    // بدء التهيئة
    init();

    // تصدير الدوال للواجهة العالمية
    window.sdmModule83 = {
        saveUserSettings,
        getUserSettings,
        updateUIFromSettings
    };
})();