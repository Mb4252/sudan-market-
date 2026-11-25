// public/sdm/sdm-module-319.js
(function() {
    'use strict';

    // إعدادات التوسعة
    const MODULE_STORAGE_KEY = 'sdmModule319Data';
    const MODULE_NAME = 'SDM Module #319';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleElement = document.getElementById('sdm-module-319');
            if (!moduleElement) {
                console.error('Required DOM element not found for SDM Module #319');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = loadModuleData();

            // إنشاء واجهة المستخدم
            createModuleUI(moduleElement, savedData);

            // إعداد الأحداث
            setupModuleEvents(moduleElement);
        } catch (error) {
            console.error('Error initializing SDM Module #319:', error);
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
        const content = `
            <h3>${MODULE_NAME}</h3>
            <div class="module-content">
                <p>This is a sample module for Sudan Market.</p>
                <label>
                    <input type="checkbox" id="module319-toggle" ${data.enabled ? 'checked' : ''}>
                    Enable Module
                </label>
                <div id="module319-last-used">Last used: ${data.lastUsed || 'Never'}</div>
            </div>
        `;
        element.innerHTML = content;
    }

    // دالة إعداد الأحداث
    function setupModuleEvents(element) {
        const toggle = element.querySelector('#module319-toggle');
        if (toggle) {
            toggle.addEventListener('change', function() {
                const data = {
                    enabled: this.checked,
                    lastUsed: new Date().toISOString()
                };
                saveModuleData(data);
                const lastUsedElement = element.querySelector('#module319-last-used');
                if (lastUsedElement) {
                    lastUsedElement.textContent = `Last used: ${data.lastUsed}`;
                }
            });
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initModule();
    } else {
        document.addEventListener('DOMContentLoaded', initModule);
    }
})();