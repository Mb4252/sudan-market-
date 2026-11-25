// public/sdm/sdm-module-339.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule339Data';
    const MODULE_NAME = 'SDM Module #339';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleElement = document.getElementById('sdm-module-339');
            if (!moduleElement) {
                console.error('Required DOM element not found for SDM Module #339');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = loadModuleData();

            // إنشاء واجهة المستخدم
            createModuleUI(moduleElement, savedData);

            // تفعيل الوظائف
            activateModuleFeatures(moduleElement, savedData);
        } catch (error) {
            console.error('Error initializing SDM Module #339:', error);
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
    function createModuleUI(container, savedData) {
        // إنشاء العنصر الرئيسي
        const moduleContainer = document.createElement('div');
        moduleContainer.className = 'sdm-module-container';

        // إنشاء العنوان
        const titleElement = document.createElement('h3');
        titleElement.textContent = MODULE_NAME;
        moduleContainer.appendChild(titleElement);

        // إنشاء المحتوى
        const contentElement = document.createElement('div');
        contentElement.className = 'sdm-module-content';
        contentElement.textContent = savedData.content || 'No content yet';
        moduleContainer.appendChild(contentElement);

        // إضافة الوحدة إلى الحاوية
        container.appendChild(moduleContainer);
    }

    // دالة تفعيل الوظائف
    function activateModuleFeatures(container, savedData) {
        // تفعيل الوظيفة الأساسية
        const contentElement = container.querySelector('.sdm-module-content');
        if (contentElement) {
            contentElement.addEventListener('click', () => {
                const newContent = prompt('Enter new content:', savedData.content || '');
                if (newContent !== null) {
                    savedData.content = newContent;
                    contentElement.textContent = newContent;
                    saveModuleData(savedData);
                }
            });
        }
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