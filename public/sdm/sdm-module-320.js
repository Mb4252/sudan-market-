// public/sdm/sdm-module-320.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule320Data';
    const MODULE_NAME = 'SDM Module #320';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleElement = document.getElementById('sdm-module-320');
            if (!moduleElement) {
                console.error('Required DOM element not found for SDM Module #320');
                return;
            }

            // تحميل البيانات المحفوظة
            let moduleData = loadModuleData();

            // إنشاء واجهة المستخدم
            createModuleUI(moduleData, moduleElement);

            // تحديث البيانات كل 5 دقائق
            setInterval(() => {
                moduleData = updateModuleData(moduleData);
                saveModuleData(moduleData);
            }, 300000);
        } catch (error) {
            console.error('Error initializing SDM Module #320:', error);
        }
    }

    // دالة تحميل البيانات
    function loadModuleData() {
        try {
            const data = localStorage.getItem(MODULE_STORAGE_KEY);
            return data ? JSON.parse(data) : { lastUpdate: new Date().toISOString() };
        } catch (error) {
            console.error('Error loading module data:', error);
            return { lastUpdate: new Date().toISOString() };
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

    // دالة تحديث البيانات
    function updateModuleData(data) {
        data.lastUpdate = new Date().toISOString();
        return data;
    }

    // دالة إنشاء واجهة المستخدم
    function createModuleUI(data, element) {
        element.innerHTML = `
            <div class="module-header">${MODULE_NAME}</div>
            <div class="module-content">
                <p>Last updated: ${new Date(data.lastUpdate).toLocaleString()}</p>
                <button id="refresh-module-320">Refresh</button>
            </div>
        `;

        // إضافة معالج الحدث للزر
        document.getElementById('refresh-module-320').addEventListener('click', () => {
            const updatedData = updateModuleData(data);
            saveModuleData(updatedData);
            createModuleUI(updatedData, element);
        });
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }
})();