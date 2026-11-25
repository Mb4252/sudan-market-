// public/sdm/sdm-module-224.js
(function() {
    'use strict';

    // دالة لتخزين وإسترجاع إعدادات المستخدم في SDM
    function manageUserSettings() {
        try {
            // التحقق من وجود عنصر DOM
            const settingsElement = document.getElementById('sdm-user-settings');
            if (!settingsElement) return;

            // المفتاح لتخزين الإعدادات في localStorage
            const SETTINGS_KEY = 'sdmUserSettings';

            // دالة لتحميل الإعدادات
            function loadSettings() {
                try {
                    const savedSettings = localStorage.getItem(SETTINGS_KEY);
                    return savedSettings ? JSON.parse(savedSettings) : {
                        theme: 'light',
                        notifications: true,
                        language: 'ar'
                    };
                } catch (e) {
                    console.error('Error loading settings:', e);
                    return {
                        theme: 'light',
                        notifications: true,
                        language: 'ar'
                    };
                }
            }

            // دالة لحفظ الإعدادات
            function saveSettings(settings) {
                try {
                    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
                } catch (e) {
                    console.error('Error saving settings:', e);
                }
            }

            // تهيئة الإعدادات
            let currentSettings = loadSettings();

            // تحديث واجهة المستخدم
            function updateUI() {
                if (safeSetTextContent) {
                    safeSetTextContent(settingsElement.querySelector('.theme-value'), currentSettings.theme);
                    safeSetTextContent(settingsElement.querySelector('.notifications-value'), currentSettings.notifications ? 'مفعل' : 'معطل');
                    safeSetTextContent(settingsElement.querySelector('.language-value'), currentSettings.language === 'ar' ? 'العربية' : 'English');
                }
            }

            // تحديث الإعدادات عند النقر على الأزرار
            settingsElement.addEventListener('click', (e) => {
                if (e.target.classList.contains('theme-toggle')) {
                    currentSettings.theme = currentSettings.theme === 'light' ? 'dark' : 'light';
                    saveSettings(currentSettings);
                    updateUI();
                } else if (e.target.classList.contains('notifications-toggle')) {
                    currentSettings.notifications = !currentSettings.notifications;
                    saveSettings(currentSettings);
                    updateUI();
                } else if (e.target.classList.contains('language-toggle')) {
                    currentSettings.language = currentSettings.language === 'ar' ? 'en' : 'ar';
                    saveSettings(currentSettings);
                    updateUI();
                }
            });

            // تحديث واجهة المستخدم عند التحميل
            updateUI();
        } catch (e) {
            console.error('Error in manageUserSettings:', e);
        }
    }

    // تنفيذ الدالة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', manageUserSettings);
    } else {
        manageUserSettings();
    }
})();