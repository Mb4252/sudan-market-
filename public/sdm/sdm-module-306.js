// public/sdm/sdm-module-306.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule306Data';
    const MODULE_NAME = 'SDM Module #306';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleContainer = document.getElementById('sdm-module-306');
            if (!moduleContainer) {
                console.error('Required DOM element not found for SDM Module #306');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = localStorage.getItem(MODULE_STORAGE_KEY);
            const moduleData = savedData ? JSON.parse(savedData) : {};

            // إنشاء واجهة المستخدم
            createUI(moduleData, moduleContainer);
        } catch (error) {
            console.error('Error initializing SDM Module #306:', error);
        }
    }

    // دالة إنشاء واجهة المستخدم
    function createUI(data, container) {
        // إنشاء العنصر الرئيسي
        const moduleElement = document.createElement('div');
        moduleElement.id = 'sdm-module-306-content';
        moduleElement.className = 'sdm-module';

        // إضافة العنوان
        const title = document.createElement('h3');
        title.textContent = MODULE_NAME;
        moduleElement.appendChild(title);

        // إضافة المحتوى
        const content = document.createElement('div');
        content.textContent = data.content || 'No content yet';
        moduleElement.appendChild(content);

        // إضافة زر التحديث
        const updateButton = document.createElement('button');
        updateButton.textContent = 'Update Content';
        updateButton.addEventListener('click', () => updateContent(content));
        moduleElement.appendChild(updateButton);

        // إضافة الوحدة إلى الصفحة
        container.appendChild(moduleElement);
    }

    // دالة تحديث المحتوى
    function updateContent(contentElement) {
        const newContent = prompt('Enter new content:', contentElement.textContent);
        if (newContent !== null) {
            contentElement.textContent = newContent;

            // حفظ البيانات
            const moduleData = {
                content: newContent
            };
            localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify(moduleData));
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initModule();
    } else {
        document.addEventListener('DOMContentLoaded', initModule);
    }
})();