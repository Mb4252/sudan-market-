// public/sdm/sdm-module-225.js
(function() {
    'use strict';

    // إعدادات التوسعة
    const STORAGE_KEY = 'sdmModule225Settings';
    const DEFAULT_SETTINGS = {
        theme: 'light',
        notifications: true,
        language: 'en'
    };

    // دالة لتحميل الإعدادات
    function loadSettings() {
        try {
            const savedSettings = localStorage.getItem(STORAGE_KEY);
            return savedSettings ? JSON.parse(savedSettings) : DEFAULT_SETTINGS;
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

    // دالة لتحديث واجهة المستخدم
    function updateUI(settings) {
        const themeElement = document.getElementById('sdm-theme');
        const notificationsElement = document.getElementById('sdm-notifications');
        const languageElement = document.getElementById('sdm-language');

        if (themeElement) themeElement.textContent = settings.theme;
        if (notificationsElement) notificationsElement.textContent = settings.notifications ? 'On' : 'Off';
        if (languageElement) languageElement.textContent = settings.language;
    }

    // تهيئة التوسعة
    function init() {
        try {
            const settings = loadSettings();
            updateUI(settings);

            // إضافة مستمعين للأحداث
            document.getElementById('sdm-save-settings')?.addEventListener('click', () => {
                const newSettings = {
                    theme: document.getElementById('sdm-theme-select')?.value || 'light',
                    notifications: document.getElementById('sdm-notifications-toggle')?.checked || true,
                    language: document.getElementById('sdm-language-select')?.value || 'en'
                };
                saveSettings(newSettings);
                updateUI(newSettings);
            });
        } catch (e) {
            console.error('Error initializing SDM Module 225:', e);
        }
    }

    // تنفيذ التهيئة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();