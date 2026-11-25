// public/sdm/sdm-module-207.js
(function() {
    'use strict';

    // إعدادات التفضيلات
    const PREFERENCES_KEY = 'sdmUserPreferences';

    // دالة لجلب التفضيلات الحالية
    function getPreferences() {
        try {
            const data = localStorage.getItem(PREFERENCES_KEY);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('Error getting preferences:', error);
            return {};
        }
    }

    // دالة لحفظ تفضيلات جديدة
    function savePreferences(preferences) {
        try {
            localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
            return true;
        } catch (error) {
            console.error('Error saving preferences:', error);
            return false;
        }
    }

    // دالة لتهيئة الواجهة
    function initUI() {
        const preferences = getPreferences();

        // إنشاء عنصر واجهة بسيط
        const container = document.createElement('div');
        container.id = 'sdm-preferences-container';
        container.style.padding = '10px';
        container.style.border = '1px solid #ccc';
        container.style.margin = '10px 0';

        const title = document.createElement('h3');
        title.textContent = 'تفضيلات المستخدم';
        container.appendChild(title);

        // إضافة حقل لاختيار اللغة
        const languageLabel = document.createElement('label');
        languageLabel.textContent = 'اللغة: ';
        languageLabel.style.marginRight = '10px';

        const languageSelect = document.createElement('select');
        languageSelect.id = 'sdm-language-select';
        ['العربية', 'English'].forEach(lang => {
            const option = document.createElement('option');
            option.value = lang;
            option.textContent = lang;
            if (preferences.language === lang) {
                option.selected = true;
            }
            languageSelect.appendChild(option);
        });

        languageSelect.addEventListener('change', function() {
            const newPrefs = { ...preferences, language: this.value };
            savePreferences(newPrefs);
        });

        languageLabel.appendChild(languageSelect);
        container.appendChild(languageLabel);

        // إضافة حقل لاختيار الوضع الليلي
        const darkModeLabel = document.createElement('label');
        darkModeLabel.textContent = 'الوضع الليلي: ';
        darkModeLabel.style.marginRight = '10px';

        const darkModeCheckbox = document.createElement('input');
        darkModeCheckbox.type = 'checkbox';
        darkModeCheckbox.id = 'sdm-dark-mode';
        darkModeCheckbox.checked = preferences.darkMode || false;

        darkModeCheckbox.addEventListener('change', function() {
            const newPrefs = { ...preferences, darkMode: this.checked };
            savePreferences(newPrefs);
            applyDarkMode(this.checked);
        });

        darkModeLabel.appendChild(darkModeCheckbox);
        container.appendChild(darkModeLabel);

        // إضافة الحاوية إلى الصفحة
        const chatContainer = document.getElementById('sdm-chat');
        if (chatContainer) {
            chatContainer.appendChild(container);
        }

        // تطبيق الوضع الليلي إذا كان مفعلاً
        if (preferences.darkMode) {
            applyDarkMode(true);
        }
    }

    // دالة لتطبيق الوضع الليلي
    function applyDarkMode(enable) {
        document.body.style.backgroundColor = enable ? '#333' : '';
        document.body.style.color = enable ? '#fff' : '';
    }

    // تهيئة الواجهة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUI);
    } else {
        initUI();
    }

})();