// public/sdm/sdm-module-359.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule359Data';
    const MODULE_NAME = 'SDM Module #359';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleElement = document.getElementById('sdm-module-359');
            if (!moduleElement) {
                console.error('Required DOM element not found for SDM Module #359');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = loadModuleData();

            // إنشاء واجهة المستخدم
            createModuleUI(moduleElement, savedData);

            // إعداد المستمعين للأحداث
            setupEventListeners(moduleElement);
        } catch (error) {
            console.error('Error initializing SDM Module #359:', error);
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
        const moduleTitle = document.createElement('h3');
        moduleTitle.textContent = MODULE_NAME;
        container.appendChild(moduleTitle);

        const moduleToggle = document.createElement('button');
        moduleToggle.id = 'sdm-module-359-toggle';
        moduleToggle.textContent = data.enabled ? 'Disable' : 'Enable';
        container.appendChild(moduleToggle);

        const moduleStatus = document.createElement('p');
        moduleStatus.id = 'sdm-module-359-status';
        moduleStatus.textContent = `Status: ${data.enabled ? 'Enabled' : 'Disabled'}`;
        container.appendChild(moduleStatus);
    }

    // دالة إعداد المستمعين للأحداث
    function setupEventListeners(container) {
        const toggleButton = container.querySelector('#sdm-module-359-toggle');
        if (toggleButton) {
            toggleButton.addEventListener('click', function() {
                const currentData = loadModuleData();
                const newData = {
                    enabled: !currentData.enabled,
                    lastUsed: new Date().toISOString()
                };
                saveModuleData(newData);
                updateUI(container, newData);
            });
        }
    }

    // دالة تحديث واجهة المستخدم
    function updateUI(container, data) {
        const toggleButton = container.querySelector('#sdm-module-359-toggle');
        const statusElement = container.querySelector('#sdm-module-359-status');

        if (toggleButton) {
            toggleButton.textContent = data.enabled ? 'Disable' : 'Enable';
        }
        if (statusElement) {
            statusElement.textContent = `Status: ${data.enabled ? 'Enabled' : 'Disabled'}`;
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initModule();
    } else {
        document.addEventListener('DOMContentLoaded', initModule);
    }
})();