// sdm-chat-sender-58.js

(function() {
    'use strict';

    // دالة تشفير بسيطة
    function simpleEncrypt(text) {
        return btoa(encodeURIComponent(text));
    }

    // دالة فك التشفير
    function simpleDecrypt(encrypted) {
        return decodeURIComponent(atob(encrypted));
    }

    // تخزين المحادثات في localStorage
    function saveConversation(name, message, isUser = true) {
        try {
            const key = `sdm_chat_${name}`;
            const conversations = JSON.parse(localStorage.getItem(key)) || [];
            const timestamp = new Date().toISOString();

            conversations.push({
                text: simpleEncrypt(message),
                timestamp,
                isUser
            });

            localStorage.setItem(key, JSON.stringify(conversations));
            return true;
        } catch (e) {
            console.error('Error saving conversation:', e);
            return false;
        }
    }

    // استرجاع المحادثات
    function getConversations(name) {
        try {
            const key = `sdm_chat_${name}`;
            const conversations = JSON.parse(localStorage.getItem(key)) || [];
            return conversations.map(conv => ({
                ...conv,
                text: simpleDecrypt(conv.text)
            }));
        } catch (e) {
            console.error('Error getting conversations:', e);
            return [];
        }
    }

    // عرض المحادثة في صندوق الدردشة
    function displayConversation(name) {
        const chatContainer = document.getElementById('sdm-chat');
        if (!chatContainer) return;

        const conversations = getConversations(name);
        chatContainer.innerHTML = '';

        conversations.forEach(conv => {
            const messageElement = document.createElement('div');
            messageElement.className = conv.isUser ? 'user-message' : 'sdm-message';
            messageElement.textContent = `${conv.isUser ? 'أنت' : 'SDM'}: ${conv.text}`;
            chatContainer.appendChild(messageElement);
        });
    }

    // دالة معالجة إرسال الرسالة
    function handleSendMessage() {
        const nameInput = document.getElementById('sdm-name');
        const messageInput = document.getElementById('sdm-message');

        if (!nameInput || !messageInput) return;

        const name = nameInput.value.trim();
        const message = messageInput.value.trim();

        if (!name || !message) return;

        // حفظ الرسالة في localStorage
        saveConversation(name, message);

        // عرض الرسالة في صندوق الدردشة
        displayConversation(name);

        // إظهار رد فوري من SDM
        const sdmResponse = `شكراً لك ${name}، لقد تلقينا رسالتك: ${message}`;
        saveConversation(name, sdmResponse, false);
        displayConversation(name);

        // مسح حقل الرسالة
        messageInput.value = '';
    }

    // دالة إعداد الإرسال
    function setupChatSender() {
        try {
            const sendButton = document.getElementById('sdm-send-btn');
            const messageInput = document.getElementById('sdm-message');

            if (sendButton && messageInput) {
                sendButton.addEventListener('click', handleSendMessage);
                messageInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        handleSendMessage();
                    }
                });
            }
        } catch (e) {
            console.error('Error setting up chat sender:', e);
        }
    }

    // تنفيذ الدالة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', setupChatSender);

    // إظهار المحادثة عند تغيير الاسم
    const nameInput = document.getElementById('sdm-name');
    if (nameInput) {
        nameInput.addEventListener('change', (e) => {
            displayConversation(e.target.value.trim());
        });
    }

})();