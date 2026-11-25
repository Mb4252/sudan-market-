// sdm-module-96.js
(function() {
    'use strict';

    // دالة لتحميل إعدادات المستخدم من localStorage
    function loadUserSettings() {
        try {
            const settings = localStorage.getItem('sdmUserSettings');
            return settings ? JSON.parse(settings) : { theme: 'light', notifications: false };
        } catch (e) {
            console.error('Error loading user settings:', e);
            return { theme: 'light', notifications: false };
        }
    }

    // دالة لتطبيق إعدادات المستخدم على الواجهة
    function applyUserSettings() {
        try {
            const settings = loadUserSettings();

            // تطبيق الوضع (فاتح/داكن)
            document.body.className = settings.theme === 'dark' ? 'dark-theme' : 'light-theme';

            // تفعيل/تعطيل التنبيهات
            const notificationsToggle = document.getElementById('notifications-toggle');
            if (notificationsToggle) {
                notificationsToggle.checked = settings.notifications;
            }

            // تحديث اختيار الوضع في القائمة المنسدلة
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.value = settings.theme;
            }
        } catch (e) {
            console.error('Error applying user settings:', e);
        }
    }

    // دالة لتحديث إعدادات المستخدم عند التغيير
    function setupSettingsListeners() {
        try {
            const themeSelector = document.getElementById('theme-selector');
            const notificationsToggle = document.getElementById('notifications-toggle');

            if (themeSelector) {
                themeSelector.addEventListener('change', function() {
                    const settings = loadUserSettings();
                    settings.theme = this.value;
                    localStorage.setItem('sdmUserSettings', JSON.stringify(settings));
                    applyUserSettings();
                });
            }

            if (notificationsToggle) {
                notificationsToggle.addEventListener('change', function() {
                    const settings = loadUserSettings();
                    settings.notifications = this.checked;
                    localStorage.setItem('sdmUserSettings', JSON.stringify(settings));
                });
            }
        } catch (e) {
            console.error('Error setting up settings listeners:', e);
        }
    }

    // تنفيذ الدوال عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        applyUserSettings();
        setupSettingsListeners();
    });

    // تصدير الدوال للوصول منها من خارج هذا الملف
    window.sdmUserSettings = {
        load: loadUserSettings,
        apply: applyUserSettings
    };
})();