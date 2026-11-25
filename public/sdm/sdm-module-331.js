// public/sdm/sdm-module-331.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule331Data';
    const MODULE_NAME = 'SDM Module #331';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleContainer = document.getElementById('sdm-module-331');
            if (!moduleContainer) {
                console.error('Module container not found');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = loadModuleData();

            // إنشاء واجهة المستخدم
            createUI(moduleContainer, savedData);
        } catch (error) {
            console.error('Error initializing module:', error);
        }
    }

    // تحميل البيانات المحفوظة
    function loadModuleData() {
        try {
            const data = localStorage.getItem(MODULE_STORAGE_KEY);
            return data ? JSON.parse(data) : { enabled: false, lastUsed: null };
        } catch (error) {
            console.error('Error loading module data:', error);
            return { enabled: false, lastUsed: null };
        }
    }

    // حفظ البيانات
    function saveModuleData(data) {
        try {
            localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('Error saving module data:', error);
        }
    }

    // إنشاء واجهة المستخدم
    function createUI(container, data) {
        const moduleTitle = document.createElement('h3');
        moduleTitle.textContent = MODULE_NAME;
        container.appendChild(moduleTitle);

        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'switch';

        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.checked = data.enabled;
        toggleInput.id = 'sdm-module-331-toggle';
        toggleLabel.appendChild(toggleInput);

        const toggleSlider = document.createElement('span');
        toggleSlider.className = 'slider round';
        toggleLabel.appendChild(toggleSlider);

        container.appendChild(toggleLabel);

        const statusElement = document.createElement('p');
        statusElement.id = 'sdm-module-331-status';
        statusElement.textContent = data.enabled ? 'Enabled' : 'Disabled';
        container.appendChild(statusElement);

        // تهيئة الأحداث
        toggleInput.addEventListener('change', function() {
            const newData = {
                enabled: this.checked,
                lastUsed: new Date().toISOString()
            };
            saveModuleData(newData);
            statusElement.textContent = this.checked ? 'Enabled' : 'Disabled';
        });
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }
})();