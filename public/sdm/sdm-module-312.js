// public/sdm/sdm-module-312.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule312Data';
    const MODULE_NAME = 'SDM Module #312';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleElement = document.getElementById('sdm-module-312');
            if (!moduleElement) {
                console.error('Required DOM element not found for SDM Module #312');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = loadModuleData();

            // إنشاء واجهة المستخدم
            createModuleUI(moduleElement, savedData);

            // تهيئة الأحداث
            setupModuleEvents();
        } catch (error) {
            console.error('Error initializing SDM Module #312:', error);
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
        moduleContainer.id = 'sdm-module-312-container';
        moduleContainer.className = 'sdm-module';

        // إنشاء العنوان
        const titleElement = document.createElement('h3');
        titleElement.textContent = MODULE_NAME;
        moduleContainer.appendChild(titleElement);

        // إنشاء الحقل النصي
        const inputElement = document.createElement('input');
        inputElement.type = 'text';
        inputElement.id = 'sdm-module-312-input';
        inputElement.placeholder = 'Enter your text here...';
        inputElement.value = savedData.text || '';
        moduleContainer.appendChild(inputElement);

        // إنشاء زر الحفظ
        const saveButton = document.createElement('button');
        saveButton.id = 'sdm-module-312-save';
        saveButton.textContent = 'Save';
        moduleContainer.appendChild(saveButton);

        // إضافة الوحدة إلى الحاوية
        container.appendChild(moduleContainer);
    }

    // دالة تهيئة الأحداث
    function setupModuleEvents() {
        const saveButton = document.getElementById('sdm-module-312-save');
        const inputElement = document.getElementById('sdm-module-312-input');

        if (saveButton && inputElement) {
            saveButton.addEventListener('click', () => {
                try {
                    const data = {
                        text: inputElement.value,
                        timestamp: new Date().toISOString()
                    };
                    localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify(data));
                    console.log('Data saved successfully');
                } catch (error) {
                    console.error('Error saving data:', error);
                }
            });
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }

})();