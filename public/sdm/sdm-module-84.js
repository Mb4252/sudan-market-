// public/sdm/sdm-module-84.js
(function() {
    'use strict';

    // مفتاح تخزين الإعدادات في localStorage
    const SETTINGS_KEY = 'sdmUserSettings';

    // دالة لتحميل الإعدادات من localStorage
    function loadSettings() {
        try {
            const settings = localStorage.getItem(SETTINGS_KEY);
            return settings ? JSON.parse(settings) : { theme: 'light', notifications: false };
        } catch (e) {
            console.error('Error loading settings:', e);
            return { theme: 'light', notifications: false };
        }
    }

    // دالة لحفظ الإعدادات في localStorage
    function saveSettings(settings) {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
            return true;
        } catch (e) {
            console.error('Error saving settings:', e);
            return false;
        }
    }

    // دالة لتحديث واجهة المستخدم بالإعدادات
    function updateUI(settings) {
        const themeSelector = document.getElementById('theme-selector');
        const notificationsToggle = document.getElementById('notifications-toggle');

        if (themeSelector && notificationsToggle) {
            themeSelector.value = settings.theme;
            notificationsToggle.checked = settings.notifications;

            // تحديث واجهة المستخدم حسب الإعدادات
            document.body.className = settings.theme;
        }
    }

    // تهيئة الإعدادات عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        const settings = loadSettings();
        updateUI(settings);

        // تحديث الإعدادات عند تغيير القيم
        document.getElementById('theme-selector').addEventListener('change', function() {
            const newSettings = {
                theme: this.value,
                notifications: document.getElementById('notifications-toggle').checked
            };
            saveSettings(newSettings);
            updateUI(newSettings);
        });

        document.getElementById('notifications-toggle').addEventListener('change', function() {
            const newSettings = {
                theme: document.getElementById('theme-selector').value,
                notifications: this.checked
            };
            saveSettings(newSettings);
        });
    });

    // تصدير الدوال للوصول منها من خارج هذا الملف
    window.sdmSettings = {
        load: loadSettings,
        save: saveSettings,
        updateUI: updateUI
    };
})();