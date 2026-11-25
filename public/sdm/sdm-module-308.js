// public/sdm/sdm-module-308.js
(function() {
    'use strict';

    // إعدادات التوسعة
    const MODULE_STORAGE_KEY = 'sdmModule308Data';
    const MODULE_NAME = 'SDM Module #308';

    // دالة تهيئة التوسعة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleElement = document.getElementById('sdm-module-308');
            if (!moduleElement) {
                console.log('Required DOM elements not found for SDM Module #308');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = loadModuleData();

            // تنفيذ الوظيفة الرئيسية للتوسعة
            mainModuleFunction(moduleElement, savedData);
        } catch (error) {
            console.error('Error initializing SDM Module #308:', error);
        }
    }

    // دالة التحميل
    function loadModuleData() {
        try {
            const data = localStorage.getItem(MODULE_STORAGE_KEY);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('Error loading module data:', error);
            return {};
        }
    }

    // دالة الحفظ
    function saveModuleData(data) {
        try {
            localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('Error saving module data:', error);
        }
    }

    // الوظيفة الرئيسية للتوسعة
    function mainModuleFunction(element, savedData) {
        // تحديث العنصر
        updateModuleElement(element, savedData);

        // إضافة مستمع حدث
        element.addEventListener('click', () => {
            const newData = { clicks: (savedData.clicks || 0) + 1 };
            updateModuleElement(element, newData);
            saveModuleData(newData);
        });
    }

    // تحديث عنصر التوسعة
    function updateModuleElement(element, data) {
        if (element && typeof element.textContent !== 'undefined') {
            element.textContent = `${MODULE_NAME}: ${data.clicks || 0} clicks`;
        }
    }

    // تهيئة التوسعة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }
})();