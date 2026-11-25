// public/sdm/sdm-module-292.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule292Data';
    const MODULE_NAME = 'SDM Module #292';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleElement = document.getElementById('sdm-module-292');
            if (!moduleElement) {
                console.error('Required DOM element not found for ' + MODULE_NAME);
                return;
            }

            // تحميل البيانات المحفوظة
            let moduleData = loadModuleData();

            // إنشاء واجهة المستخدم
            createModuleUI(moduleData);

            // إعداد مستمعين الأحداث
            setupEventListeners();

            console.log(MODULE_NAME + ' initialized successfully');
        } catch (error) {
            console.error('Error initializing ' + MODULE_NAME + ':', error);
        }
    }

    // دالة تحميل البيانات المحفوظة
    function loadModuleData() {
        try {
            const data = localStorage.getItem(MODULE_STORAGE_KEY);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('Error loading ' + MODULE_NAME + ' data:', error);
            return {};
        }
    }

    // دالة حفظ البيانات
    function saveModuleData(data) {
        try {
            localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('Error saving ' + MODULE_NAME + ' data:', error);
        }
    }

    // دالة إنشاء واجهة المستخدم
    function createModuleUI(data) {
        const moduleElement = document.getElementById('sdm-module-292');
        if (!moduleElement) return;

        moduleElement.innerHTML = `
            <h3>${MODULE_NAME}</h3>
            <div id="module-292-content">${data.content || 'No content yet'}</div>
            <button id="module-292-button">Update</button>
        `;
    }

    // دالة إعداد مستمعين الأحداث
    function setupEventListeners() {
        const button = document.getElementById('module-292-button');
        if (button) {
            button.addEventListener('click', () => {
                const contentElement = document.getElementById('module-292-content');
                if (contentElement) {
                    const newContent = prompt('Enter new content:', contentElement.textContent);
                    if (newContent !== null) {
                        contentElement.textContent = newContent;
                        saveModuleData({ content: newContent });
                    }
                }
            });
        }
    }

    // تشغيل الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }

    // ربط الدوال مع النافذة العالمية
    window.sdmModule292 = {
        init: initModule,
        saveData: saveModuleData,
        loadData: loadModuleData
    };
})();