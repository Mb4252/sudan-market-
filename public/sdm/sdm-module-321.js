// public/sdm/sdm-module-321.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule321Data';
    const MODULE_NAME = 'SDM Module #321';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleContainer = document.getElementById('sdm-module-321');
            if (!moduleContainer) {
                console.error('Required DOM element not found for SDM Module #321');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = loadModuleData();

            // إنشاء واجهة المستخدم
            createModuleUI(moduleContainer, savedData);
        } catch (error) {
            console.error('Error initializing SDM Module #321:', error);
        }
    }

    // دالة تحميل البيانات المحفوظة
    function loadModuleData() {
        try {
            const data = localStorage.getItem(MODULE_STORAGE_KEY);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('Error loading module data:', error);
            return {};
        }
    }

    // دالة إنشاء واجهة المستخدم
    function createModuleUI(container, data) {
        const titleElement = document.createElement('h3');
        titleElement.textContent = MODULE_NAME;

        const contentElement = document.createElement('div');
        contentElement.id = 'sdm-module-321-content';

        if (data.content) {
            contentElement.textContent = data.content;
        }

        container.appendChild(titleElement);
        container.appendChild(contentElement);
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }
})();