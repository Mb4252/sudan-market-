// public/sdm/sdm-module-72.js
(function() {
    'use strict';

    try {
        // دالة لحفظ إعدادات المستخدم في localStorage
        function saveUserSettings(settings) {
            if (!settings || typeof settings !== 'object') {
                console.error('Invalid settings object');
                return false;
            }

            try {
                localStorage.setItem('sdmUserSettings', JSON.stringify(settings));
                return true;
            } catch (error) {
                console.error('Error saving user settings:', error);
                return false;
            }
        }

        // دالة لاسترجاع إعدادات المستخدم من localStorage
        function getUserSettings() {
            try {
                const settings = localStorage.getItem('sdmUserSettings');
                return settings ? JSON.parse(settings) : {};
            } catch (error) {
                console.error('Error getting user settings:', error);
                return {};
            }
        }

        // دالة لتحديث واجهة المستخدم بالإعدادات المحفوظة
        function updateUIWithSettings() {
            const settings = getUserSettings();
            const nameInput = document.getElementById('sdm-name');
            if (nameInput && settings.name) {
                nameInput.value = settings.name;
            }
        }

        // دالة لحفظ الإعدادات عند تغيير الحقل
        function setupSettingsListener() {
            const nameInput = document.getElementById('sdm-name');
            if (nameInput) {
                nameInput.addEventListener('change', function() {
                    saveUserSettings({ name: this.value });
                });
            }
        }

        // تنفيذ الوظائف عند تحميل الصفحة
        document.addEventListener('DOMContentLoaded', function() {
            updateUIWithSettings();
            setupSettingsListener();
        });
    } catch (error) {
        console.error('Error in sdm-module-72:', error);
    }
})();