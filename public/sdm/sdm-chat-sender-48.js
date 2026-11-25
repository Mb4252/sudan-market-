// sdm-chat-sender-48.js
(function() {
    'use strict';

    // دالة لجلب الرسائل المحفوظة من localStorage
    function getSavedMessages() {
        try {
            const messages = localStorage.getItem('sdmChatMessages');
            return messages ? JSON.parse(messages) : [];
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
            messageElement.innerHTML = `<strong>${msg.sender}:</strong> ${msg.text}`;
            chatContainer.appendChild(messageElement);
        });
    }

    // دالة لإرسال رسالة
    function sendMessage() {
        const userIdentity = document.getElementById('user-identity');
        const messageInput = document.getElementById('message-input');

        if (!userIdentity || !messageInput) return;

        const userName = userIdentity.value.trim();
        const messageText = messageInput.value.trim();

        if (!userName || !messageText) return;

        const message = {
            sender: userName,
            text: messageText,
            timestamp: new Date().toISOString()
        };

        if (saveMessage(message)) {
            displayMessages();
            // إرسال رسالة إلى SDM
            const sdmResponse = {
                sender: 'SDM',
                text: `شكراً لك ${userName}، تم استلام رسالتك: "${messageText}"`,
                timestamp: new Date().toISOString()
            };
            saveMessage(sdmResponse);
            displayMessages();
            messageInput.value = '';
        }
    }

    // تهيئة التطبيق
    function init() {
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

        displayMessages();
    }

    // تشغيل التهيئة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();