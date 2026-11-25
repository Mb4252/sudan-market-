// public/sdm/sdm-module-106.js
(function() {
    'use strict';

    // مفتاح تخزين إعدادات المستخدم
    const USER_SETTINGS_KEY = 'sdmUserSettings';

    // دالة لتحميل الإعدادات من localStorage
    function loadUserSettings() {
        try {
            const settings = localStorage.getItem(USER_SETTINGS_KEY);
            return settings ? JSON.parse(settings) : { theme: 'light', notifications: false };
        } catch (error) {
            console.error('Error loading user settings:', error);
            return { theme: 'light', notifications: false };
        }
    }

    // دالة لحفظ الإعدادات في localStorage
    function saveUserSettings(settings) {
        try {
            localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(settings));
            return true;
        } catch (error) {
            console.error('Error saving user settings:', error);
            return false;
        }
    }

    // تحديث واجهة المستخدم بالإعدادات
    function updateUIWithSettings() {
        const settings = loadUserSettings();

        // تحديث الوضع
        const themeSelector = document.getElementById('theme-selector');
        if (themeSelector) {
            themeSelector.value = settings.theme;
            document.body.className = settings.theme;
        }

        // تحديث التنبيهات
        const notificationsToggle = document.getElementById('notifications-toggle');
        if (notificationsToggle) {
            notificationsToggle.checked = settings.notifications;
        }
    }

    // تحديث الإعدادات عند تغيير القيم
    function setupEventListeners() {
        const themeSelector = document.getElementById('theme-selector');
        const notificationsToggle = document.getElementById('notifications-toggle');

        if (themeSelector) {
            themeSelector.addEventListener('change', function() {
                const settings = loadUserSettings();
                settings.theme = this.value;
                saveUserSettings(settings);
                updateUIWithSettings();
            });
        }

        if (notificationsToggle) {
            notificationsToggle.addEventListener('change', function() {
                const settings = loadUserSettings();
                settings.notifications = this.checked;
                saveUserSettings(settings);
            });
        }
    }

    // تهيئة الوحدة
    function init() {
        try {
            updateUIWithSettings();
            setupEventListeners();
        } catch (error) {
            console.error('Error initializing SDM module 106:', error);
        }
    }

    // تشغيل التهيئة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // تصدير الوظائف العامة
    window.sdmModule106 = {
        loadUserSettings,
        saveUserSettings,
        updateUIWithSettings
    };
})();
