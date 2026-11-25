// public/sdm/sdm-module-150.js
(function() {
    'use strict';

    // مفتاح تخزين إعدادات المستخدم
    const USER_SETTINGS_KEY = 'sdmUserSettings';

    // دالة لحفظ إعدادات المستخدم
    function saveUserSettings(settings) {
        try {
            if (!settings || typeof settings !== 'object') {
                throw new Error('Invalid settings object');
            }

            localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(settings));
            return true;
        } catch (error) {
            console.error('Error saving user settings:', error);
            return false;
        }
    }

    // دالة لتحميل إعدادات المستخدم
    function loadUserSettings() {
        try {
            const settings = localStorage.getItem(USER_SETTINGS_KEY);
            return settings ? JSON.parse(settings) : {};
        } catch (error) {
            console.error('Error loading user settings:', error);
            return {};
        }
    }

    // دالة لتطبيق إعدادات المستخدم على الواجهة
    function applyUserSettings() {
        try {
            const settings = loadUserSettings();

            // تطبيق الوضع (light/dark)
            if (settings.theme) {
                document.body.className = settings.theme;
                const themeSelector = document.getElementById('theme-selector');
                if (themeSelector) {
                    themeSelector.value = settings.theme;
                }
            }

            // تطبيق هوية المستخدم
            if (settings.username) {
                const nameInput = document.getElementById('sdm-name');
                if (nameInput) {
                    nameInput.value = settings.username;
                }
            }
        } catch (error) {
            console.error('Error applying user settings:', error);
        }
    }

    // تهيئة الواجهة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            // تطبيق الإعدادات عند التحميل
            applyUserSettings();

            // إضافة مستمع لتغيير الوضع
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.addEventListener('change', function() {
                    const settings = loadUserSettings();
                    settings.theme = this.value;
                    saveUserSettings(settings);
                    applyUserSettings();
                });
            }

            // إضافة مستمع لتغيير هوية المستخدم
            const nameInput = document.getElementById('sdm-name');
            if (nameInput) {
                nameInput.addEventListener('change', function() {
                    const settings = loadUserSettings();
                    settings.username = this.value;
                    saveUserSettings(settings);
                });
            }
        } catch (error) {
            console.error('Initialization error:', error);
        }
    });

    // تصدير الدوال العامة
    window.sdmUserSettings = {
        save: saveUserSettings,
        load: loadUserSettings,
        apply: applyUserSettings
    };
})();