(function() {
    'use strict';

    // دالة استرجاع الرسائل المحفوظة
    function getSavedMessages() {
        try {
            const messages = localStorage.getItem('sdmChatMessages');
            return messages ? JSON.parse(messages) : [];
        } catch (e) {
            console.error('Error getting saved messages:', e);
            return [];
        }
    }

    // دالة حفظ رسالة جديدة
    function saveMessage(message) {
        try {
            const messages = getSavedMessages();
            messages.push(message);
            localStorage.setItem('sdmChatMessages', JSON.stringify(messages));
        } catch (e) {
            console.error('Error saving message:', e);
        }
    }

    // دالة عرض الرسائل
    function displayMessages() {
        const chatContainer = document.getElementById('sdm-chat');
        if (!chatContainer) return;

        chatContainer.innerHTML = '';
        const messages = getSavedMessages();

        messages.forEach(msg => {
            const messageElement = document.createElement('div');
            messageElement.className = msg.sender === 'user' ? 'user-message' : 'sdm-message';
            messageElement.textContent = msg.text;
            chatContainer.appendChild(messageElement);
        });

        // التمرير إلى آخر رسالة
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // دالة إرسال رسالة
    function sendMessage() {
        const userIdentity = document.getElementById('user-identity');
        const messageInput = document.getElementById('message-input');

        if (!userIdentity || !messageInput) return;

        const messageText = messageInput.value.trim();
        if (!messageText) return;

        // حفظ الرسالة
        const userMessage = {
            sender: 'user',
            text: `${userIdentity.value}: ${messageText}`,
            timestamp: new Date().toISOString()
        };
        saveMessage(userMessage);

        // عرض الرسائل
        displayMessages();

        // إنشاء رد من SDM فوراً
        const sdmResponse = {
            sender: 'sdm',
            text: `SDM: شكراً لرسالتك، ${userIdentity.value}. سنرد عليك قريباً.`,
            timestamp: new Date().toISOString()
        };
        saveMessage(sdmResponse);
        displayMessages();

        // مسح حقل الإدخال
        messageInput.value = '';
    }

    // تهيئة الدردشة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            // عرض الرسائل المحفوظة
            displayMessages();

            // ربط زر الإرسال
            const sendButton = document.getElementById('send-button');
            if (sendButton) {
                sendButton.addEventListener('click', sendMessage);
            }

            // إرسال الرسالة عند الضغط على Enter
            const messageInput = document.getElementById('message-input');
            if (messageInput) {
                messageInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        sendMessage();
                    }
                });
            }
        } catch (e) {
            console.error('Error initializing chat:', e);
        }
    });

    // تصدير الدوال للوصول العالمي
    window.sdmChatSender = {
        getSavedMessages,
        saveMessage,
        displayMessages,
        sendMessage
    };
})();