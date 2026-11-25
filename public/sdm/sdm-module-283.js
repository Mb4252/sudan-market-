// public/sdm/sdm-module-283.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule283Data';
    const MODULE_NAME = 'SDM Module #283';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleContainer = document.getElementById('sdm-module-283');
            if (!moduleContainer) {
                console.error('Required DOM element not found for SDM Module #283');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = loadModuleData();

            // إنشاء واجهة المستخدم
            createModuleUI(moduleContainer, savedData);
        } catch (error) {
            console.error('Error initializing SDM Module #283:', error);
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
        moduleElement.id = 'sdm-module-283-content';
        moduleElement.className = 'sdm-module-content';

        // إضافة العنوان
        const titleElement = document.createElement('h3');
        titleElement.textContent = MODULE_NAME;
        moduleElement.appendChild(titleElement);

        // إضافة المحتوى
        const contentElement = document.createElement('div');
        contentElement.textContent = data.content || 'No content saved yet.';
        moduleElement.appendChild(contentElement);

        // إضافة زر الحفظ
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Save Content';
        saveButton.addEventListener('click', () => {
            const newContent = prompt('Enter new content:', data.content || '');
            if (newContent !== null) {
                data.content = newContent;
                saveModuleData(data);
                contentElement.textContent = newContent;
            }
        });
        moduleElement.appendChild(saveButton);

        // إضافة الوحدة إلى الحاوية
        container.appendChild(moduleElement);
    }

    // دالة حفظ البيانات
    function saveModuleData(data) {
        try {
            localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('Error saving module data:', error);
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }
})();