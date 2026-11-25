// public/sdm/sdm-module-214.js
(function() {
    'use strict';

    // إعدادات التوسعة
    const STORAGE_KEY = 'sdmModule214Settings';
    const DEFAULT_SETTINGS = {
        theme: 'light',
        notifications: true,
        language: 'en'
    };

    // دالة لتحميل الإعدادات
    function loadSettings() {
        try {
            const savedSettings = localStorage.getItem(STORAGE_KEY);
            return savedSettings ? JSON.parse(savedSettings) : DEFAULT_SETTINGS;
        } catch (e) {
            console.error('Error loading settings:', e);
            return DEFAULT_SETTINGS;
        }
    }

    // دالة لحفظ الإعدادات
    function saveSettings(settings) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
            return true;
        } catch (e) {
            console.error('Error saving settings:', e);
            return false;
        }
    }

    // دالة لتهيئة الواجهة
    function initUI() {
        const settings = loadSettings();

        // إنشاء عناصر واجهة المستخدم
        const container = document.createElement('div');
        container.id = 'sdm-module-214';
        container.innerHTML = `
            <h3>Module 214 Settings</h3>
            <div>
                <label>
                    Theme:
                    <select id="theme-select">
                        <option value="light" ${settings.theme === 'light' ? 'selected' : ''}>Light</option>
                        <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>Dark</option>
                    </select>
                </label>
            </div>
            <div>
                <label>
                    <input type="checkbox" id="notifications-toggle" ${settings.notifications ? 'checked' : ''}>
                    Enable Notifications
                </label>
            </div>
            <div>
                <label>
                    Language:
                    <select id="language-select">
                        <option value="en" ${settings.language === 'en' ? 'selected' : ''}>English</option>
                        <option value="ar" ${settings.language === 'ar' ? 'selected' : ''}>Arabic</option>
                    </select>
                </label>
            </div>
            <button id="save-settings">Save Settings</button>
        `;

        // إضافة الواجهة إلى الصفحة
        document.body.appendChild(container);

        // إضافة معالجات الأحداث
        document.getElementById('save-settings').addEventListener('click', () => {
            const newSettings = {
                theme: document.getElementById('theme-select').value,
                notifications: document.getElementById('notifications-toggle').checked,
                language: document.getElementById('language-select').value
            };
            saveSettings(newSettings);
            alert('Settings saved!');
        });
    }

    // تهيئة التوسعة عند تحميل الصفحة
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initUI();
    } else {
        document.addEventListener('DOMContentLoaded', initUI);
    }

    // تصدير الوظائف المطلوبة
    window.sdmModule214 = {
        loadSettings,
        saveSettings
    };
})();