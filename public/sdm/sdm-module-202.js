// public/sdm/sdm-module-202.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_NAME = 'SDM Module #202';
    const STORAGE_KEY = 'sdmModule202Data';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleContainer = document.getElementById('sdm-module-202');
            if (!moduleContainer) {
                console.warn('Module container not found');
                return;
            }

            // إنشاء واجهة المستخدم
            createUI(moduleContainer);

            // تحميل البيانات المحفوظة
            loadSavedData();

            console.log(`${MODULE_NAME} initialized successfully`);
        } catch (error) {
            console.error(`${MODULE_NAME} initialization error:`, error);
        }
    }

    // دالة إنشاء واجهة المستخدم
    function createUI(container) {
        // إنشاء العنصر الرئيسي
        const moduleElement = document.createElement('div');
        moduleElement.className = 'sdm-module';
        moduleElement.id = 'sdm-module-202';

        // إنشاء العنوان
        const titleElement = document.createElement('h3');
        titleElement.textContent = MODULE_NAME;
        moduleElement.appendChild(titleElement);

        // إنشاء حقل الإدخال
        const inputElement = document.createElement('input');
        inputElement.type = 'text';
        inputElement.id = 'sdm-module-202-input';
        inputElement.placeholder = 'Enter some text...';
        moduleElement.appendChild(inputElement);

        // إنشاء زر الحفظ
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Save';
        saveButton.addEventListener('click', saveData);
        moduleElement.appendChild(saveButton);

        // إنشاء عنصر العرض
        const displayElement = document.createElement('div');
        displayElement.id = 'sdm-module-202-display';
        moduleElement.appendChild(displayElement);

        container.appendChild(moduleElement);
    }

    // دالة حفظ البيانات
    function saveData() {
        try {
            const inputElement = document.getElementById('sdm-module-202-input');
            if (!inputElement) return;

            const data = inputElement.value;
            localStorage.setItem(STORAGE_KEY, data);

            displayData(data);
            console.log('Data saved successfully');
        } catch (error) {
            console.error('Error saving data:', error);
        }
    }

    // دالة عرض البيانات
    function displayData(data) {
        const displayElement = document.getElementById('sdm-module-202-display');
        if (displayElement) {
            displayElement.textContent = `Saved data: ${data}`;
        }
    }

    // دالة تحميل البيانات المحفوظة
    function loadSavedData() {
        try {
            const savedData = localStorage.getItem(STORAGE_KEY);
            if (savedData) {
                displayData(savedData);
                const inputElement = document.getElementById('sdm-module-202-input');
                if (inputElement) {
                    inputElement.value = savedData;
                }
            }
        } catch (error) {
            console.error('Error loading saved data:', error);
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }

    // ربط الدالة مع النافذة العالمية
    window.sdmModule202 = {
        init: initModule,
        save: saveData,
        load: loadSavedData
    };
})();