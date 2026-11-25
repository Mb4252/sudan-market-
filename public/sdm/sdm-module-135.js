// sdm-module-135.js
(function() {
    'use strict';

    // دالة لحفظ إعدادات المستخدم في localStorage
    function saveUserSettings(settings) {
        try {
            if (!settings || typeof settings !== 'object') {
                throw new Error('Invalid settings object');
            }

            // التحقق من وجود localStorage
            if (typeof localStorage === 'undefined') {
                throw new Error('localStorage is not available');
            }

            // حفظ الإعدادات
            localStorage.setItem('sdmUserSettings', JSON.stringify(settings));
            return true;
        } catch (error) {
            console.error('Error saving user settings:', error);
            return false;
        }
    }

    // دالة لجلب إعدادات المستخدم من localStorage
    function getUserSettings() {
        try {
            if (typeof localStorage === 'undefined') {
                throw new Error('localStorage is not available');
            }

            const settings = localStorage.getItem('sdmUserSettings');
            return settings ? JSON.parse(settings) : null;
        } catch (error) {
            console.error('Error getting user settings:', error);
            return null;
        }
    }

    // تحديث واجهة المستخدم بالإعدادات المحفوظة
    function updateUIWithSettings() {
        try {
            const settings = getUserSettings();
            if (!settings) return;

            // تحديث الوضع (light/dark)
            if (settings.theme) {
                document.body.className = settings.theme;
                const themeSelector = document.getElementById('theme-selector');
                if (themeSelector) {
                    themeSelector.value = settings.theme;
                }
            }

            // تحديث اسم المستخدم
            if (settings.username) {
                const nameInput = document.getElementById('sdm-name');
                if (nameInput) {
                    nameInput.value = settings.username;
                }
            }
        } catch (error) {
            console.error('Error updating UI with settings:', error);
        }
    }

    // تهيئة الوحدة
    function init() {
        try {
            // تحديث واجهة المستخدم بالإعدادات المحفوظة
            updateUIWithSettings();

            // إضافة مستمع لحدث تغيير الوضع
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.addEventListener('change', function() {
                    const settings = getUserSettings() || {};
                    settings.theme = this.value;
                    saveUserSettings(settings);
                    updateUIWithSettings();
                });
            }

            // إضافة مستمع لحدث تغيير اسم المستخدم
            const nameInput = document.getElementById('sdm-name');
            if (nameInput) {
                nameInput.addEventListener('change', function() {
                    const settings = getUserSettings() || {};
                    settings.username = this.value;
                    saveUserSettings(settings);
                });
            }
        } catch (error) {
            console.error('Error initializing module:', error);
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // تصدير الدوال العامة
    window.sdmModule135 = {
        saveUserSettings,
        getUserSettings,
        updateUIWithSettings
    };
})();