// sdm-module-104.js
// وظيفة: تحديث واجهة المستخدم بالإعدادات المحفوظة

(function() {
    'use strict';

    // دالة لتحديث واجهة المستخدم بالإعدادات المحفوظة
    function updateUIWithSettings() {
        try {
            // استرجاع الإعدادات المحفوظة
            const savedSettings = window.sdmGetUserSettings();

            // تحديث واجهة المستخدم بالإعدادات المحفوظة
            if (savedSettings.theme) {
                document.body.className = savedSettings.theme;
                const themeSelector = document.getElementById('theme-selector');
                if (themeSelector) {
                    themeSelector.value = savedSettings.theme;
                }
            }

            if (savedSettings.notifications !== undefined) {
                const notificationsToggle = document.getElementById('notifications-toggle');
                if (notificationsToggle) {
                    notificationsToggle.checked = savedSettings.notifications;
                }
            }
        } catch (error) {
            console.error('Error updating UI with settings:', error);
        }
    }

    // تنفيذ عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            updateUIWithSettings();

            // إضافة مستمعين للأحداث
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.addEventListener('change', function() {
                    const settings = window.sdmGetUserSettings();
                    settings.theme = this.value;
                    window.sdmSaveUserSettings(settings);
                    updateUIWithSettings();
                });
            }

            const notificationsToggle = document.getElementById('notifications-toggle');
            if (notificationsToggle) {
                notificationsToggle.addEventListener('change', function() {
                    const settings = window.sdmGetUserSettings();
                    settings.notifications = this.checked;
                    window.sdmSaveUserSettings(settings);
                });
            }
        } catch (error) {
            console.error('Error in sdm-module-104:', error);
        }
    });

    // ربط الدالة مع النافذة العالمية
    window.sdmUpdateUIWithSettings = updateUIWithSettings;
})();