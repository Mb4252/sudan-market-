// sdm-module-151.js
// وظيفة: تخزين وتحميل إعدادات المستخدم في localStorage

(function() {
    'use strict';

    // مفتاح التخزين
    const USER_SETTINGS_KEY = 'sdmUserSettings';

    // دالة لتحميل الإعدادات
    function loadUserSettings() {
        try {
            const settings = localStorage.getItem(USER_SETTINGS_KEY);
            return settings ? JSON.parse(settings) : { theme: 'light' };
        } catch (e) {
            console.error('Error loading user settings:', e);
            return { theme: 'light' };
        }
    }

    // دالة لحفظ الإعدادات
    function saveUserSettings(settings) {
        try {
            localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(settings));
            return true;
        } catch (e) {
            console.error('Error saving user settings:', e);
            return false;
        }
    }

    // تحديث واجهة المستخدم حسب الإعدادات
    function updateUI(settings) {
        const body = document.body;
        if (body) {
            body.className = settings.theme;
        }

        const themeSelector = document.getElementById('theme-selector');
        if (themeSelector) {
            themeSelector.value = settings.theme;
        }
    }

    // تهيئة الوحدة
    function init() {
        try {
            // تحميل الإعدادات
            const settings = loadUserSettings();

            // تحديث واجهة المستخدم
            updateUI(settings);

            // إضافة مستمع للاختيار
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.addEventListener('change', function() {
                    const newSettings = { theme: this.value };
                    saveUserSettings(newSettings);
                    updateUI(newSettings);
                });
            }
        } catch (e) {
            console.error('Error initializing user settings module:', e);
        }
    }

    // بدء التهيئة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();