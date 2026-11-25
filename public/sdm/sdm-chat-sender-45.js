/* sdm-chat-sender-45.js */
(function() {
    'use strict';

    // التحقق من وجود العناصر DOM
    function initDOMElements() {
        const elements = {
            chatContainer: document.getElementById('sdm-chat'),
            userIdentityInput: document.getElementById('user-identity'),
            messageInput: document.getElementById('message-input'),
            sendButton: document.getElementById('send-button'),
            connectionStatus: document.getElementById('connection-status')
        };
        return elements;
    }

    // عرض رسالة في صندوق الدردشة
    function appendMessage(container, message) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.sender === 'user' ? 'user-message' : 'sdm-message'}`;
        messageElement.innerHTML = `<strong>${message.identity}:</strong> ${message.message}<br><small>${new Date(message.timestamp).toLocaleTimeString()}</small>`;
        container.appendChild(messageElement);
        container.scrollTop = container.scrollHeight;
    }

    // حفظ محادثة المستخدم في localStorage
    function saveChatToLocalStorage(chat) {
        try {
            const existingChat = JSON.parse(localStorage.getItem('sdm-chat-' + chat[0].identity)) || [];
            const updatedChat = [...existingChat, ...chat];
            localStorage.setItem('sdm-chat-' + chat[0].identity, JSON.stringify(updatedChat));
        } catch (error) {
            console.error('Error saving chat:', error);
        }
    }

    // تفعيل زر الإرسال
    function initSendButton() {
        const elements = initDOMElements();
        if (!elements.chatContainer || !elements.userIdentityInput || !elements.messageInput || !elements.sendButton) {
            return;
        }

        elements.sendButton.addEventListener('click', function() {
            const identity = elements.userIdentityInput.value;
            const message = elements.messageInput.value;

            if (validateInput(identity, message)) {
                const userMessage = createUserMessage(identity, message);
                const sdmResponse = createSDMResponse(userMessage);

                appendMessage(elements.chatContainer, userMessage);
                appendMessage(elements.chatContainer, sdmResponse);

                saveChatToLocalStorage([userMessage, sdmResponse]);
                elements.messageInput.value = '';
            }
        });

        elements.messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                elements.sendButton.click();
            }
        });
    }

    // التحقق من صحة البيانات قبل الإرسال
    function validateInput(identity, message) {
        return identity.trim() !== '' && message.trim() !== '';
    }

    // إنشاء رسالة جديدة
    function createUserMessage(identity, message) {
        const timestamp = new Date().toISOString();
        return {
            id: Date.now().toString(),
            sender: 'user',
            identity: identity.trim(),
            message: message.trim(),
            timestamp: timestamp,
            status: 'sent'
        };
    }

    // إنشاء رد افتراضي من SDM
    function createSDMResponse(userMessage) {
        const timestamp = new Date().toISOString();
        return {
            id: Date.now().toString(),
            sender: 'sdm',
            identity: 'SDM',
            message: `شكراً على رسالتك، ${userMessage.identity}. تم حفظها بنجاح.`,
            timestamp: timestamp,
            status: 'received'
        };
    }

    // التحقق من وجود عناصر DOM عند تحميل الصفحة
    function checkDOMReady() {
        const elements = initDOMElements();
        if (elements.chatContainer && elements.userIdentityInput && elements.messageInput && elements.sendButton) {
            initSendButton();
        } else {
            setTimeout(checkDOMReady, 100);
        }
    }

    // التحميل عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            checkDOMReady();
        } catch (e) {
            console.error('Error initializing chat sender:', e);
        }
    });

})();