// public/sdm/sdm-module-132.js
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
            return settings ? JSON.parse(settings) : null;
        } catch (error) {
            console.error('Error getting user settings:', error);
            return null;
        }
    }

    // دالة لتحديث واجهة المستخدم بناءً على الإعدادات
    function updateUIBasedOnSettings() {
        const settings = getUserSettings();
        if (!settings) return;

        // تحديث الوضع (light/dark)
        if (settings.theme) {
            document.body.className = settings.theme;
        }

        // تحديث اسم المستخدم في واجهة الدردشة
        const nameInput = document.getElementById('sdm-name');
        if (nameInput && settings.username) {
            nameInput.value = settings.username;
        }
    }

    // تهيئة الإعدادات عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            updateUIBasedOnSettings();

            // تحديث الإعدادات عند تغيير الوضع
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.addEventListener('change', function() {
                    const settings = getUserSettings() || {};
                    settings.theme = this.value;
                    saveUserSettings(settings);
                    updateUIBasedOnSettings();
                });
            }

            // تحديث الإعدادات عند تغيير اسم المستخدم
            const nameInput = document.getElementById('sdm-name');
            if (nameInput) {
                nameInput.addEventListener('change', function() {
                    const settings = getUserSettings() || {};
                    settings.username = this.value;
                    saveUserSettings(settings);
                });
            }
        } catch (error) {
            console.error('Error initializing user settings:', error);
        }
    });

    // تصدير الدوال العامة
    window.sdmUserSettings = {
        save: saveUserSettings,
        get: getUserSettings,
        updateUI: updateUIBasedOnSettings
    };
})();
