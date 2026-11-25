// public/sdm/sdm-chat-sender-61.js
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

    // دالة لعرض الرسائل في صندوق الدردشة
    function displayMessages() {
        const chatContainer = document.getElementById('sdm-chat');
        if (!chatContainer) return;

        const messages = getSavedMessages();
        chatContainer.innerHTML = '';

        messages.forEach(msg => {
            const messageElement = document.createElement('div');
            messageElement.className = 'chat-message';
            messageElement.innerHTML = `
                <strong>${msg.name}:</strong> ${msg.message}
                <span class="message-time">${new Date(msg.timestamp).toLocaleTimeString()}</span>
            `;
            chatContainer.appendChild(messageElement);
        });

        // التمرير إلى الأسفل
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // دالة لرد SDM فوراً
    function getSDMResponse(message) {
        // رد بسيط من SDM
        return `شكراً على رسالتك: ${message}`;
    }

    // دالة لإرسال رسالة
    function sendMessage() {
        const nameInput = document.getElementById('sdm-name');
        const messageInput = document.getElementById('sdm-message');

        if (!nameInput || !messageInput) return;

        const name = nameInput.value.trim();
        const message = messageInput.value.trim();

        if (name && message) {
            const timestamp = new Date().toISOString();
            const userMessage = { name, message, timestamp };

            // حفظ الرسالة
            saveMessage(userMessage);

            // عرض الرسالة
            displayMessages();

            // رد SDM فوراً
            const sdmResponse = {
                name: 'SDM',
                message: getSDMResponse(message),
                timestamp: new Date().toISOString()
            };

            // حفظ الرد
            saveMessage(sdmResponse);

            // عرض الرد
            displayMessages();

            // مسح حقل الرسالة
            messageInput.value = '';
        }
    }

    // تهيئة الدردشة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        // عرض الرسائل المحفوظة
        displayMessages();

        // تعيين معالج لزر الإرسال
        const sendButton = document.getElementById('sdm-send-btn');
        if (sendButton) {
            sendButton.addEventListener('click', sendMessage);
        }

        // تعيين معالج لزر Enter في حقل الرسالة
        const messageInput = document.getElementById('sdm-message');
        if (messageInput) {
            messageInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    sendMessage();
                }
            });
        }
    });

    // تصدير الدوال للوصول منها من خارج الملف
    window.sdmChatSender = {
        getSavedMessages,
        saveMessage,
        displayMessages,
        sendMessage
    };
})();