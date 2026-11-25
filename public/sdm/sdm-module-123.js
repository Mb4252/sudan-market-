// sdm-module-123.js
// وظيفة: إدارة إعدادات المستخدم في localStorage مع دعم التحديثات الفورية

(function(window, document) {
    'use strict';

    // مفتاح تخزين الإعدادات
    const USER_SETTINGS_KEY = 'sdmUserSettingsV2';

    // التحقق من وجود DOM
    if (!document || !document.getElementById) {
        throw new Error('DOM not available');
    }

    // دالة حفظ الإعدادات مع التحقق من صحة البيانات
    function saveUserSettings(settings) {
        try {
            if (!settings || typeof settings !== 'object') {
                throw new Error('Invalid settings object');
            }

            // التحقق من أنواع البيانات الأساسية
            if (settings.theme && typeof settings.theme !== 'string') {
                throw new Error('Invalid theme type');
            }

            localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(settings));
            return true;
        } catch (error) {
            console.error('Error saving settings:', error);
            return false;
        }
    }

    // دالة تحميل الإعدادات مع القيم الافتراضية
    function loadUserSettings() {
        try {
            const data = localStorage.getItem(USER_SETTINGS_KEY);
            return data ? JSON.parse(data) : {
                theme: 'light',
                notifications: true
            };
        } catch (error) {
            console.error('Error loading settings:', error);
            return {
                theme: 'light',
                notifications: true
            };
        }
    }

    // دالة تحديث الواجهة بناءً على الإعدادات
    function applySettings(settings) {
        try {
            const themeSelector = document.getElementById('theme-selector');
            const notificationsToggle = document.getElementById('notifications-toggle');

            if (themeSelector && settings.theme) {
                themeSelector.value = settings.theme;
                document.body.className = settings.theme;
            }

            if (notificationsToggle && settings.notifications !== undefined) {
                notificationsToggle.checked = settings.notifications;
            }

            return true;
        } catch (error) {
            console.error('Error applying settings:', error);
            return false;
        }
    }

    // تصدير الدوال إلى النافذة العالمية
    window.sdmModule123 = {
        saveUserSettings,
        loadUserSettings,
        applySettings
    };

    // تطبيق الإعدادات الحالية عند تحميل الملف
    try {
        const currentSettings = loadUserSettings();
        applySettings(currentSettings);
    } catch (error) {
        console.error('Failed to apply initial settings:', error);
    }

})(window, document);