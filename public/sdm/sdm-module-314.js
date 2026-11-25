// public/sdm/sdm-module-314.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule314Data';
    const MODULE_NAME = 'SDM Module #314';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleContainer = document.getElementById('sdm-module-314');
            if (!moduleContainer) {
                console.error('Required DOM element not found for SDM Module #314');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = loadModuleData();

            // إنشاء واجهة المستخدم
            createModuleUI(moduleContainer, savedData);

            // تهيئة الأحداث
            setupModuleEvents();
        } catch (error) {
            console.error('Error initializing SDM Module #314:', error);
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
        const moduleTitle = document.createElement('h3');
        moduleTitle.textContent = MODULE_NAME;

        const moduleToggle = document.createElement('button');
        moduleToggle.id = 'sdm-module-314-toggle';
        moduleToggle.textContent = data.enabled ? 'Disable' : 'Enable';
        moduleToggle.className = data.enabled ? 'active' : '';

        const moduleStatus = document.createElement('p');
        moduleStatus.id = 'sdm-module-314-status';
        moduleStatus.textContent = data.enabled ? 'Module is enabled' : 'Module is disabled';

        container.appendChild(moduleTitle);
        container.appendChild(moduleToggle);
        container.appendChild(moduleStatus);
    }

    // دالة تهيئة الأحداث
    function setupModuleEvents() {
        const toggleButton = document.getElementById('sdm-module-314-toggle');
        if (toggleButton) {
            toggleButton.addEventListener('click', function() {
                const statusElement = document.getElementById('sdm-module-314-status');
                const isEnabled = this.classList.toggle('active');

                if (statusElement) {
                    statusElement.textContent = isEnabled ? 'Module is enabled' : 'Module is disabled';
                }

                this.textContent = isEnabled ? 'Disable' : 'Enable';

                // حفظ الحالة
                try {
                    const data = {
                        enabled: isEnabled,
                        lastUsed: new Date().toISOString()
                    };
                    localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify(data));
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
})();