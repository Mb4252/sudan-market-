// public/sdm/sdm-module-154.js
(function() {
    'use strict';

    try {
        // التحقق من وجود localStorage
        if (typeof Storage === 'undefined') {
            console.error('localStorage is not supported in this browser');
            return;
        }

        // دالة لحفظ إعدادات المستخدم في localStorage
        function saveUserSettings(settings) {
            if (!settings || typeof settings !== 'object') {
                console.error('Invalid settings object');
                return false;
            }

            try {
                localStorage.setItem('userSettings', JSON.stringify(settings));
                return true;
            } catch (error) {
                console.error('Error saving user settings:', error);
                return false;
            }
        }

        // دالة لجلب إعدادات المستخدم من localStorage
        function getUserSettings() {
            try {
                const settings = localStorage.getItem('userSettings');
                return settings ? JSON.parse(settings) : {};
            } catch (error) {
                console.error('Error getting user settings:', error);
                return {};
            }
        }

        // دالة لتحديث واجهة المستخدم بناءً على الإعدادات
        function updateUIFromSettings() {
            const settings = getUserSettings();
            const themeSelector = document.getElementById('theme-selector');

            if (themeSelector) {
                themeSelector.value = settings.theme || 'light';
                document.body.className = settings.theme || 'light';
            }
        }

        // تحديث واجهة المستخدم عند تحميل الصفحة
        document.addEventListener('DOMContentLoaded', updateUIFromSettings);

        // تحديث الإعدادات عند تغيير الوضع
        document.addEventListener('change', function(event) {
            if (event.target.id === 'theme-selector') {
                const newSettings = {
                    theme: event.target.value
                };
                saveUserSettings(newSettings);
                document.body.className = event.target.value;
            }
        });

    } catch (error) {
        console.error('Error in sdm-module-154:', error);
    }
})();