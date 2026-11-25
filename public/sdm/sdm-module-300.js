// public/sdm/sdm-module-300.js
(function() {
    'use strict';

    // إعدادات المرحلة
    const MODULE_STORAGE_KEY = 'sdmModule300Data';
    const MODULE_NAME = 'SDM Module #300';

    // دالة تهيئة المرحلة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleElement = document.getElementById('sdm-module-300');
            if (!moduleElement) {
                console.error('Required DOM element not found for SDM Module #300');
                return;
            }

            // تحميل البيانات المحفوظة
            let moduleData = loadModuleData();

            // إذا لم تكن هناك بيانات محفوظة، قم بتهيئة البيانات الافتراضية
            if (!moduleData) {
                moduleData = {
                    name: MODULE_NAME,
                    version: '1.0.0',
                    lastUpdated: new Date().toISOString(),
                    settings: {
                        enabled: true
                    }
                };
                saveModuleData(moduleData);
            }

            // إضافة محتوى المرحلة إلى الواجهة
            moduleElement.textContent = `${MODULE_NAME} is active`;

            console.log(`${MODULE_NAME} initialized successfully`);
        } catch (error) {
            console.error(`Error initializing ${MODULE_NAME}:`, error);
        }
    }

    // دالة تحميل البيانات المحفوظة
    function loadModuleData() {
        try {
            const data = localStorage.getItem(MODULE_STORAGE_KEY);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error(`Error loading ${MODULE_NAME} data:`, error);
            return null;
        }
    }

    // دالة حفظ البيانات
    function saveModuleData(data) {
        try {
            localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error(`Error saving ${MODULE_NAME} data:`, error);
        }
    }

    // تهيئة المرحلة عند تحميل الصفحة
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initModule();
    } else {
        document.addEventListener('DOMContentLoaded', initModule);
    }

    // ربط الدالة مع النافذة العالمية
    window.initSdmModule300 = initModule;
})();
