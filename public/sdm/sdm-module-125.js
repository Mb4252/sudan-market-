// public/sdm/sdm-module-125.js
(function() {
    'use strict';

    // دالة لتخزين إعدادات المستخدم في localStorage
    function saveUserSettings(settings) {
        try {
            if (!settings || typeof settings !== 'object') {
                throw new Error('Invalid settings object');
            }

            localStorage.setItem('userSettings', JSON.stringify(settings));
            return true;
        } catch (e) {
            console.error('Error saving user settings:', e);
            return false;
        }
    }

    // دالة لتحميل إعدادات المستخدم من localStorage
    function loadUserSettings() {
        try {
            const settings = localStorage.getItem('userSettings');
            return settings ? JSON.parse(settings) : {};
        } catch (e) {
            console.error('Error loading user settings:', e);
            return {};
        }
    }

    // تطبيق إعدادات المستخدم على الواجهة
    function applyUserSettings() {
        const settings = loadUserSettings();
        if (settings.theme) {
            document.body.className = settings.theme;
        }
    }

    // تهيئة الوحدة
    function init() {
        applyUserSettings();
        
        // إضافة مستمع لاختيار الوضع
        const themeSelector = document.getElementById('theme-selector');
        if (themeSelector) {
            themeSelector.addEventListener('change', function() {
                const settings = { theme: this.value };
                saveUserSettings(settings);
                applyUserSettings();
            });
        }
    }

    // تشغيل التهيئة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // تصدير الدوال العامة
    window.sdmModule125 = {
        saveUserSettings,
        loadUserSettings,
        applyUserSettings
    };
})();