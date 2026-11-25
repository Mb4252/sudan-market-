// sdm-module-102.js
// وظيفة: تخزين وتحميل إعدادات المستخدم في localStorage

(function() {
    'use strict';

    // مفتاح تخزين localStorage
    const USER_SETTINGS_KEY = 'sdmUserSettings';

    // إعدادات افتراضية
    const DEFAULT_SETTINGS = {
        theme: 'light',
        notifications: false
    };

    // حفظ إعدادات المستخدم
    function saveUserSettings(settings) {
        try {
            const currentSettings = getUserSettings();
            const updatedSettings = { ...currentSettings, ...settings };
            localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(updatedSettings));
            return true;
        } catch (error) {
            console.error('Error saving user settings:', error);
            return false;
        }
    }

    // تحميل إعدادات المستخدم
    function getUserSettings() {
        try {
            const settings = localStorage.getItem(USER_SETTINGS_KEY);
            return settings ? JSON.parse(settings) : DEFAULT_SETTINGS;
        } catch (error) {
            console.error('Error getting user settings:', error);
            return DEFAULT_SETTINGS;
        }
    }

    // تحديث واجهة المستخدم بالإعدادات المحفوظة
    function updateUIWithSettings() {
        try {
            const settings = getUserSettings();

            // تحديث اختيار الثيم
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.value = settings.theme;
            }

            // تحديث حالة التنبيهات
            const notificationsToggle = document.getElementById('notifications-toggle');
            if (notificationsToggle) {
                notificationsToggle.checked = settings.notifications;
            }

            // تطبيق الثيم على الجسم
            document.body.className = settings.theme;
        } catch (error) {
            console.error('Error updating UI with settings:', error);
        }
    }

    // تهيئة الوحدة
    function init() {
        try {
            // تحديث واجهة المستخدم عند التحميل
            updateUIWithSettings();

            // إضافة مستمعين للأحداث
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.addEventListener('change', function() {
                    saveUserSettings({ theme: this.value });
                    updateUIWithSettings();
                });
            }

            const notificationsToggle = document.getElementById('notifications-toggle');
            if (notificationsToggle) {
                notificationsToggle.addEventListener('change', function() {
                    saveUserSettings({ notifications: this.checked });
                });
            }
        } catch (error) {
            console.error('Error initializing module:', error);
        }
    }

    // بدء التهيئة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // تصدير الوظائف العامة
    window.sdmUserSettings = {
        save: saveUserSettings,
        get: getUserSettings,
        updateUI: updateUIWithSettings
    };
})();