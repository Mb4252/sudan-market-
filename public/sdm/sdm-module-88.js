// public/sdm/sdm-module-88.js

/**
 * sdm-module-88.js
 * وظيفة: حفظ وتحميل إعدادات المستخدم في localStorage
 * التبعيات: localStorage, dom-date-guard.js
 */

(function() {
    'use strict';

    // مفتاح تخزين الإعدادات
    const SETTINGS_KEY = 'sdmUserSettings';

    // دالة لحفظ الإعدادات
    function saveSettings(settings) {
        try {
            if (!window.localStorage) {
                console.warn('localStorage غير متاح');
                return false;
            }
            
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
            return true;
        } catch (error) {
            console.error('خطأ في حفظ الإعدادات:', error);
            return false;
        }
    }

    // دالة لتحميل الإعدادات
    function loadSettings() {
        try {
            if (!window.localStorage) {
                console.warn('localStorage غير متاح');
                return null;
            }
            
            const settings = localStorage.getItem(SETTINGS_KEY);
            return settings ? JSON.parse(settings) : null;
        } catch (error) {
            console.error('خطأ في تحميل الإعدادات:', error);
            return null;
        }
    }

    // دالة لتطبيق الإعدادات على الواجهة
    function applySettings() {
        const settings = loadSettings();
        if (!settings) return;

        // تطبيق الوضع (فاتح/داكن)
        if (settings.theme) {
            document.body.classList.toggle('dark-theme', settings.theme === 'dark');
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) themeSelector.value = settings.theme;
        }

        // تطبيق إعداد التنبيهات
        if (typeof settings.notifications !== 'undefined') {
            const notificationsToggle = document.getElementById('notifications-toggle');
            if (notificationsToggle) notificationsToggle.checked = settings.notifications;
        }
    }

    // دالة لتحديث الإعدادات من الواجهة
    function updateSettingsFromUI() {
        const themeSelector = document.getElementById('theme-selector');
        const notificationsToggle = document.getElementById('notifications-toggle');

        const settings = {
            theme: themeSelector ? themeSelector.value : 'light',
            notifications: notificationsToggle ? notificationsToggle.checked : false
        };

        saveSettings(settings);
    }

    // تهيئة الواجهة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            // تطبيق الإعدادات المحفوظة
            applySettings();

            // إضافة مستمعين للأحداث
            const themeSelector = document.getElementById('theme-selector');
            const notificationsToggle = document.getElementById('notifications-toggle');

            if (themeSelector) {
                themeSelector.addEventListener('change', updateSettingsFromUI);
            }

            if (notificationsToggle) {
                notificationsToggle.addEventListener('change', updateSettingsFromUI);
            }
        } catch (error) {
            console.error('خطأ في تهيئة الواجهة:', error);
        }
    });

    // تصدير الوظائف إلى النافذة العالمية
    window.sdmModule88 = {
        saveSettings,
        loadSettings,
        applySettings
    };

})();