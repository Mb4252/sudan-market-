// public/sdm/sdm-module-211.js
(function() {
    'use strict';

    // إعدادات التوسعة
    const MODULE_STORAGE_KEY = 'sdmModule211Data';
    const MODULE_NAME = 'SDM Module #211';

    // دالة تهيئة التوسعة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            if (!document.getElementById('sdm-chat')) {
                console.warn('SDM chat UI not found, module will not initialize');
                return;
            }

            // تنفيذ الوظيفة الرئيسية
            setupModuleUI();

            console.log(`${MODULE_NAME} initialized successfully`);
        } catch (error) {
            console.error(`Error initializing ${MODULE_NAME}:`, error);
        }
    }

    // دالة إعداد واجهة المستخدم
    function setupModuleUI() {
        // إنشاء عنصر جديد للواجهة
        const moduleElement = document.createElement('div');
        moduleElement.id = 'sdm-module-211';
        moduleElement.className = 'sdm-module';

        // إضافة محتوى إلى العنصر
        moduleElement.innerHTML = `
            <div class="module-header">Module #211</div>
            <div class="module-content">
                <p>This is a small module with a single clear function.</p>
                <button id="module-211-action">Click Me</button>
            </div>
        `;

        // إضافة العنصر إلى واجهة SDM
        const chatContainer = document.getElementById('sdm-chat');
        if (chatContainer) {
            chatContainer.appendChild(moduleElement);

            // إضافة معالج الحدث للزر
            const actionButton = document.getElementById('module-211-action');
            if (actionButton) {
                actionButton.addEventListener('click', handleAction);
            }
        }
    }

    // دالة معالجة الحدث
    function handleAction() {
        try {
            // تنفيذ الوظيفة الرئيسية
            const currentData = localStorage.getItem(MODULE_STORAGE_KEY) || '0';
            const newCount = parseInt(currentData) + 1;
            localStorage.setItem(MODULE_STORAGE_KEY, newCount.toString());

            // تحديث واجهة المستخدم
            const contentElement = document.querySelector('#sdm-module-211 .module-content p');
            if (contentElement) {
                contentElement.textContent = `Button clicked ${newCount} times`;
            }

            console.log(`${MODULE_NAME} action performed. Count: ${newCount}`);
        } catch (error) {
            console.error(`Error in ${MODULE_NAME} action:`, error);
        }
    }

    // تهيئة التوسعة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }

    // تصدير الوظائف العامة
    window.sdmModule211 = {
        init: initModule,
        action: handleAction
    };
})();
