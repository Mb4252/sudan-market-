// public/sdm/sdm-module-81.js
(function() {
    'use strict';

    // مفتاح تخزين الإعدادات في localStorage
    const SETTINGS_KEY = 'sdmUserSettings';

    // إعدادات افتراضية
    const DEFAULT_SETTINGS = {
        name: '',
        theme: 'light',
        notifications: true
    };

    // دالة لتحميل الإعدادات
    function loadSettings() {
        try {
            const savedSettings = localStorage.getItem(SETTINGS_KEY);
            return savedSettings ? JSON.parse(savedSettings) : DEFAULT_SETTINGS;
        } catch (e) {
            console.error('Error loading settings:', e);
            return DEFAULT_SETTINGS;
        }
    }

    // دالة لحفظ الإعدادات
    function saveSettings(settings) {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
            return true;
        } catch (e) {
            console.error('Error saving settings:', e);
            return false;
        }
    }

    // دالة لتحديث واجهة المستخدم
    function updateUI(settings) {
        const nameElement = document.getElementById('sdm-name');
        const themeElement = document.getElementById('theme-selector');
        const notificationsElement = document.getElementById('notifications-toggle');

        if (nameElement) nameElement.value = settings.name;
        if (themeElement) themeElement.value = settings.theme;
        if (notificationsElement) notificationsElement.checked = settings.notifications;
    }

    // تهيئة الوحدة
    function init() {
        const settings = loadSettings();
        updateUI(settings);

        // إضافة مستمعين للأحداث
        const nameElement = document.getElementById('sdm-name');
        const themeElement = document.getElementById('theme-selector');
        const notificationsElement = document.getElementById('notifications-toggle');

        if (nameElement) {
            nameElement.addEventListener('change', function() {
                settings.name = this.value;
                saveSettings(settings);
            });
        }

        if (themeElement) {
            themeElement.addEventListener('change', function() {
                settings.theme = this.value;
                saveSettings(settings);
                updateUI(settings);
            });
        }

        if (notificationsElement) {
            notificationsElement.addEventListener('change', function() {
                settings.notifications = this.checked;
                saveSettings(settings);
            });
        }
    }

    // بدء التهيئة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // تصدير الدوال للوحدة العالمية
    window.sdmSettingsModule = {
        loadSettings,
        saveSettings,
        updateUI
    };
})();