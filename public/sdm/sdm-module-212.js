// public/sdm/sdm-module-212.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule212Data';
    const MODULE_NAME = 'SDM Module #212';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const chatElement = document.getElementById('sdm-chat');
            if (!chatElement) {
                console.warn('SDM chat UI not found, module will not initialize');
                return;
            }

            // إنشاء عنصر جديد للوحدة
            const moduleElement = document.createElement('div');
            moduleElement.id = 'sdm-module-212';
            moduleElement.className = 'sdm-module';
            moduleElement.innerHTML = `
                <div class="module-header">Module #212</div>
                <div class="module-content">
                    <p>Welcome to SDM Module #212</p>
                    <button id="sdm-module-212-button">Click Me</button>
                    <div id="sdm-module-212-output"></div>
                </div>
            `;

            // إضافة الوحدة إلى واجهة المستخدم
            chatElement.appendChild(moduleElement);

            // إضافة مستمع للحدث
            document.getElementById('sdm-module-212-button').addEventListener('click', handleButtonClick);

            // تحميل البيانات المحفوظة
            loadSavedData();

            console.log(`${MODULE_NAME} initialized successfully`);
        } catch (error) {
            console.error(`${MODULE_NAME} initialization failed:`, error);
        }
    }

    // دالة معالجة النقر على الزر
    function handleButtonClick() {
        try {
            const outputElement = document.getElementById('sdm-module-212-output');
            if (!outputElement) return;

            // إنشاء رسالة
            const message = `Button clicked at ${new Date().toLocaleTimeString()}`;
            outputElement.textContent = message;

            // حفظ الرسالة
            saveData(message);
        } catch (error) {
            console.error('Error handling button click:', error);
        }
    }

    // دالة حفظ البيانات
    function saveData(data) {
        try {
            localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify({
                data,
                timestamp: new Date().toISOString()
            }));
        } catch (error) {
            console.error('Error saving data:', error);
        }
    }

    // دالة تحميل البيانات المحفوظة
    function loadSavedData() {
        try {
            const savedData = localStorage.getItem(MODULE_STORAGE_KEY);
            if (savedData) {
                const parsedData = JSON.parse(savedData);
                const outputElement = document.getElementById('sdm-module-212-output');
                if (outputElement) {
                    outputElement.textContent = `Last saved: ${parsedData.data}`;
                }
            }
        } catch (error) {
            console.error('Error loading saved data:', error);
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }

    // تصدير الدوال العامة
    window.sdmModule212 = {
        init: initModule,
        saveData,
        loadSavedData
    };
})();