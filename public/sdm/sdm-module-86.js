// public/sdm/sdm-module-86.js
(function() {
    'use strict';

    // دالة لتخزين وتحميل إعدادات المستخدم في localStorage
    function manageUserSettings() {
        const themeSelector = document.getElementById('theme-selector');
        const notificationsToggle = document.getElementById('notifications-toggle');

        if (!themeSelector || !notificationsToggle) return;

        // تحميل الإعدادات المحفوظة
        try {
            const savedTheme = localStorage.getItem('sdm-theme');
            const savedNotifications = localStorage.getItem('sdm-notifications');

            if (savedTheme) {
                themeSelector.value = savedTheme;
                document.body.className = savedTheme;
            }

            if (savedNotifications !== null) {
                notificationsToggle.checked = savedNotifications === 'true';
            }
        } catch (e) {
            console.error('Error loading settings:', e);
        }

        // حفظ الإعدادات عند التغيير
        themeSelector.addEventListener('change', function() {
            try {
                localStorage.setItem('sdm-theme', this.value);
                document.body.className = this.value;
            } catch (e) {
                console.error('Error saving theme:', e);
            }
        });

        notificationsToggle.addEventListener('change', function() {
            try {
                localStorage.setItem('sdm-notifications', this.checked);
            } catch (e) {
                console.error('Error saving notifications setting:', e);
            }
        });
    }

    // تنفيذ الدالة عند تحميل الصفحة
    window.addEventListener('DOMContentLoaded', manageUserSettings);
})();