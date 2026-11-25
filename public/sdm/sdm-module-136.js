// public/sdm/sdm-module-136.js
(function() {
    'use strict';

    try {
        // دالة لحفظ إعدادات المستخدم في localStorage
        function saveUserSettings() {
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                const theme = themeSelector.value;
                localStorage.setItem('userTheme', theme);
                document.body.className = theme;
            }
        }

        // دالة لتحميل إعدادات المستخدم من localStorage
        function loadUserSettings() {
            const savedTheme = localStorage.getItem('userTheme');
            if (savedTheme) {
                const themeSelector = document.getElementById('theme-selector');
                if (themeSelector) {
                    themeSelector.value = savedTheme;
                    document.body.className = savedTheme;
                }
            }
        }

        // استماع لتغييرات في اختيار السمة
        document.addEventListener('DOMContentLoaded', function() {
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.addEventListener('change', saveUserSettings);
                loadUserSettings();
            }
        });
    } catch (e) {
        console.error('Error in sdm-module-136:', e);
    }
})();