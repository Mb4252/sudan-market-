// sdm-module-112.js
(function() {
    'use strict';

    // دالة لحفظ إعدادات المستخدم في localStorage
    function saveUserSettings(settings) {
        try {
            if (!settings || typeof settings !== 'object') {
                throw new Error('Invalid settings object');
            }

            const currentSettings = JSON.parse(localStorage.getItem('sdmUserSettings') || '{}');
            const updatedSettings = { ...currentSettings, ...settings };

            localStorage.setItem('sdmUserSettings', JSON.stringify(updatedSettings));
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
        try {
            const settings = getUserSettings();

            // تحديث وضع الواجهة (فاتح/داكن)
            if (settings.theme) {
                document.body.className = settings.theme;
                const themeSelector = document.getElementById('theme-selector');
                if (themeSelector) {
                    themeSelector.value = settings.theme;
                }
            }

            // تحديث إعدادات التنبيهات
            const notificationsToggle = document.getElementById('notifications-toggle');
            if (notificationsToggle) {
                notificationsToggle.checked = settings.notificationsEnabled || false;
            }
        } catch (error) {
            console.error('Error updating UI from settings:', error);
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
                    saveUserSettings({ theme: this.value });
                    updateUIFromSettings();
                });
            }

            const notificationsToggle = document.getElementById('notifications-toggle');
            if (notificationsToggle) {
                notificationsToggle.addEventListener('change', function() {
                    saveUserSettings({ notificationsEnabled: this.checked });
                });
            }
        } catch (error) {
            console.error('Initialization error:', error);
        }
    });

    // تصدير الدوال للوصول العالمي
    window.sdmUserSettings = {
        save: saveUserSettings,
        get: getUserSettings,
        updateUI: updateUIFromSettings
    };
})();