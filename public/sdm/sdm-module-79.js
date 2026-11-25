// public/sdm/sdm-module-79.js
(function() {
    'use strict';

    // إعدادات المستخدم الافتراضية
    const DEFAULT_SETTINGS = {
        name: '',
        theme: 'light',
        notifications: true
    };

    // مفتاح تخزين localStorage
    const STORAGE_KEY = 'sdmUserSettings';

    // دالة لحفظ إعدادات المستخدم
    function saveUserSettings(settings) {
        try {
            const mergedSettings = { ...DEFAULT_SETTINGS, ...settings };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedSettings));
            return true;
        } catch (error) {
            console.error('Error saving user settings:', error);
            return false;
        }
    }

    // دالة لجلب إعدادات المستخدم
    function getUserSettings() {
        try {
            const settings = localStorage.getItem(STORAGE_KEY);
            return settings ? JSON.parse(settings) : DEFAULT_SETTINGS;
        } catch (error) {
            console.error('Error getting user settings:', error);
            return DEFAULT_SETTINGS;
        }
    }

    // تحديث واجهة المستخدم بإعدادات المستخدم
    function updateUserInterface() {
        try {
            const settings = getUserSettings();
            const settingsElement = document.getElementById('user-settings');
            if (settingsElement) {
                settingsElement.textContent = `إعداداتك: ${settings.name}, ${settings.theme}, ${settings.notifications ? 'مفعل' : 'معطل'}`;
            }
        } catch (error) {
            console.error('Error updating user interface:', error);
        }
    }

    // تهيئة الواجهة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', updateUserInterface);

    // تصدير الدوال للوصول العالمي
    window.sdmUserSettings = {
        save: saveUserSettings,
        get: getUserSettings,
        updateUI: updateUserInterface
    };
})();
