(function() {
    'use strict';

    // إعدادات التوسعة
    const STORAGE_KEY = 'sdmUserSettings';
    const DEFAULT_SETTINGS = {
        theme: 'light',
        notifications: true,
        language: 'en'
    };

    // دالة حفظ الإعدادات
    function saveSettings(settings) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
            return true;
        } catch (error) {
            console.error('Error saving settings:', error);
            return false;
        }
    }

    // دالة تحميل الإعدادات
    function loadSettings() {
        try {
            const savedSettings = localStorage.getItem(STORAGE_KEY);
            return savedSettings ? JSON.parse(savedSettings) : DEFAULT_SETTINGS;
        } catch (error) {
            console.error('Error loading settings:', error);
            return DEFAULT_SETTINGS;
        }
    }

    // دالة تحديث الواجهة
    function updateUI(settings) {
        try {
            const themeElement = document.getElementById('theme-select');
            const notificationsElement = document.getElementById('notifications-toggle');
            const languageElement = document.getElementById('language-select');

            if (themeElement) themeElement.value = settings.theme;
            if (notificationsElement) notificationsElement.checked = settings.notifications;
            if (languageElement) languageElement.value = settings.language;
        } catch (error) {
            console.error('Error updating UI:', error);
        }
    }

    // دالة الحصول على الإعدادات من النموذج
    function getFormSettings() {
        return {
            theme: document.getElementById('theme-select').value,
            notifications: document.getElementById('notifications-toggle').checked,
            language: document.getElementById('language-select').value
        };
    }

    // تهيئة التوسعة
    function init() {
        // تحميل الإعدادات عند بدء التشغيل
        const settings = loadSettings();

        // تحديث الواجهة
        updateUI(settings);

        // حفظ الإعدادات عند تغييرها
        document.addEventListener('change', function(event) {
            if (event.target.closest('#settings-form')) {
                const updatedSettings = getFormSettings();
                saveSettings(updatedSettings);
            }
        });
    }

    // تشغيل التوسعة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ربط الدوال مع النافذة العالمية
    window.sdmSaveSettings = saveSettings;
    window.sdmLoadSettings = loadSettings;
})();