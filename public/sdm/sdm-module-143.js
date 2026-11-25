// public/sdm/sdm-module-143.js
(function() {
    'use strict';

    try {
        // التحقق من وجود localStorage
        if (typeof Storage === 'undefined') {
            console.error('localStorage is not supported in this browser');
            return;
        }

        // دالة لحفظ إعدادات المستخدم
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

        // دالة لجلب إعدادات المستخدم
        function getUserSettings() {
            try {
                const settings = localStorage.getItem('userSettings');
                return settings ? JSON.parse(settings) : {};
            } catch (error) {
                console.error('Error getting user settings:', error);
                return {};
            }
        }

        // دالة لتحديث واجهة المستخدم
        function updateUI() {
            const settings = getUserSettings();

            // تحديث العناصر في الواجهة
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector && settings.theme) {
                themeSelector.value = settings.theme;
                document.body.className = settings.theme;
            }
        }

        // تحديث واجهة المستخدم عند تحميل الصفحة
        document.addEventListener('DOMContentLoaded', updateUI);

        // تحديث الإعدادات عند تغييرها
        const themeSelector = document.getElementById('theme-selector');
        if (themeSelector) {
            themeSelector.addEventListener('change', function() {
                const settings = {
                    theme: this.value
                };
                saveUserSettings(settings);
                document.body.className = this.value;
            });
        }
    } catch (error) {
        console.error('Error in sdm-module-143:', error);
    }
})();
