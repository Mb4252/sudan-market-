// public/sdm/sdm-module-232.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule232Data';
    const MODULE_NAME = 'SDM Module #232';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleContainer = document.getElementById('sdm-module-232');
            if (!moduleContainer) {
                console.error('Required DOM element not found for SDM Module #232');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = loadModuleData();

            // إنشاء واجهة المستخدم
            createModuleUI(moduleContainer, savedData);

            // تهيئة الأحداث
            setupModuleEvents();
        } catch (error) {
            console.error('Error initializing SDM Module #232:', error);
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

    // دالة إنشاء واجهة المستخدم
    function createModuleUI(container, data) {
        const moduleHeader = document.createElement('h3');
        moduleHeader.textContent = MODULE_NAME;
        container.appendChild(moduleHeader);

        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'switch';

        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.id = 'sdm-module-232-toggle';
        toggleInput.checked = data.enabled;

        const toggleSlider = document.createElement('span');
        toggleSlider.className = 'slider round';

        toggleLabel.appendChild(toggleInput);
        toggleLabel.appendChild(toggleSlider);
        container.appendChild(toggleLabel);

        const statusText = document.createElement('p');
        statusText.id = 'sdm-module-232-status';
        statusText.textContent = data.enabled ? 'Enabled' : 'Disabled';
        container.appendChild(statusText);
    }

    // دالة تهيئة الأحداث
    function setupModuleEvents() {
        const toggleInput = document.getElementById('sdm-module-232-toggle');
        const statusText = document.getElementById('sdm-module-232-status');

        if (toggleInput && statusText) {
            toggleInput.addEventListener('change', function() {
                const isEnabled = this.checked;
                statusText.textContent = isEnabled ? 'Enabled' : 'Disabled';

                // حفظ الحالة
                try {
                    localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify({
                        enabled: isEnabled,
                        lastUsed: new Date().toISOString()
                    }));
                } catch (error) {
                    console.error('Error saving module state:', error);
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

    // ربط الدالة مع النافذة العالمية
    window.initSdmModule232 = initModule;
})();