// sdm-module-157.js
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

    // تحديث واجهة المستخدم
    function updateUI() {
        const settings = loadUserSettings();
        document.body.className = settings.theme;
        const themeSelector = document.getElementById('theme-selector');
        if (themeSelector) {
            themeSelector.value = settings.theme;
        }
    }

    // تهيئة
    function init() {
        updateUI();

        // إضافة مستمع للاختيار
        const themeSelector = document.getElementById('theme-selector');
        if (themeSelector) {
            themeSelector.addEventListener('change', function() {
                const settings = { theme: this.value };
                saveUserSettings(settings);
                updateUI();
            });
        }
    }

    // تنفيذ عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();