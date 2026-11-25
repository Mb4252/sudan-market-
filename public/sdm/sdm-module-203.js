// public/sdm/sdm-module-203.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule203Data';
    const MODULE_NAME = 'SDM Module #203';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            if (!document.getElementById('sdm-chat')) {
                console.warn('SDM chat UI not found, module will not initialize');
                return;
            }

            // تنفيذ الوظيفة الرئيسية
            mainFunction();

        } catch (error) {
            console.error(`${MODULE_NAME} initialization error:`, error);
        }
    }

    // الوظيفة الرئيسية - عرض عدد الرسائل المحفوظة في localStorage
    function mainFunction() {
        try {
            // جلب البيانات من localStorage
            const storedData = localStorage.getItem(MODULE_STORAGE_KEY);
            const messageCount = storedData ? JSON.parse(storedData).length : 0;

            // إنشاء عنصر عرض
            const displayElement = document.createElement('div');
            displayElement.id = 'sdm-module-203-display';
            displayElement.style.position = 'absolute';
            displayElement.style.bottom = '10px';
            displayElement.style.right = '10px';
            displayElement.style.padding = '5px 10px';
            displayElement.style.backgroundColor = '#f0f0f0';
            displayElement.style.borderRadius = '5px';
            displayElement.style.fontSize = '12px';
            displayElement.textContent = `Messages: ${messageCount}`;

            // إضافة العنصر إلى الواجهة
            document.body.appendChild(displayElement);
        } catch (error) {
            console.error(`${MODULE_NAME} main function error:`, error);
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }

})();