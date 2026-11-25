// public/sdm/sdm-module-138.js
(function() {
    'use strict';

    // دالة لحفظ إعدادات المستخدم في localStorage
    function saveUserSettings(settings) {
        try {
            if (!settings || typeof settings !== 'object') {
                throw new Error('Invalid settings object');
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
            return settings ? JSON.parse(settings) : {};
        } catch (error) {
            console.error('Error getting user settings:', error);
            return {};
        }
    }

    // دالة لتحديث واجهة المستخدم بناءً على الإعدادات
    function updateUI() {
        const settings = getUserSettings();
        const themeSelector = document.getElementById('theme-selector');

        if (themeSelector) {
            themeSelector.value = settings.theme || 'light';
            document.body.className = settings.theme || 'light';
        }
    }

    // تهيئة الوحدة
    function init() {
        try {
            updateUI();

            // إضافة مستمعين للأحداث
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.addEventListener('change', function() {
                    saveUserSettings({ theme: this.value });
                    updateUI();
                });
            }
        } catch (error) {
            console.error('Error initializing user settings module:', error);
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
        save: saveUserSettings,
        get: getUserSettings,
        updateUI: updateUI
    };
})();