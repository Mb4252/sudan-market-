// public/sdm/sdm-module-353.js
(function() {
    'use strict';

    // إعدادات التوسعة
    const ADDON_STORAGE_KEY = 'sdmModule353Data';
    const ADDON_NAME = 'SDM Module #353';

    // دالة تهيئة التوسعة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const chatContainer = document.getElementById('sdm-chat');
            if (!chatContainer) {
                console.error('Required DOM elements not found for SDM Module #353');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = loadModuleData();

            // تهيئة الواجهة
            initUI(savedData);

            // تهيئة الأحداث
            initEvents();
        } catch (error) {
            console.error('Error initializing SDM Module #353:', error);
        }
    }

    // دالة تحميل البيانات المحفوظة
    function loadModuleData() {
        try {
            const data = localStorage.getItem(ADDON_STORAGE_KEY);
            return data ? JSON.parse(data) : { enabled: false, settings: {} };
        } catch (error) {
            console.error('Error loading module data:', error);
            return { enabled: false, settings: {} };
        }
    }

    // دالة تهيئة الواجهة
    function initUI(data) {
        const moduleContainer = document.createElement('div');
        moduleContainer.id = 'sdm-module-353';
        moduleContainer.innerHTML = `
            <div class="module-header">
                <h3>${ADDON_NAME}</h3>
                <button id="sdm-module-353-toggle" class="toggle-btn">${data.enabled ? 'Disable' : 'Enable'}</button>
            </div>
            <div class="module-content" style="display: ${data.enabled ? 'block' : 'none'}">
                <!-- محتوى الوحدة هنا -->
            </div>
        `;

        document.getElementById('sdm-chat').appendChild(moduleContainer);
    }

    // دالة تهيئة الأحداث
    function initEvents() {
        const toggleBtn = document.getElementById('sdm-module-353-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', toggleModule);
        }
    }

    // دالة تفعيل/تعطيل الوحدة
    function toggleModule() {
        const data = loadModuleData();
        data.enabled = !data.enabled;

        try {
            localStorage.setItem(ADDON_STORAGE_KEY, JSON.stringify(data));
            const content = document.querySelector('#sdm-module-353 .module-content');
            const toggleBtn = document.getElementById('sdm-module-353-toggle');

            if (content && toggleBtn) {
                content.style.display = data.enabled ? 'block' : 'none';
                toggleBtn.textContent = data.enabled ? 'Disable' : 'Enable';
            }
        } catch (error) {
            console.error('Error toggling module:', error);
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }
})();