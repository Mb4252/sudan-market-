// public/sdm/sdm-module-277.js
(function() {
    'use strict';

    // إعدادات التوسعة
    const MODULE_STORAGE_KEY = 'sdmModule277Data';
    const MODULE_NAME = 'SDM Module #277';

    // دالة تهيئة التوسعة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleContainer = document.getElementById('sdm-module-277');
            if (!moduleContainer) {
                console.error('Required DOM element not found for SDM Module #277');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = loadModuleData();

            // إنشاء واجهة المستخدم
            createModuleUI(moduleContainer, savedData);
        } catch (error) {
            console.error('Error initializing SDM Module #277:', error);
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
        moduleElement.className = 'sdm-module-container';

        // إضافة العنوان
        const titleElement = document.createElement('h3');
        titleElement.textContent = MODULE_NAME;
        moduleElement.appendChild(titleElement);

        // إضافة المحتوى
        const contentElement = document.createElement('div');
        contentElement.className = 'sdm-module-content';
        contentElement.textContent = data.content || 'No content available';
        moduleElement.appendChild(contentElement);

        // إضافة التوسعة إلى الحاوية
        container.appendChild(moduleElement);
    }

    // تهيئة التوسعة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }
})();