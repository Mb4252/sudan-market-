// public/sdm/sdm-module-128.js
(function() {
    'use strict';

    // دالة لتطبيق إعدادات المستخدم على الواجهة
    function applyUserSettings() {
        try {
            const settings = JSON.parse(localStorage.getItem('userSettings')) || {
                theme: 'light',
                notifications: true
            };

            const body = document.body;
            const themeSelector = document.getElementById('theme-selector');

            if (body) {
                body.className = settings.theme;
            }

            if (themeSelector) {
                themeSelector.value = settings.theme;
                themeSelector.addEventListener('change', function() {
                    const newSettings = {
                        theme: this.value,
                        notifications: settings.notifications
                    };
                    localStorage.setItem('userSettings', JSON.stringify(newSettings));
                    applyUserSettings();
                });
            }
        } catch (error) {
            console.error('Error applying user settings:', error);
        }
    }

    // تطبيق الإعدادات عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', applyUserSettings);

    // تصدير الدالة العامة
    window.applyUserSettings = applyUserSettings;
})();