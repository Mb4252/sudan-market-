// sdm-module-152.js
// وظيفة: حفظ وتحميل إعدادات المستخدم في واجهة SDM

(function() {
    'use strict';

    // مفتاح تخزين localStorage
    const USER_SETTINGS_KEY = 'sdmUserSettings';

    // دالة لحفظ إعدادات المستخدم
    function saveUserSettings(settings) {
        try {
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
            return settings ? JSON.parse(settings) : null;
        } catch (error) {
            console.error('Error loading user settings:', error);
            return null;
        }
    }

    // دالة لتطبيق إعدادات المستخدم على الواجهة
    function applyUserSettings() {
        const settings = loadUserSettings();
        if (settings) {
            // تطبيق الوضع (light/dark)
            if (settings.theme) {
                document.body.className = settings.theme;
                const themeSelector = document.getElementById('theme-selector');
                if (themeSelector) {
                    themeSelector.value = settings.theme;
                }
            }

            // تطبيق هوية المستخدم
            if (settings.userName) {
                const nameInput = document.getElementById('sdm-name');
                if (nameInput) {
                    nameInput.value = settings.userName;
                }
            }
        }
    }

    // تهيئة الواجهة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            applyUserSettings();

            // إضافة مستمع حدث لتغيير الوضع
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.addEventListener('change', function() {
                    const settings = loadUserSettings() || {};
                    settings.theme = this.value;
                    saveUserSettings(settings);
                    applyUserSettings();
                });
            }

            // إضافة مستمع حدث لتغيير هوية المستخدم
            const nameInput = document.getElementById('sdm-name');
            if (nameInput) {
                nameInput.addEventListener('change', function() {
                    const settings = loadUserSettings() || {};
                    settings.userName = this.value;
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
        load: loadUserSettings,
        apply: applyUserSettings
    };
})();