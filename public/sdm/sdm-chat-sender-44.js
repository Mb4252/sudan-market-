// sdm-chat-sender-44.js
(function() {
    'use strict';

    // دالة لجلب الرسائل المحفوظة من localStorage
    function getSavedMessages() {
        try {
            const saved = localStorage.getItem('sdmChatMessages');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error('Error getting saved messages:', e);
            return [];
        }
    }

    // دالة لحفظ رسالة جديدة
    function saveMessage(message) {
        try {
            const messages = getSavedMessages();
            messages.push(message);
            localStorage.setItem('sdmChatMessages', JSON.stringify(messages));
            return true;
        } catch (e) {
            console.error('Error saving message:', e);
            return false;
        }
    }

    // دالة لعرض الرسائل في صندوق الدردشة
    function displayMessages() {
        const chatContainer = document.getElementById('sdm-chat');
        if (!chatContainer) return;

        const messages = getSavedMessages();
        chatContainer.innerHTML = '';

        messages.forEach(msg => {
            const messageElement = document.createElement('div');
            messageElement.className = `chat-message ${msg.sender === 'user' ? 'user-message' : 'sdm-message'}`;
            messageElement.textContent = `${msg.sender}: ${msg.text}`;
            chatContainer.appendChild(messageElement);
        });
    }

    // دالة لإرسال رسالة
    function sendMessage() {
        const messageInput = document.getElementById('message-input');
        const userIdentity = document.getElementById('user-identity');

        if (!messageInput || !userIdentity) return;

        const messageText = messageInput.value.trim();
        const userName = userIdentity.value.trim();

        if (!messageText || !userName) return;

        // حفظ الرسالة
        const userMessage = {
            sender: 'user',
            text: messageText,
            timestamp: new Date().toISOString()
        };
        saveMessage(userMessage);

        // عرض الرسالة
        displayMessages();

        // إرسال رسالة إلى SDM
        const sdmMessage = {
            sender: 'SDM',
            text: `شكراً لك ${userName}، تم استلام رسالتك: ${messageText}`,
            timestamp: new Date().toISOString()
        };
        saveMessage(sdmMessage);
        displayMessages();

        // مسح حقل الإدخال
        messageInput.value = '';
    }

    // تهيئة التطبيق
    function init() {
        try {
            const sendButton = document.getElementById('send-button');
            const messageInput = document.getElementById('message-input');

            if (sendButton && messageInput) {
                sendButton.addEventListener('click', sendMessage);
                messageInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        sendMessage();
                    }
                });
            }

            // عرض الرسائل المحفوظة عند التحميل
            displayMessages();
        } catch (e) {
            console.error('Error initializing chat sender:', e);
        }
    }

    // تشغيل التطبيق
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();