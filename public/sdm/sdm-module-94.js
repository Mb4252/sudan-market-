// public/sdm/sdm-module-94.js
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

    // دالة لتحديث واجهة المستخدم بناءً على الإعدادات
    function updateUIFromSettings() {
        const settings = getUserSettings();

        // تحديث الوضع (فاتح/داكن)
        if (settings.theme) {
            document.body.className = settings.theme;
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.value = settings.theme;
            }
        }

        // تحديث إعداد التنبيهات
        if (settings.notifications !== undefined) {
            const notificationsToggle = document.getElementById('notifications-toggle');
            if (notificationsToggle) {
                notificationsToggle.checked = settings.notifications;
            }
        }
    }

    // تهيئة الواجهة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            updateUIFromSettings();

            // إضافة مستمعين للأحداث
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.addEventListener('change', function() {
                    saveUserSettings({
                        theme: this.value,
                        notifications: document.getElementById('notifications-toggle').checked
                    });
                });
            }

            const notificationsToggle = document.getElementById('notifications-toggle');
            if (notificationsToggle) {
                notificationsToggle.addEventListener('change', function() {
                    saveUserSettings({
                        theme: document.getElementById('theme-selector').value,
                        notifications: this.checked
                    });
                });
            }
        } catch (error) {
            console.error('Error initializing UI:', error);
        }
    });

    // تصدير الدوال العامة
    window.sdmUserSettings = {
        save: saveUserSettings,
        get: getUserSettings,
        updateUI: updateUIFromSettings
    };
})();