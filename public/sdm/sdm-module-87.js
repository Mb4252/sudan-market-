// public/sdm/sdm-module-87.js
(function() {
    'use strict';

    try {
        // دالة لتخزين وتحميل إعدادات المستخدم في localStorage
        function manageUserSettings() {
            const themeSelector = document.getElementById('theme-selector');
            const notificationsToggle = document.getElementById('notifications-toggle');

            if (!themeSelector || !notificationsToggle) return;

            // تحميل الإعدادات من localStorage
            const savedTheme = localStorage.getItem('sdm-theme') || 'light';
            const savedNotifications = localStorage.getItem('sdm-notifications') === 'true';

            // تطبيق الإعدادات
            themeSelector.value = savedTheme;
            notificationsToggle.checked = savedNotifications;

            // حفظ الإعدادات عند التغيير
            themeSelector.addEventListener('change', function() {
                localStorage.setItem('sdm-theme', this.value);
            });

            notificationsToggle.addEventListener('change', function() {
                localStorage.setItem('sdm-notifications', this.checked);
            });
        }

        // تنفيذ الدالة عند تحميل الصفحة
        document.addEventListener('DOMContentLoaded', manageUserSettings);
    } catch (e) {
        console.error('Error in sdm-module-87:', e);
    }
})();