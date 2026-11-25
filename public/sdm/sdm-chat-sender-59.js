// sdm-chat-sender-59.js
(function() {
    'use strict';

    // دالة لإرسال الرسالة
    function sendMessage() {
        try {
            const nameInput = document.getElementById('sdm-name');
            const messageInput = document.getElementById('sdm-message');
            const chatContainer = document.getElementById('sdm-chat');

            if (!nameInput || !messageInput || !chatContainer) {
                console.error('Required elements not found');
                return;
            }

            const name = nameInput.value.trim();
            const message = messageInput.value.trim();

            if (!name || !message) {
                alert('يرجى إدخال الاسم والرسالة');
                return;
            }

            // إنشاء رسالة المستخدم
            const userMessage = {
                id: Date.now().toString(),
                name: name,
                message: message,
                timestamp: new Date().toISOString(),
                type: 'user'
            };

            // حفظ الرسالة في localStorage
            if (typeof window.savePost === 'function') {
                window.savePost(userMessage);
            }

            // عرض الرسالة في الدردشة
            displayMessage(userMessage);

            // إنشاء رد SDM الفوري
            const sdmResponse = {
                id: Date.now().toString() + '-sdm',
                name: 'SDM',
                message: `شكراً لك ${name}، لقد تلقينا رسالتك: ${message}`,
                timestamp: new Date().toISOString(),
                type: 'sdm'
            };

            // حفظ الرد في localStorage
            if (typeof window.savePost === 'function') {
                window.savePost(sdmResponse);
            }

            // عرض الرد في الدردشة
            displayMessage(sdmResponse);

            // مسح حقل الرسالة
            messageInput.value = '';
        } catch (error) {
            console.error('Error in sendMessage:', error);
        }
    }

    // دالة لعرض الرسالة في الدردشة
    function displayMessage(message) {
        try {
            const chatContainer = document.getElementById('sdm-chat');
            if (!chatContainer) return;

            const messageElement = document.createElement('div');
            messageElement.className = `message ${message.type}`;
            messageElement.innerHTML = `
                <div class="message-header">
                    <span class="message-name">${message.name}</span>
                    <span class="message-time">${new Date(message.timestamp).toLocaleTimeString()}</span>
                </div>
                <div class="message-content">${message.message}</div>
            `;

            chatContainer.appendChild(messageElement);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        } catch (error) {
            console.error('Error in displayMessage:', error);
        }
    }

    // إضافة معالج الحدث لزر الإرسال
    document.addEventListener('DOMContentLoaded', function() {
        try {
            const sendButton = document.getElementById('sdm-send-btn');
            if (sendButton) {
                sendButton.addEventListener('click', sendMessage);
            }

            // معالج للضغط على Enter في حقل الرسالة
            const messageInput = document.getElementById('sdm-message');
            if (messageInput) {
                messageInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        sendMessage();
                    }
                });
            }
        } catch (error) {
            console.error('Error in event listeners:', error);
        }
    });

    // تصدير الدوال للوصول إليها من خارج الملف
    window.sendMessage = sendMessage;
    window.displayMessage = displayMessage;
})();