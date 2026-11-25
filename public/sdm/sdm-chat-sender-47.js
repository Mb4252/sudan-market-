/* sdm-chat-sender-47.js */
(function() {
    'use strict';

    // التحقق من وجود عناصر DOM
    function isElementPresent(id) {
        return document.getElementById(id) !== null;
    }

    // إضافة رد SDM محلياً (بدون انتظار الشبكة)
    function addLocalSDMResponse(message) {
        const chatContainer = document.getElementById('sdm-chat');
        if (!chatContainer) return;

        const responseElement = document.createElement('div');
        responseElement.className = 'message sdm-message';

        const timeElement = document.createElement('div');
        timeElement.className = 'message-time';
        timeElement.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const contentElement = document.createElement('div');
        contentElement.className = 'message-content';
        contentElement.textContent = message || 'رد من SDM (بدون اتصال بالشبكة)';

        responseElement.appendChild(timeElement);
        responseElement.appendChild(contentElement);
        chatContainer.appendChild(responseElement);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // معالجة إرسال الرسالة
    function handleSendMessage() {
        const userIdentity = document.getElementById('user-identity');
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('send-button');
        const chatContainer = document.getElementById('sdm-chat');

        if (!isElementPresent('user-identity') || !isElementPresent('message-input') || !isElementPresent('send-button') || !isElementPresent('sdm-chat')) {
            console.error('Elements not found');
            return;
        }

        const userIdentityValue = userIdentity.value.trim() || 'المستخدم';
        const messageValue = messageInput.value.trim();

        if (!messageValue) return;

        // إضافة رسالة المستخدم
        addMessageToChat(userIdentityValue, messageValue, true);

        // حفظ الرسالة في localStorage
        saveMessageToLocalStorage(userIdentityValue, messageValue);

        // رد محلي فوري
        addLocalSDMResponse('شكراً على رسالتك! (رد محلي)');

        // إعادة تعيين الحقول
        messageInput.value = '';

        // محاولة إرسال عبر الشبكة (إذا كان هناك اتصال)
        try {
            if (window.renderStream && window.renderStream.socket && window.renderStream.socket.readyState === WebSocket.OPEN) {
                window.renderStream.socket.send(JSON.stringify({
                    type: 'chat_message',
                    sender: userIdentityValue,
                    message: messageValue,
                    timestamp: new Date().toISOString()
                }));
            }
        } catch (e) {
            console.error('Error sending message:', e);
        }
    }

    // ربط الحدث
    function setupEventListeners() {
        const sendButton = document.getElementById('send-button');
        if (sendButton) {
            sendButton.addEventListener('click', handleSendMessage);
        }

        const messageInput = document.getElementById('message-input');
        if (messageInput) {
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    handleSendMessage();
                }
            });
        }
    }

    // تنفيذ عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            try {
                setupEventListeners();
            } catch (e) {
                console.error('Error initializing sdm-chat-sender-47:', e);
            }
        });
    } else {
        try {
            setupEventListeners();
        } catch (e) {
            console.error('Error initializing sdm-chat-sender-47:', e);
        }
    }

    // استيراد الدوال من ملفات أخرى (إذا كانت متاحة)
    if (window.addMessageToChat && typeof window.addMessageToChat === 'function') {
        window.addMessageToChat = addMessageToChat;
    }

    if (window.saveMessageToLocalStorage && typeof window.saveMessageToLocalStorage === 'function') {
        window.saveMessageToLocalStorage = saveMessageToLocalStorage;
    }

    // إعادة تعريف الدوال من ملفات أخرى
    if (typeof addMessageToChat !== 'function') {
        window.addMessageToChat = function(sender, message, isUser = true) {
            const chatContainer = document.getElementById('sdm-chat');
            if (!chatContainer) return;

            const messageElement = document.createElement('div');
            messageElement.className = `message ${isUser ? 'user-message' : 'sdm-message'}`;

            const timeElement = document.createElement('div');
            timeElement.className = 'message-time';
            timeElement.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const contentElement = document.createElement('div');
            contentElement.className = 'message-content';
            safeSetTextContent(contentElement, message);

            messageElement.appendChild(timeElement);
            messageElement.appendChild(contentElement);
            chatContainer.appendChild(messageElement);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        };
    }

    if (typeof saveMessageToLocalStorage !== 'function') {
        window.saveMessageToLocalStorage = function(sender, message) {
            const post = {
                id: Date.now().toString(),
                sender: sender,
                message: message,
                timestamp: new Date().toISOString()
            };
            try {
                const posts = JSON.parse(localStorage.getItem('sudanMarketPosts') || '[]');
                posts.push(post);
                localStorage.setItem('sudanMarketPosts', JSON.stringify(posts));
            } catch (e) {
                console.error('Error saving message to localStorage:', e);
            }
        };
    }

})();