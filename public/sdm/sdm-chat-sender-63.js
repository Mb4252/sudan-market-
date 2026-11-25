// public/sdm/sdm-chat-sender-63.js
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
        } catch (e) {
            console.error('Error saving message:', e);
        }
    }

    // دالة لعرض رسالة في صندوق الدردشة
    function displayMessage(message) {
        const chatContainer = document.getElementById('sdm-chat');
        if (!chatContainer) return;

        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${message.sender === 'user' ? 'user-message' : 'sdm-message'}`;

        const nameElement = document.createElement('span');
        nameElement.className = 'message-name';
        nameElement.textContent = message.name || (message.sender === 'user' ? 'أنت' : 'SDM');

        const textElement = document.createElement('span');
        textElement.className = 'message-text';
        textElement.textContent = message.text;

        messageElement.appendChild(nameElement);
        messageElement.appendChild(textElement);
        chatContainer.appendChild(messageElement);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // دالة لإرسال رسالة
    function sendMessage() {
        const nameInput = document.getElementById('sdm-name');
        const messageInput = document.getElementById('sdm-message');

        if (!nameInput || !messageInput) return;

        const name = nameInput.value.trim();
        const messageText = messageInput.value.trim();

        if (!name || !messageText) return;

        const message = {
            sender: 'user',
            name: name,
            text: messageText,
            timestamp: new Date().toISOString()
        };

        // حفظ الرسالة وعرضها
        saveMessage(message);
        displayMessage(message);

        // إفراغ حقل الرسالة
        messageInput.value = '';

        // إرسال رسالة إلى SDM
        const sdmResponse = {
            sender: 'sdm',
            name: 'SDM',
            text: `شكراً لك ${name}، لقد تلقينا رسالتك: "${messageText}"`,
            timestamp: new Date().toISOString()
        };

        // حفظ الرد وعرضه
        saveMessage(sdmResponse);
        displayMessage(sdmResponse);
    }

    // دالة لتحميل الرسائل المحفوظة عند التحميل
    function loadSavedMessages() {
        const messages = getSavedMessages();
        messages.forEach(displayMessage);
    }

    // إعداد الحدث عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            // تحميل الرسائل المحفوظة
            loadSavedMessages();

            // إعداد حدث النقر على زر الإرسال
            const sendButton = document.getElementById('sdm-send-btn');
            if (sendButton) {
                sendButton.addEventListener('click', sendMessage);
            }

            // إعداد حدث الضغط على Enter في حقل الرسالة
            const messageInput = document.getElementById('sdm-message');
            if (messageInput) {
                messageInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        sendMessage();
                    }
                });
            }
        } catch (e) {
            console.error('Error initializing chat sender:', e);
        }
    });
})();