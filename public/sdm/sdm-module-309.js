// public/sdm/sdm-module-309.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule309Data';
    const MODULE_NAME = 'SDM Module #309';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleElement = document.getElementById('sdm-module-309');
            if (!moduleElement) {
                console.error('Required DOM element not found for SDM Module #309');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = localStorage.getItem(MODULE_STORAGE_KEY);
            const moduleData = savedData ? JSON.parse(savedData) : {};

            // إنشاء واجهة المستخدم
            createUI(moduleData, moduleElement);

            // تفعيل الوظائف
            activateFeatures(moduleData);
        } catch (e) {
            console.error('Error initializing SDM Module #309:', e);
        }
    }

    // دالة إنشاء واجهة المستخدم
    function createUI(data, container) {
        // إنشاء العنصر الرئيسي
        const moduleElement = document.createElement('div');
        moduleElement.id = 'sdm-module-309-content';
        moduleElement.className = 'sdm-module';

        // إضافة العنوان
        const titleElement = document.createElement('h3');
        titleElement.textContent = MODULE_NAME;
        moduleElement.appendChild(titleElement);

        // إضافة المحتوى
        const contentElement = document.createElement('div');
        contentElement.id = 'sdm-module-309-content-text';
        contentElement.textContent = data.content || 'No content yet';
        moduleElement.appendChild(contentElement);

        // إضافة زر التحديث
        const updateButton = document.createElement('button');
        updateButton.id = 'sdm-module-309-update';
        updateButton.textContent = 'Update Content';
        moduleElement.appendChild(updateButton);

        // إضافة العنصر إلى الحاوية
        container.appendChild(moduleElement);
    }

    // دالة تفعيل الوظائف
    function activateFeatures(data) {
        const updateButton = document.getElementById('sdm-module-309-update');
        if (updateButton) {
            updateButton.addEventListener('click', () => updateContent(data));
        }
    }

    // دالة تحديث المحتوى
    function updateContent(data) {
        const newContent = prompt('Enter new content:', data.content || '');
        if (newContent !== null) {
            data.content = newContent;
            localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify(data));
            document.getElementById('sdm-module-309-content-text').textContent = newContent;
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initModule();
    } else {
        document.addEventListener('DOMContentLoaded', initModule);
    }
})();