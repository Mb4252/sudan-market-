// public/sdm/sdm-chat-sender-60.js
(function() {
    'use strict';

    // دالة لجلب الرسائل المحفوظة
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

    // دالة لعرض الرسائل في الدردشة
    function displayMessages() {
        const chatContainer = document.getElementById('sdm-chat');
        if (!chatContainer) return;

        const messages = getSavedMessages();
        chatContainer.innerHTML = '';

        messages.forEach(msg => {
            const messageElement = document.createElement('div');
            messageElement.className = `chat-message ${msg.sender === 'user' ? 'user-message' : 'sdm-message'}`;
            messageElement.innerHTML = `
                <strong>${msg.sender === 'user' ? 'أنت' : 'SDM'}:</strong>
                <p>${msg.text}</p>
                <small>${new Date(msg.timestamp).toLocaleString()}</small>
            `;
            chatContainer.appendChild(messageElement);
        });
    }

    // دالة لإرسال رسالة
    function sendMessage() {
        const nameInput = document.getElementById('sdm-name');
        const messageInput = document.getElementById('sdm-message');

        if (!nameInput || !messageInput) return;

        const name = nameInput.value.trim();
        const message = messageInput.value.trim();

        if (!name || !message) return;

        // حفظ الرسالة
        const userMessage = {
            sender: 'user',
            text: message,
            timestamp: new Date().toISOString(),
            name: name
        };
        saveMessage(userMessage);

        // عرض الرسائل
        displayMessages();

        // إفراغ حقل الرسالة
        messageInput.value = '';

        // إظهار رد فوري من SDM
        const sdmResponse = {
            sender: 'sdm',
            text: `شكراً لك ${name}، تم استلام رسالتك: "${message}"`,
            timestamp: new Date().toISOString()
        };
        saveMessage(sdmResponse);
        displayMessages();
    }

    // تهيئة الدردشة
    function initChat() {
        const sendButton = document.getElementById('sdm-send-btn');
        const messageInput = document.getElementById('sdm-message');

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
    }

    // بدء التنفيذ
    try {
        initChat();
    } catch (e) {
        console.error('Error initializing chat:', e);
    }
})();