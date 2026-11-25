// public/sdm/sdm-module-247.js
(function() {
    'use strict';

    // إعدادات التوسعة
    const ADDON_STORAGE_KEY = 'sdmModule247Data';
    const ADDON_NAME = 'SDM Module #247';

    // دالة تهيئة التوسعة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleElement = document.getElementById('sdm-module-247');
            if (!moduleElement) {
                console.log('Required DOM elements not found for SDM Module #247');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = loadModuleData();

            // تنفيذ الوظيفة الرئيسية للتوسعة
            mainModuleFunction(savedData, moduleElement);
        } catch (error) {
            console.error('Error initializing SDM Module #247:', error);
        }
    }

    // دالة التحميل
    function loadModuleData() {
        try {
            const data = localStorage.getItem(ADDON_STORAGE_KEY);
            return data ? JSON.parse(data) : { counter: 0 };
        } catch (error) {
            console.error('Error loading module data:', error);
            return { counter: 0 };
        }
    }

    // دالة الحفظ
    function saveModuleData(data) {
        try {
            localStorage.setItem(ADDON_STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('Error saving module data:', error);
        }
    }

    // الوظيفة الرئيسية للتوسعة
    function mainModuleFunction(savedData, moduleElement) {
        // تحديث العنصر بالبيانات المحفوظة
        updateModuleElement(moduleElement, savedData);

        // إضافة مستمعين للأحداث
        addEventListeners(moduleElement, savedData);
    }

    // تحديث العنصر
    function updateModuleElement(element, data) {
        if (element) {
            element.textContent = `${ADDON_NAME}: ${data.counter || 0}`;
        }
    }

    // إضافة مستمعين للأحداث
    function addEventListeners(element, data) {
        element.addEventListener('click', function() {
            // تحديث العداد
            data.counter = (data.counter || 0) + 1;
            updateModuleElement(element, data);
            saveModuleData(data);
        });
    }

    // تهيئة التوسعة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }
})();