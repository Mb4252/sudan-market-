// public/sdm/sdm-module-303.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule303Data';
    const MODULE_NAME = 'SDM Module #303';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عنصر DOM المطلوب
            const moduleElement = document.getElementById('sdm-module-303');
            if (!moduleElement) {
                console.error('Required DOM element not found for SDM Module #303');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = loadModuleData();

            // تنفيذ الوظيفة الأساسية للوحدة
            performModuleFunctionality(savedData, moduleElement);

            // حفظ البيانات عند مغادرة الصفحة
            window.addEventListener('beforeunload', saveModuleData);
        } catch (error) {
            console.error(`${MODULE_NAME} initialization error:`, error);
        }
    }

    // دالة تنفيذ الوظيفة الأساسية للوحدة
    function performModuleFunctionality(savedData, moduleElement) {
        console.log(`${MODULE_NAME} is running with saved data:`, savedData);

        // مثال: إضافة زر جديد إلى الواجهة
        const moduleButton = document.createElement('button');
        moduleButton.textContent = 'Module #303 Button';
        moduleButton.addEventListener('click', () => {
            alert(`${MODULE_NAME} button clicked!`);
        });
        moduleElement.appendChild(moduleButton);
    }

    // دالة حفظ البيانات
    function saveModuleData() {
        const dataToSave = {
            timestamp: new Date().toISOString(),
            message: 'Sample data from SDM Module #303'
        };

        try {
            localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify(dataToSave));
            console.log(`${MODULE_NAME} data saved successfully`);
        } catch (error) {
            console.error(`Error saving ${MODULE_NAME} data:`, error);
        }
    }

    // دالة تحميل البيانات
    function loadModuleData() {
        try {
            const savedData = localStorage.getItem(MODULE_STORAGE_KEY);
            return savedData ? JSON.parse(savedData) : {};
        } catch (error) {
            console.error(`Error loading ${MODULE_NAME} data:`, error);
            return {};
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }
})();