// public/sdm/sdm-module-127.js
(function() {
    'use strict';

    // دالة لتخزين إعدادات المستخدم في localStorage
    function saveUserSettings(settings) {
        try {
            if (!settings || typeof settings !== 'object') {
                throw new Error('Invalid settings object');
            }

            // التحقق من وجود localStorage
            if (typeof localStorage === 'undefined') {
                throw new Error('localStorage is not available');
            }

            // تخزين الإعدادات
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
            // التحقق من وجود localStorage
            if (typeof localStorage === 'undefined') {
                throw new Error('localStorage is not available');
            }

            // جلب الإعدادات
            const settings = localStorage.getItem('sdmUserSettings');
            return settings ? JSON.parse(settings) : null;
        } catch (error) {
            console.error('Error getting user settings:', error);
            return null;
        }
    }

    // دالة لتحديث واجهة المستخدم بالإعدادات المحفوظة
    function updateUIWithSettings() {
        try {
            const settings = getUserSettings();
            if (!settings) return;

            // تحديث واجهة المستخدم بالإعدادات
            if (settings.theme) {
                document.body.className = settings.theme;
            }

            // يمكنك إضافة المزيد من التحديثات هنا حسب الإعدادات

        } catch (error) {
            console.error('Error updating UI with settings:', error);
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    function init() {
        try {
            // تحديث واجهة المستخدم بالإعدادات المحفوظة
            updateUIWithSettings();

            // إضافة مستمع لاختيار الوضع
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.addEventListener('change', function() {
                    const settings = { theme: this.value };
                    saveUserSettings(settings);
                    updateUIWithSettings();
                });
            }
        } catch (error) {
            console.error('Error initializing module:', error);
        }
    }

    // بدء التهيئة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();