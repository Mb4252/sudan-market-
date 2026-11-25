// sdm-module-92.js
// وظيفة: تخزين وتحميل إعدادات المستخدم في localStorage

(function() {
    'use strict';

    // مفتاح التخزين
    const USER_SETTINGS_KEY = 'sdmUserSettings';

    // دالة لتحميل الإعدادات
    function loadUserSettings() {
        try {
            const settings = localStorage.getItem(USER_SETTINGS_KEY);
            return settings ? JSON.parse(settings) : { theme: 'light', notifications: false };
        } catch (e) {
            console.error('Error loading user settings:', e);
            return { theme: 'light', notifications: false };
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

    // دالة لتحديث واجهة المستخدم بالإعدادات
    function updateUIWithSettings() {
        const settings = loadUserSettings();

        // تحديث المظهر
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

    // دالة لمعالجة تغيير الإعدادات
    function handleSettingsChange() {
        const themeSelector = document.getElementById('theme-selector');
        const notificationsToggle = document.getElementById('notifications-toggle');

        if (themeSelector && notificationsToggle) {
            themeSelector.addEventListener('change', function() {
                const settings = loadUserSettings();
                settings.theme = this.value;
                saveUserSettings(settings);
                updateUIWithSettings();
            });

            notificationsToggle.addEventListener('change', function() {
                const settings = loadUserSettings();
                settings.notifications = this.checked;
                saveUserSettings(settings);
            });
        }
    }

    // تهيئة الواجهة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            updateUIWithSettings();
            handleSettingsChange();
        } catch (e) {
            console.error('Error initializing user settings:', e);
        }
    });

    // تصدير الدوال العامة
    window.sdmUserSettings = {
        load: loadUserSettings,
        save: saveUserSettings,
        updateUI: updateUIWithSettings
    };
})();