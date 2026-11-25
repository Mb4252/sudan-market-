// public/sdm/sdm-module-295.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule295Data';
    const MODULE_NAME = 'SDM Module #295';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleElement = document.getElementById('sdm-module-295');
            if (!moduleElement) {
                console.error('Required DOM elements not found for SDM Module #295');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = loadModuleData();

            // إنشاء واجهة المستخدم
            createModuleUI(moduleElement, savedData);

            // تهيئة الأحداث
            setupModuleEvents();
        } catch (error) {
            console.error('Error initializing SDM Module #295:', error);
        }
    }

    // دالة تحميل البيانات المحفوظة
    function loadModuleData() {
        try {
            const data = localStorage.getItem(MODULE_STORAGE_KEY);
            return data ? JSON.parse(data) : { enabled: true, lastUsed: new Date().toISOString() };
        } catch (error) {
            console.error('Error loading module data:', error);
            return { enabled: true, lastUsed: new Date().toISOString() };
        }
    }

    // دالة إنشاء واجهة المستخدم
    function createModuleUI(element, data) {
        const content = `
            <h3>${MODULE_NAME}</h3>
            <div class="module-content">
                <p>This is an example module for Sudan Market.</p>
                <div class="module-controls">
                    <label>
                        <input type="checkbox" id="module295-toggle" ${data.enabled ? 'checked' : ''}>
                        Enable Module
                    </label>
                </div>
            </div>
        `;

        element.innerHTML = content;
    }

    // دالة تهيئة الأحداث
    function setupModuleEvents() {
        const toggle = document.getElementById('module295-toggle');
        if (toggle) {
            toggle.addEventListener('change', function() {
                const data = loadModuleData();
                data.enabled = this.checked;
                saveModuleData(data);
            });
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

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }
})();