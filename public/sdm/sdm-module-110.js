// sdm-module-110.js
(function() {
    'use strict';

    // دالة لحفظ إعدادات المستخدم في localStorage
    function saveUserSettings(settings) {
        try {
            if (!settings || typeof settings !== 'object') {
                throw new Error('Invalid settings object');
            }

            // تحويل الإعدادات إلى سلسلة JSON
            const settingsString = JSON.stringify(settings);

            // حفظ الإعدادات في localStorage
            localStorage.setItem('sdmUserSettings', settingsString);

            return true;
        } catch (error) {
            console.error('Error saving user settings:', error);
            return false;
        }
    }

    // دالة لجلب إعدادات المستخدم من localStorage
    function getUserSettings() {
        try {
            const settingsString = localStorage.getItem('sdmUserSettings');

            if (!settingsString) {
                return null;
            }

            // تحويل السلسلة JSON إلى كائن
            const settings = JSON.parse(settingsString);

            return settings;
        } catch (error) {
            console.error('Error getting user settings:', error);
            return null;
        }
    }

    // دالة لتحديث واجهة المستخدم بالإعدادات المحفوظة
    function updateUIWithSettings() {
        try {
            const settings = getUserSettings();

            if (!settings) {
                return;
            }

            // تحديث واجهة المستخدم بالإعدادات
            const themeSelector = document.getElementById('theme-selector');
            const notificationsToggle = document.getElementById('notifications-toggle');

            if (themeSelector && settings.theme) {
                themeSelector.value = settings.theme;
            }

            if (notificationsToggle && typeof settings.notifications !== 'undefined') {
                notificationsToggle.checked = settings.notifications;
            }
        } catch (error) {
            console.error('Error updating UI with settings:', error);
        }
    }

    // تحديث واجهة المستخدم عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', updateUIWithSettings);

    // تحديث الإعدادات عند تغيير القيم
    document.getElementById('theme-selector')?.addEventListener('change', function() {
        saveUserSettings({
            theme: this.value,
            notifications: document.getElementById('notifications-toggle')?.checked
        });
    });

    document.getElementById('notifications-toggle')?.addEventListener('change', function() {
        saveUserSettings({
            theme: document.getElementById('theme-selector')?.value,
            notifications: this.checked
        });
    });

    // تصدير الدوال للوصول العام
    window.sdmSettings = {
        saveUserSettings,
        getUserSettings,
        updateUIWithSettings
    };
})();