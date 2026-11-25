// public/sdm/sdm-module-153.js
(function() {
    'use strict';

    // مفتاح التخزين في localStorage
    const THEME_STORAGE_KEY = 'sdmUserTheme';

    // دالة لحفظ الوضع المفضل
    function saveThemePreference(theme) {
        try {
            localStorage.setItem(THEME_STORAGE_KEY, theme);
            applyTheme(theme);
        } catch (e) {
            console.error('Error saving theme preference:', e);
        }
    }

    // دالة لتطبيق الوضع
    function applyTheme(theme) {
        const body = document.body;
        if (body) {
            body.className = theme;
        }
    }

    // دالة لتحميل الوضع المحفوظ
    function loadThemePreference() {
        try {
            const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
            if (savedTheme) {
                applyTheme(savedTheme);
                return savedTheme;
            }
        } catch (e) {
            console.error('Error loading theme preference:', e);
        }
        return 'light'; // الوضع الافتراضي
    }

    // تهيئة الوحدة
    function init() {
        const themeSelector = document.getElementById('theme-selector');
        if (themeSelector) {
            themeSelector.addEventListener('change', function() {
                saveThemePreference(this.value);
            });

            // تطبيق الوضع المحفوظ عند التحميل
            const currentTheme = loadThemePreference();
            themeSelector.value = currentTheme;
        }
    }

    // بدء التهيئة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // تصدير الوظائف العامة
    window.sdmThemeModule = {
        saveThemePreference,
        loadThemePreference,
        applyTheme
    };
})();