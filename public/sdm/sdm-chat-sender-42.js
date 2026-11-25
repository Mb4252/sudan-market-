(function() {
    'use strict';

    // دالة لجلب عناصر DOM بشكل آمن
    function getElement(id) {
        const element = document.getElementById(id);
        if (!element) {
            console.error(`Element with ID ${id} not found`);
            return null;
        }
        return element;
    }

    // دالة لإضافة رسالة إلى صندوق الدردشة
    function addMessageToChat(message, isUser = true) {
        const chatBox = getElement('sdm-chat');
        if (!chatBox) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = isUser ? 'user-message' : 'sdm-message';
        messageDiv.textContent = message;

        chatBox.appendChild(messageDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // دالة لحفظ الرسالة في localStorage
    function saveMessageToLocalStorage(userId, message, isUser = true) {
        try {
            const chatHistory = JSON.parse(localStorage.getItem('sdmChatHistory')) || {};
            const userChat = chatHistory[userId] || [];

            userChat.push({
                message,
                isUser,
                timestamp: new Date().toISOString()
            });

            chatHistory[userId] = userChat;
            localStorage.setItem('sdmChatHistory', JSON.stringify(chatHistory));
        } catch (error) {
            console.error('Error saving message to localStorage:', error);
        }
    }

    // دالة لجلب رد من SDM
    function getSDMResponse(message) {
        // رد افتراضي من SDM
        return `رد من SDM على: ${message}`;
    }

    // دالة لإرسال الرسالة
    function sendMessage() {
        const userIdentity = getElement('user-identity');
        const messageInput = getElement('message-input');

        if (!userIdentity || !messageInput) return;

        const userId = userIdentity.value.trim();
        const message = messageInput.value.trim();

        if (!userId || !message) {
            alert('يرجى إدخال هويةك والرسالة');
            return;
        }

        // إضافة الرسالة إلى صندوق الدردشة
        addMessageToChat(`${userId}: ${message}`, true);

        // حفظ الرسالة في localStorage
        saveMessageToLocalStorage(userId, message, true);

        // الحصول على رد من SDM
        const sdmResponse = getSDMResponse(message);

        // إضافة رد SDM إلى صندوق الدردشة
        addMessageToChat(sdmResponse, false);

        // حفظ رد SDM في localStorage
        saveMessageToLocalStorage(userId, sdmResponse, false);

        // مسح حقل الرسالة
        messageInput.value = '';
    }

    // دالة لتهيئة زر الإرسال
    function initSendButton() {
        const sendButton = getElement('send-button');
        if (!sendButton) return;

        sendButton.addEventListener('click', sendMessage);

        // إضافة دعم لإرسال الرسالة عند الضغط على Enter
        const messageInput = getElement('message-input');
        if (messageInput) {
            messageInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    sendMessage();
                }
            });
        }
    }

    // تهيئة التطبيق
    function init() {
        initSendButton();
    }

    // تشغيل التطبيق عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();