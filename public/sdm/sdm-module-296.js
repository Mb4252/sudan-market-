// public/sdm/sdm-module-296.js
(function() {
    'use strict';

    // إعدادات التوسعة
    const MODULE_STORAGE_KEY = 'sdmModule296Data';
    const MODULE_NAME = 'SDM Module #296';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleContainer = document.getElementById('sdm-module-296');
            if (!moduleContainer) {
                console.error('Required DOM element not found for SDM Module #296');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = loadModuleData();

            // إنشاء واجهة المستخدم
            createModuleUI(moduleContainer, savedData);
        } catch (error) {
            console.error('Error initializing SDM Module #296:', error);
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
        // إنشاء العنصر الرئيسي
        const moduleElement = document.createElement('div');
        moduleElement.className = 'sdm-module';

        // إضافة العنوان
        const titleElement = document.createElement('h3');
        titleElement.textContent = MODULE_NAME;
        moduleElement.appendChild(titleElement);

        // إضافة المحتوى
        const contentElement = document.createElement('div');
        contentElement.textContent = data.content || 'No content available';
        moduleElement.appendChild(contentElement);

        // إضافة الوحدة إلى الحاوية
        container.appendChild(moduleElement);
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }
})();