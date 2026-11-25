// sdm-module-145.js
(function() {
    'use strict';

    // مفتاح تخزين إعدادات المستخدم
    const USER_SETTINGS_KEY = 'sdmUserSettings';

    // دالة لحفظ إعدادات المستخدم
    function saveUserSettings(settings) {
        try {
            if (!settings || typeof settings !== 'object') {
                throw new Error('Invalid settings object');
            }

            const { name, theme } = settings;
            if (!name || !theme) {
                throw new Error('Missing required fields');
            }

            localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify({
                name,
                theme
            }));
            return true;
        } catch (error) {
            console.error('Error saving user settings:', error);
            return false;
        }
    }

    // دالة لقراءة إعدادات المستخدم
    function getUserSettings() {
        try {
            const data = localStorage.getItem(USER_SETTINGS_KEY);
            return data ? JSON.parse(data) : { name: '', theme: 'light' };
        } catch (error) {
            console.error('Error reading user settings:', error);
            return { name: '', theme: 'light' };
        }
    }

    // دالة لتحديث واجهة المستخدم حسب إعدادات المستخدم
    function updateUIFromSettings(settings) {
        try {
            const nameInput = document.getElementById('sdm-name');
            const themeSelector = document.getElementById('theme-selector');
            const body = document.body;

            if (nameInput && themeSelector) {
                nameInput.value = settings.name;
                themeSelector.value = settings.theme;
                body.className = settings.theme;
            }
        } catch (error) {
            console.error('Error updating UI:', error);
        }
    }

    // تهيئة الواجهة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            const settings = getUserSettings();
            updateUIFromSettings(settings);

            // تحديث الإعدادات عند تغيير القيم
            const nameInput = document.getElementById('sdm-name');
            const themeSelector = document.getElementById('theme-selector');

            if (nameInput) {
                nameInput.addEventListener('change', function() {
                    saveUserSettings({
                        name: this.value,
                        theme: themeSelector.value
                    });
                });
            }

            if (themeSelector) {
                themeSelector.addEventListener('change', function() {
                    saveUserSettings({
                        name: nameInput.value,
                        theme: this.value
                    });
                    updateUIFromSettings({
                        name: nameInput.value,
                        theme: this.value
                    });
                });
            }
        } catch (error) {
            console.error('Initialization error:', error);
        }
    });

    // تصدير الدوال العامة
    window.sdmUserSettings = {
        save: saveUserSettings,
        get: getUserSettings,
        updateUI: updateUIFromSettings
    };
})();