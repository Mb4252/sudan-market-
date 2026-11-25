// public/sdm/sdm-addon-16.js
(function() {
    'use strict';

    // إعدادات التوسعة
    const ADDON_STORAGE_KEY = 'sdmAddon16Data';
    const ADDON_NAME = 'SDM Addon #16';

    // دالة تهيئة التوسعة
    function initAddon() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const chatContainer = document.getElementById('chat-container');
            const messageInput = document.getElementById('message-input');
            const sendButton = document.getElementById('send-button');

            if (!chatContainer || !messageInput || !sendButton) {
                console.error('Required DOM elements not found');
                return;
            }

            // إضافة رسالة الترحيب
            const welcomeMessage = document.createElement('div');
            welcomeMessage.textContent = 'مرحباً بكم في واجهة SDM المحدثة!';
            chatContainer.appendChild(welcomeMessage);

            // إضافة معالج للزر
            sendButton.addEventListener('click', function() {
                const message = messageInput.value.trim();
                if (message) {
                    const messageElement = document.createElement('div');
                    messageElement.textContent = message;
                    chatContainer.appendChild(messageElement);
                    messageInput.value = '';
                }
            });

            // إضافة معالج لزر Enter
            messageInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    sendButton.click();
                }
            });

            console.log(`${ADDON_NAME} initialized successfully`);
        } catch (error) {
            console.error(`${ADDON_NAME} initialization error:`, error);
        }
    }

    // تهيئة التوسعة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAddon);
    } else {
        initAddon();
    }

    // تصدير الدالة العامة
    window.sdmAddon16 = {
        init: initAddon
    };
})();