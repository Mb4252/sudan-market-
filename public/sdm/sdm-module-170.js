// public/sdm/sdm-module-170.js
(function() {
    'use strict';

    // إعدادات التوسعة
    const STORAGE_KEY = 'sdmUserSettings';
    const DEFAULT_SETTINGS = {
        theme: 'light',
        notifications: true,
        language: 'en'
    };

    // دالة تهيئة التوسعة
    function init() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            if (!document.getElementById('user-settings')) {
                console.warn('User settings UI not found');
                return;
            }

            // تحميل الإعدادات
            loadSettings();

            // إعداد مستمعين للأحداث
            setupEventListeners();
        } catch (error) {
            console.error('Error initializing SDM Module 170:', error);
        }
    }

    // دالة تحميل الإعدادات
    function loadSettings() {
        try {
            const savedSettings = localStorage.getItem(STORAGE_KEY);
            const settings = savedSettings ? JSON.parse(savedSettings) : DEFAULT_SETTINGS;

            // تحديث واجهة المستخدم
            updateUI(settings);
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    // دالة تحديث واجهة المستخدم
    function updateUI(settings) {
        try {
            // تحديث العناصر في واجهة المستخدم
            document.getElementById('theme-selector').value = settings.theme;
            document.getElementById('notifications-toggle').checked = settings.notifications;
            document.getElementById('language-selector').value = settings.language;
        } catch (error) {
            console.error('Error updating UI:', error);
        }
    }

    // دالة حفظ الإعدادات
    function saveSettings(settings) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    // دالة إعداد مستمعين للأحداث
    function setupEventListeners() {
        try {
            // مستمع تغيير السمة
            document.getElementById('theme-selector').addEventListener('change', function() {
                const settings = getCurrentSettings();
                settings.theme = this.value;
                saveSettings(settings);
                updateUI(settings);
            });

            // مستمع تغيير الإشعارات
            document.getElementById('notifications-toggle').addEventListener('change', function() {
                const settings = getCurrentSettings();
                settings.notifications = this.checked;
                saveSettings(settings);
            });

            // مستمع تغيير اللغة
            document.getElementById('language-selector').addEventListener('change', function() {
                const settings = getCurrentSettings();
                settings.language = this.value;
                saveSettings(settings);
            });
        } catch (error) {
            console.error('Error setting up event listeners:', error);
        }
    }

    // دالة الحصول على الإعدادات الحالية
    function getCurrentSettings() {
        try {
            const savedSettings = localStorage.getItem(STORAGE_KEY);
            return savedSettings ? JSON.parse(savedSettings) : DEFAULT_SETTINGS;
        } catch (error) {
            console.error('Error getting current settings:', error);
            return DEFAULT_SETTINGS;
        }
    }

    // تهيئة التوسعة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ربط الدالة مع النافذة العالمية
    window.sdmModule170 = {
        init: init,
        loadSettings: loadSettings,
        saveSettings: saveSettings
    };
})();