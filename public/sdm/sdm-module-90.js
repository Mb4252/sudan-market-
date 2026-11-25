// sdm-module-90.js
(function() {
    'use strict';

    // دالة لحفظ إعدادات المستخدم في localStorage
    function saveUserSettings(settings) {
        try {
            if (!settings || typeof settings !== 'object') {
                console.error('Invalid settings object');
                return false;
            }

            localStorage.setItem('sdmUserSettings', JSON.stringify(settings));
            return true;
        } catch (error) {
            console.error('Error saving user settings:', error);
            return false;
        }
    }

    // دالة لجلب إعدادات المستخدم من localStorage
    function getUserSettings() {
        try {
            const settings = localStorage.getItem('sdmUserSettings');
            return settings ? JSON.parse(settings) : {};
        } catch (error) {
            console.error('Error getting user settings:', error);
            return {};
        }
    }

    // دالة لتحديث واجهة المستخدم بالإعدادات المحفوظة
    function updateUIWithSettings() {
        const settings = getUserSettings();

        // تحديث الوضع (فاتح/داكن)
        const themeSelector = document.getElementById('theme-selector');
        if (themeSelector && settings.theme) {
            themeSelector.value = settings.theme;
            document.body.className = settings.theme;
        }

        // تحديث حالة التنبيهات
        const notificationsToggle = document.getElementById('notifications-toggle');
        if (notificationsToggle && typeof settings.notificationsEnabled !== 'undefined') {
            notificationsToggle.checked = settings.notificationsEnabled;
        }
    }

    // تحديث الإعدادات عند تغيير القيم
    function setupSettingsListeners() {
        const themeSelector = document.getElementById('theme-selector');
        const notificationsToggle = document.getElementById('notifications-toggle');

        if (themeSelector) {
            themeSelector.addEventListener('change', function() {
                const settings = getUserSettings();
                settings.theme = this.value;
                saveUserSettings(settings);
                document.body.className = this.value;
            });
        }

        if (notificationsToggle) {
            notificationsToggle.addEventListener('change', function() {
                const settings = getUserSettings();
                settings.notificationsEnabled = this.checked;
                saveUserSettings(settings);
            });
        }
    }

    // تهيئة الوحدة
    function init() {
        try {
            updateUIWithSettings();
            setupSettingsListeners();
        } catch (error) {
            console.error('Error initializing SDM module 90:', error);
        }
    }

    // تنفيذ التهيئة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // تصدير الدوال العامة
    window.sdmModule90 = {
        saveUserSettings,
        getUserSettings,
        updateUIWithSettings
    };
})();