// public/sdm/sdm-module-236.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule236Data';
    const MODULE_NAME = 'SDM Module #236';
    const MODULE_ELEMENT_ID = 'sdm-module-236';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleElement = document.getElementById(MODULE_ELEMENT_ID);
            if (!moduleElement) {
                console.error(`${MODULE_NAME}: Required DOM element not found`);
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = loadModuleData();

            // إنشاء واجهة المستخدم
            createUI(moduleElement);

            // تطبيق الإعدادات المحفوظة
            applySavedSettings(savedData);

            // إعداد مستمعي الأحداث
            setupEventListeners();

            console.log(`${MODULE_NAME} initialized successfully`);
        } catch (error) {
            console.error(`${MODULE_NAME} initialization error:`, error);
        }
    }

    // دالة إنشاء واجهة المستخدم
    function createUI(container) {
        container.innerHTML = `
            <div class="module-header">${MODULE_NAME}</div>
            <div class="module-content">
                <div class="setting">
                    <label for="module236-toggle">Enable Feature:</label>
                    <input type="checkbox" id="module236-toggle" checked>
                </div>
                <div class="setting">
                    <label for="module236-color">Color:</label>
                    <input type="color" id="module236-color" value="#4285f4">
                </div>
            </div>
        `;
    }

    // دالة تطبيق الإعدادات المحفوظة
    function applySavedSettings(data) {
        if (data && data.enabled !== undefined) {
            document.getElementById('module236-toggle').checked = data.enabled;
        }
        if (data && data.color) {
            document.getElementById('module236-color').value = data.color;
        }
    }

    // دالة تحميل البيانات المحفوظة
    function loadModuleData() {
        try {
            const data = localStorage.getItem(MODULE_STORAGE_KEY);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error(`${MODULE_NAME} error loading data:`, error);
            return null;
        }
    }

    // دالة حفظ البيانات
    function saveModuleData() {
        try {
            const data = {
                enabled: document.getElementById('module236-toggle').checked,
                color: document.getElementById('module236-color').value
            };
            localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error(`${MODULE_NAME} error saving data:`, error);
        }
    }

    // دالة إعداد مستمعي الأحداث
    function setupEventListeners() {
        document.getElementById('module236-toggle').addEventListener('change', saveModuleData);
        document.getElementById('module236-color').addEventListener('change', saveModuleData);
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }

    // ربط الدالة مع النافذة العالمية
    window.initSdmModule236 = initModule;
})();
