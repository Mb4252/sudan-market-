// public/sdm/sdm-module-241.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule241Data';
    const MODULE_NAME = 'SDM Module #241';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleElement = document.getElementById('sdm-module-241');
            if (!moduleElement) {
                console.error('Required DOM element not found for SDM Module #241');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = loadModuleData();

            // إنشاء واجهة المستخدم
            createModuleUI(moduleElement, savedData);

            // إعداد المستمعين للأحداث
            setupEventListeners(moduleElement);

            console.log(`${MODULE_NAME} initialized successfully`);
        } catch (error) {
            console.error(`${MODULE_NAME} initialization error:`, error);
        }
    }

    // دالة تحميل البيانات المحفوظة
    function loadModuleData() {
        try {
            const data = localStorage.getItem(MODULE_STORAGE_KEY);
            return data ? JSON.parse(data) : { enabled: false, lastUsed: null };
        } catch (error) {
            console.error('Error loading module data:', error);
            return { enabled: false, lastUsed: null };
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

    // دالة إنشاء واجهة المستخدم
    function createModuleUI(element, data) {
        element.innerHTML = `
            <div class="module-content">
                <h3>${MODULE_NAME}</h3>
                <p>This is a sample module for Sudan Market.</p>
                <label>
                    <input type="checkbox" class="module-toggle" ${data.enabled ? 'checked' : ''}>
                    Enable Module
                </label>
                <div class="module-status">Status: ${data.enabled ? 'Enabled' : 'Disabled'}</div>
            </div>
        `;
    }

    // دالة إعداد المستمعين للأحداث
    function setupEventListeners(element) {
        const toggle = element.querySelector('.module-toggle');
        const status = element.querySelector('.module-status');

        if (toggle && status) {
            toggle.addEventListener('change', function() {
                const data = {
                    enabled: this.checked,
                    lastUsed: new Date().toISOString()
                };
                saveModuleData(data);
                status.textContent = `Status: ${data.enabled ? 'Enabled' : 'Disabled'}`;
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