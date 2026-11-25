// sdm-addon-19.js
// ميزة جديدة: زر تنظيف الدردشة
(function() {
    'use strict';

    // دالة تنظيف الدردشة
    function clearChat() {
        try {
            const chatContainer = document.getElementById('chat-container');
            if (chatContainer) {
                chatContainer.innerHTML = '';
                // حفظ حالة التنظيف في localStorage
                localStorage.setItem('chatCleared', new Date().toISOString());
                return true;
            }
            return false;
        } catch (e) {
            console.error('Error clearing chat:', e);
            return false;
        }
    }

    // إضافة زر التنظيف إلى الواجهة
    function addClearButton() {
        try {
            const sendButton = document.getElementById('send-button');
            if (sendButton) {
                const clearButton = document.createElement('button');
                clearButton.id = 'clear-chat-button';
                clearButton.textContent = 'تنظيف الدردشة';
                clearButton.style.marginRight = '10px';
                clearButton.addEventListener('click', clearChat);

                const buttonContainer = sendButton.parentNode;
                buttonContainer.insertBefore(clearButton, sendButton);
                return true;
            }
            return false;
        } catch (e) {
            console.error('Error adding clear button:', e);
            return false;
        }
    }

    // تهيئة الميزة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', addClearButton);

    // تصدير الوظيفة العامة
    window.sdmClearChat = clearChat;
})();