// public/sdm/sdm-module-124.js
(function() {
    'use strict';

    // دالة لحفظ إعدادات المستخدم في localStorage
    function saveUserSettings(settings) {
        try {
            if (!settings || typeof settings !== 'object') {
                console.error('Invalid settings object');
                return false;
            }

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
            const settings = localStorage.getItem('userSettings');
            return settings ? JSON.parse(settings) : {};
        } catch (error) {
            console.error('Error getting user settings:', error);
            return {};
        }
    }

    // دالة لتحديث الواجهة بناءً على إعدادات المستخدم
    function updateUIFromSettings() {
        try {
            const settings = getUserSettings();
            const themeSelector = document.getElementById('theme-selector');

            if (themeSelector && settings.theme) {
                themeSelector.value = settings.theme;
                document.body.className = settings.theme;
            }
        } catch (error) {
            console.error('Error updating UI from settings:', error);
        }
    }

    // تهيئة الواجهة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            const themeSelector = document.getElementById('theme-selector');

            if (themeSelector) {
                // تحديث الواجهة عند تغيير الوضع
                themeSelector.addEventListener('change', function() {
                    const settings = { theme: this.value };
                    saveUserSettings(settings);
                    updateUIFromSettings();
                });

                // تحديث الواجهة عند التحميل الأول
                updateUIFromSettings();
            }
        } catch (error) {
            console.error('Error initializing UI:', error);
        }
    });

    // تصدير الدوال للوصول العام
    window.sdmModule124 = {
        saveUserSettings,
        getUserSettings,
        updateUIFromSettings
    };
})();