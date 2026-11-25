// public/sdm/sdm-module-206.js
(function() {
    'use strict';

    // إعدادات التوسعة
    const USER_SETTINGS_KEY = 'sdmUserSettings';
    const DEFAULT_SETTINGS = {
        theme: 'light',
        notifications: true,
        language: 'en'
    };

    // دالة لتحميل الإعدادات من localStorage
    function loadSettings() {
        try {
            const savedSettings = localStorage.getItem(USER_SETTINGS_KEY);
            return savedSettings ? JSON.parse(savedSettings) : DEFAULT_SETTINGS;
        } catch (error) {
            console.error('Error loading settings:', error);
            return DEFAULT_SETTINGS;
        }
    }

    // دالة لحفظ الإعدادات في localStorage
    function saveSettings(settings) {
        try {
            localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(settings));
            return true;
        } catch (error) {
            console.error('Error saving settings:', error);
            return false;
        }
    }

    // دالة لتحديث واجهة المستخدم
    function updateUI(settings) {
        const themeElement = document.getElementById('theme-display');
        const notificationsElement = document.getElementById('notifications-display');
        const languageElement = document.getElementById('language-display');

        if (themeElement) themeElement.textContent = settings.theme;
        if (notificationsElement) notificationsElement.textContent = settings.notifications ? 'Enabled' : 'Disabled';
        if (languageElement) languageElement.textContent = settings.language;
    }

    // دالة تهيئة التوسعة
    function init() {
        try {
            const settings = loadSettings();
            updateUI(settings);

            // إضافة مستمعين للأحداث
            const themeSelect = document.getElementById('theme-select');
            const notificationsToggle = document.getElementById('notifications-toggle');
            const languageSelect = document.getElementById('language-select');

            if (themeSelect) {
                themeSelect.value = settings.theme;
                themeSelect.addEventListener('change', function() {
                    settings.theme = this.value;
                    saveSettings(settings);
                    updateUI(settings);
                });
            }

            if (notificationsToggle) {
                notificationsToggle.checked = settings.notifications;
                notificationsToggle.addEventListener('change', function() {
                    settings.notifications = this.checked;
                    saveSettings(settings);
                    updateUI(settings);
                });
            }

            if (languageSelect) {
                languageSelect.value = settings.language;
                languageSelect.addEventListener('change', function() {
                    settings.language = this.value;
                    saveSettings(settings);
                    updateUI(settings);
                });
            }
        } catch (error) {
            console.error('Error initializing SDM module 206:', error);
        }
    }

    // تنفيذ التهيئة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ربط الدالة العامة مع النافذة العالمية
    window.sdmModule206 = {
        loadSettings,
        saveSettings,
        updateUI
    };
})();