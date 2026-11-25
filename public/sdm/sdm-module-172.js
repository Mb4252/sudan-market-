// public/sdm/sdm-module-172.js
(function() {
    'use strict';

    // دالة التهيئة الرئيسية
    function init() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const chatContainer = document.getElementById('sdm-chat');
            if (!chatContainer) {
                console.warn('SDM chat container not found');
                return;
            }

            // تنفيذ الوظيفة الرئيسية
            setupChatEnhancements();

        } catch (error) {
            console.error('Error in SDM Module 172:', error);
        }
    }

    // تحسينات واجهة المحادثة
    function setupChatEnhancements() {
        // إضافة زر تنظيف المحادثة
        const clearButton = document.createElement('button');
        clearButton.textContent = 'Clear Chat';
        clearButton.className = 'sdm-clear-chat';
        clearButton.addEventListener('click', clearChatHistory);

        // إضافة زر حفظ المحادثة
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Save Chat';
        saveButton.className = 'sdm-save-chat';
        saveButton.addEventListener('click', saveChatHistory);

        // إضافة الأزرار إلى واجهة المحادثة
        const chatHeader = document.querySelector('.sdm-chat-header');
        if (chatHeader) {
            chatHeader.appendChild(clearButton);
            chatHeader.appendChild(saveButton);
        }
    }

    // دالة تنظيف المحادثة
    function clearChatHistory() {
        const chatMessages = document.querySelectorAll('.sdm-chat-message');
        chatMessages.forEach(msg => msg.remove());
        localStorage.removeItem('sdmChatHistory');
    }

    // دالة حفظ المحادثة
    function saveChatHistory() {
        const chatMessages = Array.from(document.querySelectorAll('.sdm-chat-message'))
            .map(msg => msg.textContent);
        localStorage.setItem('sdmChatHistory', JSON.stringify(chatMessages));
        alert('Chat history saved!');
    }

    // تهيئة التوسعة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();