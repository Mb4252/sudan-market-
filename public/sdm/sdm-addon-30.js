// public/sdm/sdm-addon-30.js
(function() {
    'use strict';

    // دالة تهيئة الواجهة الأساسية
    function initBasicUI() {
        try {
            // إنشاء عناصر الواجهة الأساسية
            const chatContainer = document.createElement('div');
            chatContainer.id = 'sdm-chat-container';
            chatContainer.className = 'sdm-chat-container';

            // العنوان
            const title = document.createElement('h1');
            title.id = 'sdm-title';
            title.textContent = 'منصة السودان';
            chatContainer.appendChild(title);

            // حقل هوية الشخص
            const identityInput = document.createElement('input');
            identityInput.id = 'sdm-identity';
            identityInput.type = 'text';
            identityInput.placeholder = 'هويتك (اختياري)';
            chatContainer.appendChild(identityInput);

            // صندوق الرسائل
            const messagesBox = document.createElement('div');
            messagesBox.id = 'sdm-messages';
            messagesBox.className = 'sdm-messages';
            chatContainer.appendChild(messagesBox);

            // حقل الرسالة
            const messageInput = document.createElement('input');
            messageInput.id = 'sdm-message-input';
            messageInput.type = 'text';
            messageInput.placeholder = 'اكتب رسالتك...';
            chatContainer.appendChild(messageInput);

            // زر الإرسال
            const sendButton = document.createElement('button');
            sendButton.id = 'sdm-send-button';
            sendButton.textContent = 'إرسال';
            chatContainer.appendChild(sendButton);

            // شريط حالة الاتصال
            const statusBar = document.createElement('div');
            statusBar.id = 'connection-status';
            statusBar.textContent = 'Connecting...';
            chatContainer.appendChild(statusBar);

            // إضافة الواجهة إلى الصفحة
            document.body.appendChild(chatContainer);
        } catch (e) {
            console.error('Error initializing basic UI:', e);
        }
    }

    // تهيئة الواجهة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBasicUI);
    } else {
        initBasicUI();
    }

    // تصدير الدوال المطلوبة
    window.sdmAddon30 = {
        initBasicUI: initBasicUI
    };
})();