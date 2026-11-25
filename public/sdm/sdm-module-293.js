// public/sdm/sdm-module-293.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule293Data';
    const MODULE_NAME = 'SDM Module #293';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleElement = document.getElementById('sdm-module-293');
            if (!moduleElement) {
                console.error('Required DOM element not found for SDM Module #293');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = localStorage.getItem(MODULE_STORAGE_KEY);
            const moduleData = savedData ? JSON.parse(savedData) : {};

            // إنشاء واجهة المستخدم
            createUI(moduleData, moduleElement);

            // تهيئة الأحداث
            setupEvents(moduleData);
        } catch (error) {
            console.error('Error initializing SDM Module #293:', error);
        }
    }

    // دالة إنشاء واجهة المستخدم
    function createUI(data, container) {
        // إنشاء عنصر واجهة المستخدم
        const moduleElement = document.createElement('div');
        moduleElement.id = 'sdm-module-293-content';
        moduleElement.className = 'sdm-module';

        // إضافة العنوان
        const titleElement = document.createElement('h3');
        titleElement.textContent = MODULE_NAME;
        moduleElement.appendChild(titleElement);

        // إضافة المحتوى
        const contentElement = document.createElement('div');
        contentElement.id = 'sdm-module-293-content-text';
        contentElement.textContent = data.content || 'No content yet';
        moduleElement.appendChild(contentElement);

        // إضافة زر التحديث
        const updateButton = document.createElement('button');
        updateButton.id = 'sdm-module-293-update';
        updateButton.textContent = 'Update Content';
        moduleElement.appendChild(updateButton);

        // إضافة التوسعة إلى الصفحة
        container.appendChild(moduleElement);
    }

    // دالة تهيئة الأحداث
    function setupEvents(data) {
        // حدث تحديث المحتوى
        document.getElementById('sdm-module-293-update').addEventListener('click', () => {
            const newContent = prompt('Enter new content:', data.content || '');
            if (newContent !== null) {
                data.content = newContent;
                document.getElementById('sdm-module-293-content-text').textContent = newContent;
                localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify(data));
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