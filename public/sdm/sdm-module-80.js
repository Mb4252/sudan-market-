// sdm-module-80.js
// نظام تخزين وإسترجاع إعدادات المستخدم في localStorage

(function() {
    'use strict';

    // مفتاح التخزين
    const USER_SETTINGS_KEY = 'sdmUserSettings';

    // دالة لحفظ الإعدادات
    function saveUserSettings(settings) {
        try {
            if (!settings || typeof settings !== 'object') {
                console.error('Invalid settings object');
                return false;
            }

            localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(settings));
            return true;
        } catch (error) {
            console.error('Error saving user settings:', error);
            return false;
        }
    }

    // دالة لاسترجاع الإعدادات
    function getUserSettings() {
        try {
            const data = localStorage.getItem(USER_SETTINGS_KEY);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('Error getting user settings:', error);
            return {};
        }
    }

    // دالة لتحديث واجهة المستخدم بالإعدادات
    function updateUIWithSettings() {
        const settings = getUserSettings();
        const settingsElement = document.getElementById('user-settings');

        if (settingsElement && settings) {
            settingsElement.innerHTML = `
                <h3>إعداداتك</h3>
                <p>الاسم: ${settings.name || 'غير محدد'}</p>
                <p>اللغة: ${settings.language || 'العربية'}</p>
                <p>الوضع الليلي: ${settings.darkMode ? 'مفعل' : 'غير مفعل'}</p>
            `;
        }
    }

    // تهيئة النظام
    function init() {
        updateUIWithSettings();

        // مثال على حفظ إعدادات افتراضية
        if (!getUserSettings().name) {
            saveUserSettings({
                name: 'مستخدم جديد',
                language: 'العربية',
                darkMode: false
            });
        }
    }

    // تنفيذ التهيئة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // تصدير الدوال للوصول العام
    window.sdmSettings = {
        save: saveUserSettings,
        get: getUserSettings,
        updateUI: updateUIWithSettings
    };
})();