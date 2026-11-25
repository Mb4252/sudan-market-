// public/sdm/sdm-module-215.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule215Data';
    const MODULE_NAME = 'SDM Module #215';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const chatElement = document.getElementById('sdm-chat');
            if (!chatElement) {
                console.warn('SDM chat UI not found, skipping module initialization');
                return;
            }

            // إنشاء عنصر جديد لعرض معلومات الوحدة
            const moduleInfoElement = document.createElement('div');
            moduleInfoElement.id = 'sdm-module-215-info';
            moduleInfoElement.style.padding = '10px';
            moduleInfoElement.style.backgroundColor = '#f0f0f0';
            moduleInfoElement.style.margin = '10px 0';
            moduleInfoElement.style.borderRadius = '5px';

            // إضافة العنصر إلى واجهة الدردشة
            chatElement.appendChild(moduleInfoElement);

            // تحديث محتوى العنصر
            updateModuleInfo();

            // تحديث المعلومات كل 5 دقائق
            setInterval(updateModuleInfo, 5 * 60 * 1000);

            console.log(`${MODULE_NAME} initialized successfully`);
        } catch (error) {
            console.error(`Error initializing ${MODULE_NAME}:`, error);
        }
    }

    // دالة تحديث معلومات الوحدة
    function updateModuleInfo() {
        try {
            const infoElement = document.getElementById('sdm-module-215-info');
            if (!infoElement) return;

            // جلب البيانات من localStorage
            const storedData = localStorage.getItem(MODULE_STORAGE_KEY);
            const data = storedData ? JSON.parse(storedData) : { lastUpdate: new Date().toISOString() };

            // تحديث البيانات
            data.lastUpdate = new Date().toISOString();
            localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify(data));

            // عرض المعلومات
            infoElement.textContent = `${MODULE_NAME} - Last update: ${new Date(data.lastUpdate).toLocaleString()}`;
        } catch (error) {
            console.error(`Error updating ${MODULE_NAME} info:`, error);
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initModule();
    } else {
        document.addEventListener('DOMContentLoaded', initModule);
    }

})();