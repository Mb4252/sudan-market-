// sdm-module-109.js
(function() {
    'use strict';

    // دالة لتخزين إعدادات المستخدم في localStorage
    function saveUserSettings(settings) {
        try {
            if (!settings || typeof settings !== 'object') {
                throw new Error('Invalid settings object');
            }

            const existingSettings = JSON.parse(localStorage.getItem('userSettings')) || {};
            const updatedSettings = { ...existingSettings, ...settings };

            localStorage.setItem('userSettings', JSON.stringify(updatedSettings));
            return true;
        } catch (error) {
            console.error('Error saving user settings:', error);
            return false;
        }
    }

    // دالة لجلب إعدادات المستخدم من localStorage
    function getUserSettings() {
        try {
            const settings = localStorage.getItem('userSettings');
            return settings ? JSON.parse(settings) : {};
        } catch (error) {
            console.error('Error getting user settings:', error);
            return {};
        }
    }

    // دالة لتحديث واجهة المستخدم بناءً على الإعدادات
    function updateUIFromSettings() {
        const settings = getUserSettings();

        // تحديث الوضع (فاتح/داكن)
        if (settings.theme) {
            document.documentElement.setAttribute('data-theme', settings.theme);
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.value = settings.theme;
            }
        }

        // تحديث إعداد التنبيهات
        if (settings.notifications !== undefined) {
            const notificationsToggle = document.getElementById('notifications-toggle');
            if (notificationsToggle) {
                notificationsToggle.checked = settings.notifications;
            }
        }
    }

    // تحديث الإعدادات عند تغيير القيم
    function setupEventListeners() {
        const themeSelector = document.getElementById('theme-selector');
        const notificationsToggle = document.getElementById('notifications-toggle');

        if (themeSelector) {
            themeSelector.addEventListener('change', function() {
                saveUserSettings({ theme: this.value });
            });
        }

        if (notificationsToggle) {
            notificationsToggle.addEventListener('change', function() {
                saveUserSettings({ notifications: this.checked });
            });
        }
    }

    // تنفيذ الوظيفة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            updateUIFromSettings();
            setupEventListeners();
        } catch (error) {
            console.error('Error initializing user settings:', error);
        }
    });

    // تصدير الدوال للوصول منها من خارج الملف
    window.sdmUserSettings = {
        save: saveUserSettings,
        get: getUserSettings,
        updateUI: updateUIFromSettings
    };
})();