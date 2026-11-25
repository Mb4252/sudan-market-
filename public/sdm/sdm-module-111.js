// sdm-module-111.js
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

    // تحديث واجهة المستخدم بالإعدادات
    function updateUIWithSettings() {
        const settings = loadUserSettings();

        // تحديث وضع اللون
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

    // تهيئة الواجهة
    document.addEventListener('DOMContentLoaded', function() {
        updateUIWithSettings();

        // إضافة مستمعين للأحداث
        const themeSelector = document.getElementById('theme-selector');
        if (themeSelector) {
            themeSelector.addEventListener('change', function() {
                const settings = loadUserSettings();
                settings.theme = this.value;
                saveUserSettings(settings);
                document.body.className = this.value;
            });
        }

        const notificationsToggle = document.getElementById('notifications-toggle');
        if (notificationsToggle) {
            notificationsToggle.addEventListener('change', function() {
                const settings = loadUserSettings();
                settings.notifications = this.checked;
                saveUserSettings(settings);
            });
        }
    });

    // تصدير الوظائف
    window.sdmUserSettings = {
        load: loadUserSettings,
        save: saveUserSettings,
        updateUI: updateUIWithSettings
    };
})();