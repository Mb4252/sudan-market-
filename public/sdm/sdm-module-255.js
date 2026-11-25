// public/sdm/sdm-module-255.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule255Data';
    const MODULE_NAME = 'SDM Module #255';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleElement = document.getElementById('sdm-module-255');
            if (!moduleElement) {
                console.error('Required DOM element not found for SDM Module #255');
                return;
            }

            // تحميل البيانات المحفوظة
            let moduleData = loadModuleData();

            // إنشاء واجهة المستخدم
            createModuleUI(moduleData);

            // إعداد مستمعين الأحداث
            setupEventListeners();

            console.log(`${MODULE_NAME} initialized successfully`);
        } catch (error) {
            console.error(`Error initializing ${MODULE_NAME}:`, error);
        }
    }

    // دالة تحميل البيانات المحفوظة
    function loadModuleData() {
        try {
            const data = localStorage.getItem(MODULE_STORAGE_KEY);
            return data ? JSON.parse(data) : { count: 0 };
        } catch (error) {
            console.error(`Error loading ${MODULE_NAME} data:`, error);
            return { count: 0 };
        }
    }

    // دالة حفظ البيانات
    function saveModuleData(data) {
        try {
            localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error(`Error saving ${MODULE_NAME} data:`, error);
        }
    }

    // دالة إنشاء واجهة المستخدم
    function createModuleUI(data) {
        const moduleElement = document.getElementById('sdm-module-255');
        if (moduleElement) {
            moduleElement.innerHTML = `
                <div class="module-header">${MODULE_NAME}</div>
                <div class="module-content">
                    <p>Count: <span id="sdm-module-255-count">${data.count}</span></p>
                    <button id="sdm-module-255-increment">Increment</button>
                </div>
            `;
        }
    }

    // دالة تحديث واجهة المستخدم
    function updateModuleUI(data) {
        const countElement = document.getElementById('sdm-module-255-count');
        if (countElement) {
            countElement.textContent = data.count;
        }
    }

    // دالة إعداد مستمعين الأحداث
    function setupEventListeners() {
        const incrementButton = document.getElementById('sdm-module-255-increment');
        if (incrementButton) {
            incrementButton.addEventListener('click', () => {
                let data = loadModuleData();
                data.count++;
                saveModuleData(data);
                updateModuleUI(data);
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