// sdm-module-67.js
(function() {
    'use strict';

    // دالة لحفظ رسالة دردشة في localStorage
    function saveChatMessage(message) {
        if (!message || typeof message !== 'object' || !message.id) {
            console.error('Invalid message object');
            return false;
        }

        try {
            const STORAGE_KEY = 'sdmChatMessages';
            const messages = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];

            // التحقق من عدم وجود تكرار
            const existingIndex = messages.findIndex(m => m.id === message.id);
            if (existingIndex !== -1) {
                messages[existingIndex] = message;
            } else {
                messages.push(message);
            }

            localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
            return true;
        } catch (error) {
            console.error('Error saving chat message:', error);
            return false;
        }
    }

    // ربط الدالة مع النافذة العالمية
    window.sdmSaveChatMessage = saveChatMessage;
})();
