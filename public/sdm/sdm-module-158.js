// sdm-module-158.js
// وظيفة: حفظ/تحميل إعدادات المستخدم في/من localStorage

(function() {
    'use strict';

    // مفتاح تخزين localStorage
    const USER_SETTINGS_KEY = 'sdmUserSettings';

    // إعدادات افتراضية
    const DEFAULT_SETTINGS = {
        theme: 'light',
        name: ''
    };

    // دالة حفظ الإعدادات
    function saveUserSettings(settings) {
        try {
            localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(settings));
            return true;
        } catch (e) {
            console.error('Error saving user settings:', e);
            return false;
        }
    }

    // دالة تحميل الإعدادات
    function loadUserSettings() {
        try {
            const savedSettings = localStorage.getItem(USER_SETTINGS_KEY);
            return savedSettings ? JSON.parse(savedSettings) : DEFAULT_SETTINGS;
        } catch (e) {
            console.error('Error loading user settings:', e);
            return DEFAULT_SETTINGS;
        }
    }

    // دالة تحديث واجهة المستخدم بالإعدادات
    function updateUIWithSettings(settings) {
        const themeSelector = document.getElementById('theme-selector');
        const nameInput = document.getElementById('sdm-name');

        if (themeSelector && nameInput) {
            themeSelector.value = settings.theme;
            nameInput.value = settings.name;
            document.body.className = settings.theme;
        }
    }

    // تهيئة الإعدادات عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            const settings = loadUserSettings();
            updateUIWithSettings(settings);

            // تحديث الإعدادات عند تغييرها
            const themeSelector = document.getElementById('theme-selector');
            const nameInput = document.getElementById('sdm-name');

            if (themeSelector) {
                themeSelector.addEventListener('change', function() {
                    const newSettings = {
                        theme: this.value,
                        name: nameInput ? nameInput.value : ''
                    };
                    saveUserSettings(newSettings);
                    updateUIWithSettings(newSettings);
                });
            }

            if (nameInput) {
                nameInput.addEventListener('change', function() {
                    const newSettings = {
                        theme: themeSelector ? themeSelector.value : 'light',
                        name: this.value
                    };
                    saveUserSettings(newSettings);
                });
            }
        } catch (e) {
            console.error('Error initializing user settings:', e);
        }
    });

    // تصدير الدوال للوصول العالمي
    window.sdmUserSettings = {
        save: saveUserSettings,
        load: loadUserSettings,
        updateUI: updateUIWithSettings
    };
})();