// public/sdm/sdm-module-192.js
(function() {
    'use strict';

    // إعدادات التوسعة
    const SETTINGS_KEY = 'sdmUserSettings';
    const DEFAULT_SETTINGS = {
        language: 'ar',
        fontSize: 'medium',
        theme: 'light'
    };

    // دالة تحميل الإعدادات
    function loadSettings() {
        try {
            const savedSettings = localStorage.getItem(SETTINGS_KEY);
            return savedSettings ? JSON.parse(savedSettings) : DEFAULT_SETTINGS;
        } catch (e) {
            console.error('Error loading settings:', e);
            return DEFAULT_SETTINGS;
        }
    }

    // دالة حفظ الإعدادات
    function saveSettings(settings) {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
            return true;
        } catch (e) {
            console.error('Error saving settings:', e);
            return false;
        }
    }

    // دالة تهيئة الواجهة
    function initUI() {
        const settings = loadSettings();

        // تحديث عناصر الواجهة إذا كانت موجودة
        if (document.getElementById('language-selector')) {
            document.getElementById('language-selector').value = settings.language;
        }

        if (document.getElementById('font-size-selector')) {
            document.getElementById('font-size-selector').value = settings.fontSize;
        }

        if (document.getElementById('theme-selector')) {
            document.getElementById('theme-selector').value = settings.theme;
        }
    }

    // تهيئة التوسعة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', initUI);

    // تصدير الدوال للوصول منها من خارج التوسعة
    window.sdmSettings = {
        load: loadSettings,
        save: saveSettings
    };
})();