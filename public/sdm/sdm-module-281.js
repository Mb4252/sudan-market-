// public/sdm/sdm-module-281.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule281Data';
    const MODULE_NAME = 'SDM Module #281';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleContainer = document.getElementById('sdm-module-281');
            if (!moduleContainer) {
                console.log('Required DOM elements not found for SDM Module #281');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = loadModuleData();

            // إنشاء واجهة المستخدم
            createUI(moduleContainer, savedData);

            // تهيئة الأحداث
            setupEvents(moduleContainer);
        } catch (error) {
            console.error('Error initializing SDM Module #281:', error);
        }
    }

    // تحميل البيانات المحفوظة
    function loadModuleData() {
        try {
            const data = localStorage.getItem(MODULE_STORAGE_KEY);
            return data ? JSON.parse(data) : { enabled: true, lastUsed: new Date().toISOString() };
        } catch (error) {
            console.error('Error loading module data:', error);
            return { enabled: true, lastUsed: new Date().toISOString() };
        }
    }

    // حفظ البيانات
    function saveModuleData(data) {
        try {
            localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('Error saving module data:', error);
        }
    }

    // إنشاء واجهة المستخدم
    function createUI(container, data) {
        const moduleHeader = document.createElement('h3');
        moduleHeader.textContent = MODULE_NAME;
        container.appendChild(moduleHeader);

        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'sdm-module-toggle';

        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.id = 'sdm-module-281-toggle';
        toggleInput.checked = data.enabled;
        toggleLabel.appendChild(toggleInput);

        const toggleSpan = document.createElement('span');
        toggleSpan.className = 'slider round';
        toggleLabel.appendChild(toggleSpan);

        const toggleText = document.createElement('span');
        toggleText.textContent = 'Enabled';
        toggleLabel.appendChild(toggleText);

        container.appendChild(toggleLabel);
    }

    // تهيئة الأحداث
    function setupEvents(container) {
        const toggleInput = container.querySelector('#sdm-module-281-toggle');
        if (toggleInput) {
            toggleInput.addEventListener('change', function() {
                const data = loadModuleData();
                data.enabled = this.checked;
                data.lastUsed = new Date().toISOString();
                saveModuleData(data);
            });
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }
})();