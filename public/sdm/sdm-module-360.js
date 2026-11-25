// public/sdm/sdm-module-360.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule360Data';
    const MODULE_NAME = 'SDM Module #360';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عنصر DOM
            const moduleElement = document.getElementById('sdm-module-360');
            if (!moduleElement) {
                console.error(`${MODULE_NAME} element not found`);
                return;
            }

            // تحميل البيانات
            const savedData = localStorage.getItem(MODULE_STORAGE_KEY);
            const data = savedData ? JSON.parse(savedData) : {};

            // تحديث واجهة المستخدم
            if (data.lastUpdate) {
                moduleElement.textContent = `Last update: ${new Date(data.lastUpdate).toLocaleString()}`;
            } else {
                moduleElement.textContent = `${MODULE_NAME} initialized`;
            }

            // حفظ البيانات المحدثة
            localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify({
                ...data,
                lastUpdate: new Date().toISOString()
            }));

            console.log(`${MODULE_NAME} initialized successfully`);
        } catch (error) {
            console.error(`${MODULE_NAME} initialization error:`, error);
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }

    // تصدير الدالة المطلوبة
    window.sdmModule360 = {
        init: initModule
    };
})();