// public/sdm/sdm-module-140.js
(function() {
    'use strict';

    // مفتاح التخزين في localStorage
    const USER_SETTINGS_KEY = 'sdmUserSettings';

    // إعدادات افتراضية
    const DEFAULT_SETTINGS = {
        name: '',
        theme: 'light'
    };

    // دالة لتحميل الإعدادات
    function loadSettings() {
        try {
            const savedSettings = localStorage.getItem(USER_SETTINGS_KEY);
            return savedSettings ? JSON.parse(savedSettings) : DEFAULT_SETTINGS;
        } catch (e) {
            console.error('Error loading settings:', e);
            return DEFAULT_SETTINGS;
        }
    }

    // دالة لحفظ الإعدادات
    function saveSettings(settings) {
        try {
            localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(settings));
        } catch (e) {
            console.error('Error saving settings:', e);
        }
    }

    // دالة لتحديث الواجهة بناءً على الإعدادات
    function updateUI(settings) {
        document.body.className = settings.theme;
        const nameInput = document.getElementById('sdm-name');
        if (nameInput) {
            nameInput.value = settings.name;
        }
    }

    // دالة لتهيئة الوحدة
    function init() {
        try {
            const settings = loadSettings();
            updateUI(settings);

            // إضافة مستمعين للأحداث
            const nameInput = document.getElementById('sdm-name');
            const themeSelector = document.getElementById('theme-selector');

            if (nameInput) {
                nameInput.addEventListener('change', function() {
                    const newSettings = {...settings, name: this.value};
                    saveSettings(newSettings);
                });
            }

            if (themeSelector) {
                themeSelector.value = settings.theme;
                themeSelector.addEventListener('change', function() {
                    const newSettings = {...settings, theme: this.value};
                    saveSettings(newSettings);
                    updateUI(newSettings);
                });
            }
        } catch (e) {
            console.error('Error initializing module:', e);
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();