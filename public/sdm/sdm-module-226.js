// public/sdm/sdm-module-226.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const STORAGE_KEY = 'sdmModule226Data';
    const MODULE_NAME = 'SDM Module #226';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const chatElement = document.getElementById('sdm-chat');
            if (!chatElement) {
                console.warn('SDM chat UI not found, module will not initialize');
                return;
            }

            // إنشاء عنصر جديد للواجهة
            const moduleElement = document.createElement('div');
            moduleElement.id = 'sdm-module-226';
            moduleElement.className = 'sdm-module';
            moduleElement.innerHTML = `
                <div class="module-header">${MODULE_NAME}</div>
                <div class="module-content">
                    <p>This is a simple SDM module that demonstrates basic functionality.</p>
                    <button id="sdm-module-226-button">Click me</button>
                    <div id="sdm-module-226-output"></div>
                </div>
            `;

            // إضافة الوحدة إلى الواجهة
            chatElement.appendChild(moduleElement);

            // إضافة مستمع الحدث
            document.getElementById('sdm-module-226-button').addEventListener('click', function() {
                const outputElement = document.getElementById('sdm-module-226-output');
                if (outputElement) {
                    outputElement.textContent = 'Button clicked! ' + new Date().toLocaleTimeString();
                }
            });

            // حفظ حالة الوحدة
            const savedData = localStorage.getItem(STORAGE_KEY);
            if (savedData) {
                const data = JSON.parse(savedData);
                if (data.lastInteraction) {
                    const outputElement = document.getElementById('sdm-module-226-output');
                    if (outputElement) {
                        outputElement.textContent = `Last interaction: ${data.lastInteraction}`;
                    }
                }
            }
        } catch (error) {
            console.error('Error initializing SDM Module #226:', error);
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }

    // حفظ الحالة عند مغادرة الصفحة
    window.addEventListener('beforeunload', function() {
        try {
            const outputElement = document.getElementById('sdm-module-226-output');
            if (outputElement && outputElement.textContent) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                    lastInteraction: outputElement.textContent
                }));
            }
        } catch (error) {
            console.error('Error saving module state:', error);
        }
    });
})();