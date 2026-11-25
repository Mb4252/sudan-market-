// public/sdm/sdm-chat-sender-46.js
(function() {
    'use strict';

    // دالة لإرسال الرسالة وحفظها في localStorage وعرضها فوراً
    function setupChatSender() {
        try {
            // الحصول على العناصر DOM
            const sendButton = document.getElementById('send-button');
            const messageInput = document.getElementById('message-input');
            const userIdentity = document.getElementById('user-identity');
            const chatContainer = document.getElementById('sdm-chat');

            // التحقق من وجود جميع العناصر
            if (!sendButton || !messageInput || !userIdentity || !chatContainer) {
                console.error('One or more required elements are missing');
                return;
            }

            // دالة لإضافة رسالة إلى الدردشة
            function addMessageToChat(message, isUser = true) {
                const messageElement = document.createElement('div');
                messageElement.className = isUser ? 'user-message' : 'sdm-message';

                const identity = isUser ? userIdentity.value || 'مستخدم' : 'SDM';
                const timestamp = new Date().toLocaleTimeString();

                messageElement.innerHTML = `
                    <strong>${identity}</strong> (${timestamp}):
                    <span>${message}</span>
                `;

                chatContainer.appendChild(messageElement);
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }

            // دالة لحفظ الرسالة في localStorage
            function saveMessageToStorage(message, isUser = true) {
                const identity = isUser ? userIdentity.value || 'مستخدم' : 'SDM';
                const timestamp = new Date().toISOString();

                const messageData = {
                    id: Date.now().toString(),
                    identity,
                    message,
                    timestamp,
                    isUser
                };

                // استخدام local-posts-store.js لحفظ الرسالة
                if (window.savePost) {
                    window.savePost(messageData);
                }
            }

            // دالة لإرسال الرسالة
            function sendMessage() {
                const message = messageInput.value.trim();
                if (!message) return;

                // إضافة الرسالة إلى الدردشة
                addMessageToChat(message, true);

                // حفظ الرسالة في localStorage
                saveMessageToStorage(message, true);

                // إضافة رد SDM فوراً
                setTimeout(() => {
                    const sdmResponse = `شكراً لرسالتك، ${userIdentity.value || 'مستخدم'}! سنرد عليك قريباً.`;
                    addMessageToChat(sdmResponse, false);
                    saveMessageToStorage(sdmResponse, false);
                }, 1000);

                // مسح حقل الإدخال
                messageInput.value = '';
            }

            // إضافة مستمع للزر
            sendButton.addEventListener('click', sendMessage);

            // إضافة مستمع لزر Enter في حقل الإدخال
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    sendMessage();
                }
            });
        } catch (error) {
            console.error('Error in setupChatSender:', error);
        }
    }

    // تفعيل الدالة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupChatSender);
    } else {
        setupChatSender();
    }
})();
