// public/sdm/sdm-module-119.js
(function() {
    'use strict';

    // دالة لتحديث واجهة المستخدم بناءً على الإعدادات
    function updateUIFromSettings() {
        try {
            const settings = getUserSettings();

            // تحديث الوضع (فاتح/داكن)
            if (settings.theme) {
                document.documentElement.setAttribute('data-theme', settings.theme);
            }

            // تحديث حالة التنبيهات
            const notificationsToggle = document.getElementById('notifications-toggle');
            if (notificationsToggle) {
                notificationsToggle.checked = settings.notifications || false;
            }
        } catch (error) {
            console.error('Error updating UI from settings:', error);
        }
    }

    // تحديث واجهة المستخدم عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', updateUIFromSettings);

    // تحديث الإعدادات عند تغيير القيم
    document.getElementById('theme-selector')?.addEventListener('change', function() {
        saveUserSettings({ theme: this.value });
    });

    document.getElementById('notifications-toggle')?.addEventListener('change', function() {
        saveUserSettings({ notifications: this.checked });
    });

    // تحديث واجهة المستخدم عند تغيير الإعدادات
    window.addEventListener('storage', function(e) {
        if (e.key === USER_SETTINGS_KEY) {
            updateUIFromSettings();
        }
    });

    // تحديث واجهة المستخدم فوراً
    updateUIFromSettings();
})();