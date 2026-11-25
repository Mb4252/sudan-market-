// public/sdm/sdm-module-346.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule346Data';
    const MODULE_NAME = 'SDM Module #346';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleContainer = document.getElementById('sdm-module-346');
            if (!moduleContainer) {
                console.error('Required DOM element not found for SDM Module #346');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = loadModuleData();

            // إنشاء واجهة المستخدم
            createModuleUI(moduleContainer, savedData);

            // إعداد المستمعين للأحداث
            setupEventListeners(moduleContainer);
        } catch (error) {
            console.error('Error initializing SDM Module #346:', error);
        }
    }

    // دالة تحميل البيانات المحفوظة
    function loadModuleData() {
        try {
            const data = localStorage.getItem(MODULE_STORAGE_KEY);
            return data ? JSON.parse(data) : { enabled: false, lastUsed: null };
        } catch (error) {
            console.error('Error loading module data:', error);
            return { enabled: false, lastUsed: null };
        }
    }

    // دالة حفظ البيانات
    function saveModuleData(data) {
        try {
            localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('Error saving module data:', error);
        }
    }

    // دالة إنشاء واجهة المستخدم
    function createModuleUI(container, data) {
        const moduleHeader = document.createElement('h3');
        moduleHeader.textContent = MODULE_NAME;
        container.appendChild(moduleHeader);

        const toggleButton = document.createElement('button');
        toggleButton.id = 'sdm-module-346-toggle';
        toggleButton.textContent = data.enabled ? 'Disable' : 'Enable';
        container.appendChild(toggleButton);

        const statusElement = document.createElement('p');
        statusElement.id = 'sdm-module-346-status';
        statusElement.textContent = `Status: ${data.enabled ? 'Enabled' : 'Disabled'}`;
        container.appendChild(statusElement);
    }

    // دالة إعداد المستمعين للأحداث
    function setupEventListeners(container) {
        const toggleButton = container.querySelector('#sdm-module-346-toggle');
        if (toggleButton) {
            toggleButton.addEventListener('click', function() {
                const currentData = loadModuleData();
                const newData = {
                    enabled: !currentData.enabled,
                    lastUsed: new Date().toISOString()
                };
                saveModuleData(newData);

                const statusElement = container.querySelector('#sdm-module-346-status');
                if (statusElement) {
                    statusElement.textContent = `Status: ${newData.enabled ? 'Enabled' : 'Disabled'}`;
                }
                this.textContent = newData.enabled ? 'Disable' : 'Enable';
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