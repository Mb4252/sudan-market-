(function() {
    'use strict';

    // دالة لجلب عناصر DOM بشكل آمن
    function getElement(id) {
        const element = document.getElementById(id);
        if (!element) {
            console.error(`Element with id ${id} not found`);
            return null;
        }
        return element;
    }

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
        } catch (e) {
            console.error('Error saving message:', e);
        }
    }

    // دالة لعرض رسالة في الدردشة
    function displayMessage(message) {
        const chatContainer = getElement('sdm-chat');
        if (!chatContainer) return;

        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.sender === 'user' ? 'user-message' : 'sdm-message'}`;

        const nameElement = document.createElement('span');
        nameElement.className = 'message-name';
        nameElement.textContent = message.name || 'مستخدم';

        const textElement = document.createElement('span');
        textElement.className = 'message-text';
        textElement.textContent = message.text;

        messageElement.appendChild(nameElement);
        messageElement.appendChild(textElement);
        chatContainer.appendChild(messageElement);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // دالة لجلب رد من SDM
    function getSDMResponse(message) {
        // رد افتراضي من SDM
        return {
            sender: 'sdm',
            name: 'SDM',
            text: `شكراً لرسالتك: ${message.text}`
        };
    }

    // دالة لإرسال الرسالة
    function sendMessage() {
        const nameInput = getElement('sdm-name');
        const messageInput = getElement('sdm-message');

        if (!nameInput || !messageInput) return;

        const name = nameInput.value.trim();
        const messageText = messageInput.value.trim();

        if (!name || !messageText) return;

        const userMessage = {
            sender: 'user',
            name: name,
            text: messageText
        };

        // عرض الرسالة وتخزينها
        displayMessage(userMessage);
        saveMessage(userMessage);

        // الحصول على رد من SDM
        const sdmResponse = getSDMResponse(userMessage);
        displayMessage(sdmResponse);
        saveMessage(sdmResponse);

        // مسح حقل الرسالة
        messageInput.value = '';
    }

    // دالة لتهيئة الدردشة
    function initChat() {
        try {
            // تحميل الرسائل المحفوظة
            const savedMessages = getSavedMessages();
            savedMessages.forEach(displayMessage);

            // ربط زر الإرسال
            const sendButton = getElement('sdm-send-btn');
            if (sendButton) {
                sendButton.addEventListener('click', sendMessage);
            }

            // ربط مفتاح Enter
            const messageInput = getElement('sdm-message');
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
    }

    // تهيئة الدردشة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', initChat);

    // تحديث حالة الاتصال
    updateConnectionStatus('متصل (محلي)');

})();