// public/sdm/sdm-module-74.js
(function() {
    'use strict';

    // مفتاح تخزين إعدادات المستخدم في localStorage
    const USER_SETTINGS_KEY = 'sdmUserSettings';

    // دالة لتحميل إعدادات المستخدم
    function loadUserSettings() {
        try {
            const settings = localStorage.getItem(USER_SETTINGS_KEY);
            return settings ? JSON.parse(settings) : { name: '', theme: 'light' };
        } catch (e) {
            console.error('Error loading user settings:', e);
            return { name: '', theme: 'light' };
        }
    }

    // دالة لحفظ إعدادات المستخدم
    function saveUserSettings(settings) {
        try {
            localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(settings));
            return true;
        } catch (e) {
            console.error('Error saving user settings:', e);
            return false;
        }
    }

    // تحديث واجهة المستخدم بناءً على الإعدادات
    function updateUI() {
        const settings = loadUserSettings();
        const nameInput = document.getElementById('sdm-name');

        if (nameInput) {
            nameInput.value = settings.name;
            nameInput.addEventListener('change', function() {
                saveUserSettings({ ...settings, name: this.value });
            });
        }

        // تطبيق الثيم
        document.body.className = settings.theme;
    }

    // تنفيذ عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            updateUI();
        } catch (e) {
            console.error('Error initializing SDM module 74:', e);
        }
    });

    // تصدير الدوال للوصول العالمي
    window.sdmModule74 = {
        loadUserSettings,
        saveUserSettings,
        updateUI
    };
})();