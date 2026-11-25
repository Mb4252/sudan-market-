// sdm-chat-sender-57.js
(function() {
    'use strict';

    // دالة لجلب عناصر DOM
    function getElements() {
        return {
            chatContainer: document.getElementById('sdm-chat'),
            nameInput: document.getElementById('sdm-name'),
            messageInput: document.getElementById('sdm-message'),
            sendButton: document.getElementById('sdm-send-btn')
        };
    }

    // دالة لإنشاء رسالة دردشة
    function createChatMessage(name, message, isSDM = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${isSDM ? 'sdm-message' : 'user-message'}`;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'message-name';
        nameSpan.textContent = name;

        const textSpan = document.createElement('span');
        textSpan.className = 'message-text';
        textSpan.textContent = message;

        messageDiv.appendChild(nameSpan);
        messageDiv.appendChild(textSpan);

        return messageDiv;
    }

    // دالة لحفظ الرسالة في localStorage
    function saveMessageToLocalStorage(name, message, isSDM = false) {
        const chatHistory = JSON.parse(localStorage.getItem('sdmChatHistory')) || [];
        chatHistory.push({
            name,
            message,
            isSDM,
            timestamp: new Date().toISOString()
        });
        localStorage.setItem('sdmChatHistory', JSON.stringify(chatHistory));
    }

    // دالة لتحميل تاريخ الدردشة من localStorage
    function loadChatHistory() {
        const elements = getElements();
        if (!elements.chatContainer) return;

        const chatHistory = JSON.parse(localStorage.getItem('sdmChatHistory')) || [];
        elements.chatContainer.innerHTML = '';

        chatHistory.forEach(chat => {
            const messageElement = createChatMessage(chat.name, chat.message, chat.isSDM);
            elements.chatContainer.appendChild(messageElement);
        });
    }

    // دالة لإرسال الرسالة
    function sendMessage() {
        const elements = getElements();
        if (!elements.nameInput || !elements.messageInput || !elements.chatContainer) return;

        const name = elements.nameInput.value.trim();
        const message = elements.messageInput.value.trim();

        if (!name || !message) return;

        // إضافة الرسالة إلى الدردشة
        const userMessage = createChatMessage(name, message);
        elements.chatContainer.appendChild(userMessage);

        // حفظ الرسالة في localStorage
        saveMessageToLocalStorage(name, message);

        // إضافة رد فوري من SDM
        const sdmResponse = createChatMessage('SDM', `شكراً لك ${name}، تم استلام رسالتك: "${message}"`, true);
        elements.chatContainer.appendChild(sdmResponse);

        // حفظ الرد في localStorage
        saveMessageToLocalStorage('SDM', `شكراً لك ${name}، تم استلام رسالتك: "${message}"`, true);

        // مسح حقل الرسالة
        elements.messageInput.value = '';
    }

    // دالة لتهيئة الدردشة
    function initChat() {
        const elements = getElements();

        if (!elements.chatContainer || !elements.nameInput || !elements.messageInput || !elements.sendButton) {
            console.error('Required elements not found');
            return;
        }

        // تحميل تاريخ الدردشة
        loadChatHistory();

        // إضافة مستمع لزر الإرسال
        elements.sendButton.addEventListener('click', sendMessage);

        // إضافة مستمع لزر Enter في حقل الرسالة
        elements.messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }

    // تهيئة الدردشة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', initChat);

    // تصدير الدوال العامة
    window.sdmChat = {
        sendMessage,
        loadChatHistory
    };
})();