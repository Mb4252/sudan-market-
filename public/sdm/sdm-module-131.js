// public/sdm/sdm-module-131.js
(function() {
    'use strict';

    // دالة لتخزين إعدادات المستخدم في localStorage
    function saveUserSettings(settings) {
        try {
            if (!settings || typeof settings !== 'object') {
                throw new Error('Invalid settings object');
            }

            const settingsJson = JSON.stringify(settings);
            localStorage.setItem('sdmUserSettings', settingsJson);
            return true;
        } catch (error) {
            console.error('Error saving user settings:', error);
            return false;
        }
    }

    // دالة لجلب إعدادات المستخدم من localStorage
    function getUserSettings() {
        try {
            const settingsJson = localStorage.getItem('sdmUserSettings');
            return settingsJson ? JSON.parse(settingsJson) : {};
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

    // دالة لتحديث الإعدادات عند تغييرها
    function setupThemeChangeListener() {
        const themeSelector = document.getElementById('theme-selector');
        if (themeSelector) {
            themeSelector.addEventListener('change', function() {
                const settings = { theme: this.value };
                saveUserSettings(settings);
                updateUIFromSettings();
            });
        }
    }

    // تهيئة الواجهة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            updateUIFromSettings();
            setupThemeChangeListener();
        } catch (error) {
            console.error('Error initializing UI:', error);
        }
    });

    // تصدير الدوال العامة
    window.sdmUserSettings = {
        save: saveUserSettings,
        get: getUserSettings,
        updateUI: updateUIFromSettings
    };
})();