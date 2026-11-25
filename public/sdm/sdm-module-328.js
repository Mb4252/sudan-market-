// public/sdm/sdm-module-328.js
(function() {
    'use strict';

    // إعدادات التوسعة
    const MODULE_STORAGE_KEY = 'sdmModule328Data';
    const MODULE_NAME = 'SDM Module #328';

    // دالة تهيئة التوسعة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleElement = document.getElementById('sdm-module-325');
            if (!moduleElement) {
                console.error('Required DOM element not found for SDM Module #328');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = loadModuleData();

            // إنشاء واجهة المستخدم
            createUI(savedData, moduleElement);

            // تهيئة الأحداث
            setupEvents(moduleElement);
        } catch (e) {
            console.error('Error initializing SDM Module #328:', e);
        }
    }

    // دالة تحميل البيانات المحفوظة
    function loadModuleData() {
        try {
            const data = localStorage.getItem(MODULE_STORAGE_KEY);
            return data ? JSON.parse(data) : {};
        } catch (e) {
            console.error('Error loading module data:', e);
            return {};
        }
    }

    // دالة حفظ البيانات
    function saveModuleData(data) {
        try {
            localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('Error saving module data:', e);
        }
    }

    // دالة إنشاء واجهة المستخدم
    function createUI(savedData, parentElement) {
        // إنشاء عنصر واجهة المستخدم
        const moduleElement = document.createElement('div');
        moduleElement.id = 'sdm-module-328';
        moduleElement.className = 'sdm-module';

        // إنشاء عنوان التوسعة
        const titleElement = document.createElement('h3');
        titleElement.textContent = MODULE_NAME;
        moduleElement.appendChild(titleElement);

        // إنشاء محتوى التوسعة
        const contentElement = document.createElement('div');
        contentElement.id = 'sdm-module-328-content';
        contentElement.textContent = savedData.content || 'No content saved yet.';
        moduleElement.appendChild(contentElement);

        // إنشاء زر الحفظ
        const saveButton = document.createElement('button');
        saveButton.id = 'sdm-module-328-save';
        saveButton.textContent = 'Save Content';
        moduleElement.appendChild(saveButton);

        // إضافة التوسعة إلى واجهة المستخدم الرئيسية
        parentElement.appendChild(moduleElement);
    }

    // دالة تهيئة الأحداث
    function setupEvents(parentElement) {
        const saveButton = parentElement.querySelector('#sdm-module-328-save');
        const contentElement = parentElement.querySelector('#sdm-module-328-content');

        if (saveButton && contentElement) {
            saveButton.addEventListener('click', () => {
                const content = contentElement.textContent;
                saveModuleData({ content });
                alert('Content saved successfully!');
            });
        }
    }

    // تهيئة التوسعة عند تحميل الصفحة
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initModule();
    } else {
        document.addEventListener('DOMContentLoaded', initModule);
    }

    // ربط الدوال مع النافذة العالمية
    window.sdmModule328 = {
        init: initModule,
        saveData: saveModuleData,
        loadData: loadModuleData
    };
})();