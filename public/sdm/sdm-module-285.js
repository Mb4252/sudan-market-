// public/sdm/sdm-module-285.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_ID = 'sdm-module-285';
    const STORAGE_KEY = 'sdmModule285Data';
    const MODULE_NAME = 'SDM Module #285';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عنصر DOM
            const moduleElement = document.getElementById(MODULE_ID);
            if (!moduleElement) {
                console.error(`Element with ID ${MODULE_ID} not found`);
                return;
            }

            // تحميل البيانات من التخزين المحلي
            let moduleData = loadModuleData();

            // تحديث واجهة المستخدم
            updateUI(moduleElement, moduleData);

            // إعداد معالج الحدث
            setupEventHandlers(moduleElement);

            console.log(`${MODULE_NAME} initialized successfully`);
        } catch (error) {
            console.error(`${MODULE_NAME} initialization error:`, error);
        }
    }

    // دالة تحميل البيانات من التخزين المحلي
    function loadModuleData() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : { count: 0, lastUpdated: new Date().toISOString() };
        } catch (error) {
            console.error('Error loading module data:', error);
            return { count: 0, lastUpdated: new Date().toISOString() };
        }
    }

    // دالة حفظ البيانات في التخزين المحلي
    function saveModuleData(data) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('Error saving module data:', error);
        }
    }

    // دالة تحديث واجهة المستخدم
    function updateUI(element, data) {
        try {
            element.textContent = `Module Count: ${data.count} (Last updated: ${new Date(data.lastUpdated).toLocaleString()})`;
        } catch (error) {
            console.error('Error updating UI:', error);
        }
    }

    // دالة إعداد معالجات الأحداث
    function setupEventHandlers(element) {
        element.addEventListener('click', function() {
            try {
                let data = loadModuleData();
                data.count++;
                data.lastUpdated = new Date().toISOString();
                saveModuleData(data);
                updateUI(element, data);
            } catch (error) {
                console.error('Error handling click event:', error);
            }
        });
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }

})();