// public/sdm/sdm-module-351.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule351Data';
    const MODULE_NAME = 'SDM Module #351';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleElement = document.getElementById('sdm-module-350');
            if (!moduleElement) {
                console.error('Required DOM element not found for SDM Module #351');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = loadModuleData();

            // إنشاء واجهة المستخدم
            createModuleUI(savedData, moduleElement);
        } catch (error) {
            console.error('Error initializing SDM Module #351:', error);
        }
    }

    // دالة تحميل البيانات المحفوظة
    function loadModuleData() {
        try {
            const data = localStorage.getItem(MODULE_STORAGE_KEY);
            return data ? JSON.parse(data) : { enabled: true, lastUsed: new Date().toISOString() };
        } catch (error) {
            console.error('Error loading module data:', error);
            return { enabled: true, lastUsed: new Date().toISOString() };
        }
    }

    // دالة إنشاء واجهة المستخدم
    function createModuleUI(data, container) {
        const moduleContainer = document.createElement('div');
        moduleContainer.id = 'sdm-module-351-container';
        moduleContainer.className = 'sdm-module-container';

        const moduleHeader = document.createElement('div');
        moduleHeader.className = 'sdm-module-header';
        moduleHeader.textContent = MODULE_NAME;

        const moduleContent = document.createElement('div');
        moduleContent.id = 'sdm-module-351-content';
        moduleContent.className = 'sdm-module-content';

        const statusElement = document.createElement('div');
        statusElement.id = 'sdm-module-351-status';
        statusElement.className = 'sdm-module-status';
        statusElement.textContent = data.enabled ? 'Enabled' : 'Disabled';

        moduleContent.appendChild(statusElement);
        moduleContainer.appendChild(moduleHeader);
        moduleContainer.appendChild(moduleContent);
        container.appendChild(moduleContainer);
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }
})();