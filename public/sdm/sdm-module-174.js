// public/sdm/sdm-module-174.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule174Data';
    const MODULE_NAME = 'SDM Module #174';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const chatElement = document.getElementById('sdm-chat');
            const statusElement = document.getElementById('module-174-status');

            if (!chatElement || !statusElement) {
                console.warn(`${MODULE_NAME}: Required DOM elements not found`);
                return;
            }

            // تحديث حالة الوحدة في الواجهة
            safeSetTextContent(statusElement, `${MODULE_NAME} loaded`);

            // دالة لمعالجة الرسائل الواردة
            function handleIncomingMessage(message) {
                if (!message || typeof message !== 'object') return;

                // حفظ الرسالة في localStorage
                saveMessageToStorage(message);

                // تحديث الواجهة
                updateChatUI(message);
            }

            // دالة لحفظ الرسالة في localStorage
            function saveMessageToStorage(message) {
                try {
                    const messages = JSON.parse(localStorage.getItem(MODULE_STORAGE_KEY)) || [];
                    messages.push({
                        id: Date.now(),
                        content: message.content,
                        timestamp: new Date().toISOString()
                    });
                    localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify(messages));
                } catch (error) {
                    console.error(`${MODULE_NAME}: Error saving message to storage`, error);
                }
            }

            // دالة لتحديث الواجهة
            function updateChatUI(message) {
                const messageElement = document.createElement('div');
                messageElement.className = 'sdm-message';
                messageElement.textContent = message.content;
                chatElement.appendChild(messageElement);
            }

            // ربط الدالة مع النافذة العالمية
            window.sdmModule174 = {
                init: initModule,
                handleMessage: handleIncomingMessage
            };
        } catch (error) {
            console.error(`${MODULE_NAME}: Initialization error`, error);
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initModule();
    } else {
        document.addEventListener('DOMContentLoaded', initModule);
    }
})();