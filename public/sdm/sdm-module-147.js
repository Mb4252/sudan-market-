// public/sdm/sdm-module-147.js
(function() {
    'use strict';

    // دالة لتخزين إعدادات المستخدم في localStorage
    function saveUserSettings(settings) {
        try {
            if (!settings || typeof settings !== 'object') {
                throw new Error('Invalid settings object');
            }

            // التحقق من وجود localStorage
            if (typeof localStorage === 'undefined') {
                throw new Error('localStorage is not available');
            }

            // تخزين الإعدادات
            localStorage.setItem('sdmUserSettings', JSON.stringify(settings));
            return true;
        } catch (error) {
            console.error('Error saving user settings:', error);
            return false;
        }
    }

    // دالة لجلب إعدادات المستخدم من localStorage
    function getUserSettings() {
        try {
            // التحقق من وجود localStorage
            if (typeof localStorage === 'undefined') {
                throw new Error('localStorage is not available');
            }

            // جلب الإعدادات
            const settings = localStorage.getItem('sdmUserSettings');
            return settings ? JSON.parse(settings) : null;
        } catch (error) {
            console.error('Error getting user settings:', error);
            return null;
        }
    }

    // دالة لتحديث واجهة المستخدم بناءً على الإعدادات المحفوظة
    function updateUIFromSettings() {
        try {
            const settings = getUserSettings();
            if (settings && settings.theme) {
                document.body.className = settings.theme;
            }
        } catch (error) {
            console.error('Error updating UI from settings:', error);
        }
    }

    // تحديث واجهة المستخدم عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', updateUIFromSettings);

    // ربط الدوال مع النافذة العالمية
    window.sdmSaveUserSettings = saveUserSettings;
    window.sdmGetUserSettings = getUserSettings;
    window.sdmUpdateUIFromSettings = updateUIFromSettings;
})();