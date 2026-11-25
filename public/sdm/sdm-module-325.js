// public/sdm/sdm-module-325.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule325Data';
    const MODULE_NAME = 'SDM Module #325';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleContainer = document.getElementById('sdm-module-325');
            if (!moduleContainer) {
                console.error('Required DOM element not found for SDM Module #325');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = loadModuleData();

            // إنشاء واجهة المستخدم
            createModuleUI(moduleContainer, savedData);
        } catch (error) {
            console.error('Error initializing SDM Module #325:', error);
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
        const moduleElement = document.createElement('div');
        moduleElement.className = 'sdm-module';

        // إضافة العنوان
        const title = document.createElement('h3');
        title.textContent = MODULE_NAME;
        moduleElement.appendChild(title);

        // إضافة محتوى الوحدة
        const content = document.createElement('div');
        content.textContent = savedData.content || 'Welcome to SDM Module #325!';
        moduleElement.appendChild(content);

        // إضافة زر الحفظ
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Save';
        saveButton.addEventListener('click', () => saveModuleData(content.textContent));
        moduleElement.appendChild(saveButton);

        // إضافة الوحدة إلى الحاوية
        container.appendChild(moduleElement);
    }

    // دالة حفظ البيانات
    function saveModuleData(content) {
        try {
            const data = { content };
            localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify(data));
            console.log('Module data saved successfully');
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