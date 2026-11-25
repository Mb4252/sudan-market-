// public/sdm/sdm-module-155.js
(function() {
    'use strict';

    // دالة لتخزين إعدادات المستخدم في localStorage
    function saveUserSettings(settings) {
        try {
            if (!settings || typeof settings !== 'object') {
                console.error('Invalid settings object');
                return false;
            }

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
            const settings = localStorage.getItem('sdmUserSettings');
            return settings ? JSON.parse(settings) : {};
        } catch (error) {
            console.error('Error getting user settings:', error);
            return {};
        }
    }

    // دالة لتحديث واجهة المستخدم بناءً على الإعدادات
    function updateUIFromSettings() {
        const settings = getUserSettings();
        const themeSelector = document.getElementById('theme-selector');

        if (themeSelector && settings.theme) {
            themeSelector.value = settings.theme;
            document.body.className = settings.theme;
        }
    }

    // دالة لتغيير الوضع (الوضع الفاتح/الوضع الداكن)
    function changeTheme(theme) {
        const settings = getUserSettings();
        settings.theme = theme;
        saveUserSettings(settings);
        updateUIFromSettings();
    }

    // تهيئة الواجهة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            updateUIFromSettings();

            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.addEventListener('change', function() {
                    changeTheme(this.value);
                });
            }
        } catch (error) {
            console.error('Error initializing UI:', error);
        }
    });

    // تصدير الدوال العامة
    window.sdmUserSettings = {
        save: saveUserSettings,
        get: getUserSettings,
        updateUI: updateUIFromSettings,
        changeTheme: changeTheme
    };
})();