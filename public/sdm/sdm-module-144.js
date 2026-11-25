// sdm-module-144.js
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
    function applyUserSettings() {
        const settings = loadUserSettings();
        document.body.className = settings.theme;
        const themeSelector = document.getElementById('theme-selector');
        if (themeSelector) {
            themeSelector.value = settings.theme;
        }
    }

    // تهيئة الوحدة
    function init() {
        try {
            // تطبيق الإعدادات عند التحميل
            applyUserSettings();

            // إضافة مستمع لتغيير الوضع
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.addEventListener('change', function() {
                    saveUserSettings({ theme: this.value });
                    applyUserSettings();
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

    // تصدير الدوال العامة
    window.sdmUserSettings = {
        load: loadUserSettings,
        save: saveUserSettings,
        apply: applyUserSettings
    };
})();