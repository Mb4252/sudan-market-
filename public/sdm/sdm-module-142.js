// public/sdm/sdm-module-142.js
(function() {
    'use strict';

    // دالة لتخزين إعدادات المستخدم في localStorage
    function saveUserSettings(settings) {
        try {
            if (!settings || typeof settings !== 'object') {
                console.error('Invalid settings object');
                return false;
            }

            // التحقق من وجود localStorage
            if (typeof localStorage === 'undefined') {
                console.error('localStorage is not available');
                return false;
            }

            // تخزين الإعدادات
            localStorage.setItem('userSettings', JSON.stringify(settings));
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
                console.error('localStorage is not available');
                return null;
            }

            // جلب الإعدادات
            const settings = localStorage.getItem('userSettings');
            return settings ? JSON.parse(settings) : null;
        } catch (error) {
            console.error('Error getting user settings:', error);
            return null;
        }
    }

    // دالة لتطبيق إعدادات المستخدم على الواجهة
    function applyUserSettings() {
        try {
            const settings = getUserSettings();
            if (!settings) return;

            // تطبيق إعداد الوضع (light/dark)
            if (settings.theme) {
                document.body.className = settings.theme;
            }
        } catch (error) {
            console.error('Error applying user settings:', error);
        }
    }

    // تهيئة الإعدادات عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            // تطبيق الإعدادات عند التحميل
            applyUserSettings();

            // تحديث الإعدادات عند تغييرها
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.addEventListener('change', function() {
                    saveUserSettings({ theme: this.value });
                    applyUserSettings();
                });
            }
        } catch (error) {
            console.error('Initialization error:', error);
        }
    });

    // تصدير الدوال العامة
    window.sdmModule142 = {
        saveUserSettings,
        getUserSettings,
        applyUserSettings
    };
})();