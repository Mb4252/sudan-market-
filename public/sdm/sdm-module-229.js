// public/sdm/sdm-module-229.js
(function() {
    'use strict';

    // إعدادات التوسعة
    const MODULE_STORAGE_KEY = 'sdmModule229Data';
    const MODULE_NAME = 'SDM Module #229';

    // دالة تهيئة التوسعة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleElement = document.getElementById('sdm-module-229');
            if (!moduleElement) {
                console.warn(`${MODULE_NAME} element not found`);
                return;
            }

            // دالة لحفظ البيانات في localStorage
            function saveData(data) {
                try {
                    localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify(data));
                } catch (e) {
                    console.error(`${MODULE_NAME} error saving data:`, e);
                }
            }

            // دالة لجلب البيانات من localStorage
            function getData() {
                try {
                    const data = localStorage.getItem(MODULE_STORAGE_KEY);
                    return data ? JSON.parse(data) : null;
                } catch (e) {
                    console.error(`${MODULE_NAME} error getting data:`, e);
                    return null;
                }
            }

            // دالة عرض البيانات في الواجهة
            function displayData() {
                const data = getData();
                if (data) {
                    moduleElement.textContent = `Data: ${JSON.stringify(data)}`;
                } else {
                    moduleElement.textContent = `${MODULE_NAME} - No data available`;
                }
            }

            // تهيئة البيانات الأولية
            if (!getData()) {
                saveData({ initialized: new Date().toISOString() });
            }

            // عرض البيانات
            displayData();

            // إرجاع الدوال العامة
            return {
                saveData,
                getData,
                displayData
            };
        } catch (e) {
            console.error(`${MODULE_NAME} initialization error:`, e);
        }
    }

    // تهيئة التوسعة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }

    // ربط الدالة مع النافذة العالمية
    window.sdmModule229 = initModule();
})();
