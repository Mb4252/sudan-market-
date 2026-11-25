// public/sdm/sdm-module-103.js
(function() {
    'use strict';

    // دالة لحفظ إعدادات المستخدم في localStorage
    function saveUserSettings(settings) {
        if (!settings || typeof settings !== 'object') {
            console.error('Invalid settings object');
            return false;
        }

        try {
            localStorage.setItem('userSettings', JSON.stringify(settings));
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
            return settings ? JSON.parse(settings) : null;
        } catch (error) {
            console.error('Error getting user settings:', error);
            return null;
        }
    }

    // دالة لتحديث واجهة المستخدم بناءً على الإعدادات
    function updateUIFromSettings() {
        const settings = getUserSettings();
        if (!settings) return;

        // تحديث الوضع (فاتح/داكن)
        const themeSelector = document.getElementById('theme-selector');
        if (themeSelector && settings.theme) {
            themeSelector.value = settings.theme;
            document.body.className = settings.theme;
        }

        // تحديث حالة التنبيهات
        const notificationsToggle = document.getElementById('notifications-toggle');
        if (notificationsToggle && typeof settings.notificationsEnabled !== 'undefined') {
            notificationsToggle.checked = settings.notificationsEnabled;
        }
    }

    // دالة لتحديث الإعدادات عند تغيير القيم
    function setupSettingsListeners() {
        const themeSelector = document.getElementById('theme-selector');
        const notificationsToggle = document.getElementById('notifications-toggle');

        if (themeSelector) {
            themeSelector.addEventListener('change', function() {
                const settings = getUserSettings() || {};
                settings.theme = this.value;
                saveUserSettings(settings);
                document.body.className = this.value;
            });
        }

        if (notificationsToggle) {
            notificationsToggle.addEventListener('change', function() {
                const settings = getUserSettings() || {};
                settings.notificationsEnabled = this.checked;
                saveUserSettings(settings);
            });
        }
    }

    // تنفيذ الوظيفة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            updateUIFromSettings();
            setupSettingsListeners();
        } catch (error) {
            console.error('Error initializing user settings:', error);
        }
    });

    // تصدير الدوال للوصول إليها من خارج الملف
    window.sdmModule103 = {
        saveUserSettings,
        getUserSettings,
        updateUIFromSettings
    };
})();