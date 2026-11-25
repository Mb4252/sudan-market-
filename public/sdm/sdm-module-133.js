// public/sdm/sdm-module-133.js
(function() {
    'use strict';

    try {
        // دالة لتخزين وإسترجاع إعدادات المستخدم في localStorage
        function manageUserSettings() {
            const settingsKey = 'userSettings';
            const themeSelector = document.getElementById('theme-selector');
            const body = document.body;

            // تحميل الإعدادات المحفوظة
            const savedSettings = localStorage.getItem(settingsKey);
            if (savedSettings) {
                const settings = JSON.parse(savedSettings);
                if (settings.theme) {
                    body.className = settings.theme;
                    if (themeSelector) {
                        themeSelector.value = settings.theme;
                    }
                }
            }

            // تحديث الإعدادات عند تغيير الوضع
            if (themeSelector) {
                themeSelector.addEventListener('change', function() {
                    const newTheme = this.value;
                    body.className = newTheme;
                    localStorage.setItem(settingsKey, JSON.stringify({ theme: newTheme }));
                });
            }
        }

        // تنفيذ الوظيفة عند تحميل الصفحة
        document.addEventListener('DOMContentLoaded', manageUserSettings);
    } catch (e) {
        console.error('Error in sdm-module-133:', e);
    }
})();