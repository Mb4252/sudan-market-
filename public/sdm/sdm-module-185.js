// public/sdm/sdm-module-185.js
(function() {
    'use strict';

    // إعدادات التوسعة
    const STORAGE_KEY = 'sdmUserSettings';
    const DEFAULT_SETTINGS = {
        theme: 'light',
        notifications: true,
        language: 'en'
    };

    // دالة لتحميل الإعدادات
    function loadSettings() {
        try {
            const settings = localStorage.getItem(STORAGE_KEY);
            return settings ? JSON.parse(settings) : DEFAULT_SETTINGS;
        } catch (e) {
            console.error('Error loading settings:', e);
            return DEFAULT_SETTINGS;
        }
    }

    // دالة لحفظ الإعدادات
    function saveSettings(settings) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
            return true;
        } catch (e) {
            console.error('Error saving settings:', e);
            return false;
        }
    }

    // تهيئة التوسعة
    function init() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const settingsElement = document.getElementById('sdm-settings');
            if (!settingsElement) return;

            // تحميل الإعدادات
            const settings = loadSettings();

            // تحديث واجهة المستخدم
            const themeElement = document.getElementById('sdm-theme');
            const notificationsElement = document.getElementById('sdm-notifications');
            const languageElement = document.getElementById('sdm-language');

            if (themeElement) themeElement.value = settings.theme;
            if (notificationsElement) notificationsElement.checked = settings.notifications;
            if (languageElement) languageElement.value = settings.language;

            // إضافة مستمعين للأحداث
            if (themeElement) {
                themeElement.addEventListener('change', () => {
                    settings.theme = themeElement.value;
                    saveSettings(settings);
                });
            }

            if (notificationsElement) {
                notificationsElement.addEventListener('change', () => {
                    settings.notifications = notificationsElement.checked;
                    saveSettings(settings);
                });
            }

            if (languageElement) {
                languageElement.addEventListener('change', () => {
                    settings.language = languageElement.value;
                    saveSettings(settings);
                });
            }
        } catch (e) {
            console.error('Error initializing SDM module:', e);
        }
    }

    // تهيئة التوسعة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();