// public/sdm/sdm-chat-sender-41.js
(function() {
    'use strict';

    // دالة لإرسال الرسالة وحفظها في localStorage وعرضها فوراً
    function handleSendMessage() {
        try {
            // الحصول على العناصر DOM
            const userIdentityInput = document.getElementById('user-identity');
            const messageInput = document.getElementById('message-input');
            const chatContainer = document.getElementById('sdm-chat');

            // التحقق من وجود العناصر
            if (!userIdentityInput || !messageInput || !chatContainer) {
                console.error('Required DOM elements not found');
                return;
            }

            // الحصول على القيم
            const userIdentity = userIdentityInput.value.trim();
            const messageText = messageInput.value.trim();

            // التحقق من القيم
            if (!userIdentity || !messageText) {
                alert('الرجاء إدخال هويةك والرسالة');
                return;
            }

            // إنشاء كائن الرسالة
            const message = {
                id: Date.now().toString(),
                user: userIdentity,
                text: messageText,
                timestamp: new Date().toISOString(),
                isSDM: false
            };

            // حفظ الرسالة في localStorage
            if (window.savePost && typeof window.savePost === 'function') {
                window.savePost(message);
            } else {
                console.error('savePost function not available');
            }

            // عرض الرسالة في الدردشة
            displayMessage(message, chatContainer);

            // إنشاء رد من SDM
            const sdmResponse = {
                id: (Date.now() + 1).toString(),
                user: 'SDM',
                text: `شكراً لك ${userIdentity}، تم استلام رسالتك: "${messageText}"`,
                timestamp: new Date().toISOString(),
                isSDM: true
            };

            // حفظ الرد في localStorage
            if (window.savePost && typeof window.savePost === 'function') {
                window.savePost(sdmResponse);
            } else {
                console.error('savePost function not available');
            }

            // عرض الرد في الدردشة
            displayMessage(sdmResponse, chatContainer);

            // مسح حقل الرسالة
            messageInput.value = '';
        } catch (error) {
            console.error('Error in handleSendMessage:', error);
        }
    }

    // دالة لعرض الرسالة في الدردشة
    function displayMessage(message, container) {
        try {
            if (!message || !container) return;

            const messageElement = document.createElement('div');
            messageElement.className = `message ${message.isSDM ? 'sdm-message' : 'user-message'}`;

            const userElement = document.createElement('div');
            userElement.className = 'message-user';
            userElement.textContent = message.user;

            const textElement = document.createElement('div');
            textElement.className = 'message-text';
            textElement.textContent = message.text;

            const timeElement = document.createElement('div');
            timeElement.className = 'message-time';
            timeElement.textContent = new Date(message.timestamp).toLocaleTimeString();

            messageElement.appendChild(userElement);
            messageElement.appendChild(textElement);
            messageElement.appendChild(timeElement);

            container.appendChild(messageElement);
            container.scrollTop = container.scrollHeight;
        } catch (error) {
            console.error('Error displaying message:', error);
        }
    }

    // إضافة مستمع للزر
    function setupSendButton() {
        const sendButton = document.getElementById('send-button');
        if (sendButton) {
            sendButton.addEventListener('click', handleSendMessage);
        }
    }

    // تهيئة الدردشة عند تحميل الصفحة
    function initChat() {
        try {
            const chatContainer = document.getElementById('sdm-chat');
            if (chatContainer) {
                // عرض الرسائل المحفوظة
                if (window.getAllPosts && typeof window.getAllPosts === 'function') {
                    const posts = window.getAllPosts();
                    posts.forEach(post => displayMessage(post, chatContainer));
                }
            }
        } catch (error) {
            console.error('Error initializing chat:', error);
        }
    }

    // تنفيذ الدوال عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            setupSendButton();
            initChat();
        } catch (error) {
            console.error('Error in DOMContentLoaded:', error);
        }
    });

    // تصدير الدوال للواجهة العالمية
    window.handleSendMessage = handleSendMessage;
    window.displayMessage = displayMessage;
})();