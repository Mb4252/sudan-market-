// public/sdm/sdm-module-100.js

(function() {
    'use strict';

    // مفتاح التخزين
    const THEME_STORAGE_KEY = 'sdmUserTheme';

    // دالة لتخزين الوضع
    function saveTheme(theme) {
        try {
            localStorage.setItem(THEME_STORAGE_KEY, theme);
            return true;
        } catch (error) {
            console.error('Error saving theme:', error);
            return false;
        }
    }

    // دالة لتحميل الوضع
    function loadTheme() {
        try {
            return localStorage.getItem(THEME_STORAGE_KEY) || 'light';
        } catch (error) {
            console.error('Error loading theme:', error);
            return 'light';
        }
    }

    // دالة لتطبيق الوضع على الصفحة
    function applyTheme(theme) {
        const body = document.body;
        if (body) {
            body.className = theme === 'dark' ? 'dark-theme' : 'light-theme';
        }
    }

    // تهيئة الوحدة
    function init() {
        try {
            // تحميل الوضع المحفوظ
            const savedTheme = loadTheme();

            // تطبيق الوضع
            applyTheme(savedTheme);

            // تحديث العنصر DOM عند تغيير الوضع
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.value = savedTheme;
                themeSelector.addEventListener('change', function() {
                    const newTheme = this.value;
                    saveTheme(newTheme);
                    applyTheme(newTheme);
                });
            }
        } catch (error) {
            console.error('Error initializing theme module:', error);
        }
    }

    // بدء التهيئة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // تصدير الوظائف
    window.sdmThemeModule = {
        saveTheme,
        loadTheme,
        applyTheme
    };
})();