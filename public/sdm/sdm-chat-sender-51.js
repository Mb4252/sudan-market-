// public/sdm/sdm-chat-sender-51.js
(function() {
    'use strict';

    // دالة لإرسال الرسالة وحفظها
    function sendMessage() {
        try {
            // الحصول على العناصر DOM
            const nameInput = document.getElementById('sdm-name');
            const messageInput = document.getElementById('sdm-message');
            const chatContainer = document.getElementById('sdm-chat');

            // التحقق من وجود العناصر
            if (!nameInput || !messageInput || !chatContainer) {
                console.error('Required DOM elements not found');
                return;
            }

            // الحصول على القيم
            const name = nameInput.value.trim();
            const message = messageInput.value.trim();

            // التحقق من القيم
            if (!name || !message) {
                alert('يرجى إدخال الاسم والرسالة');
                return;
            }

            // إنشاء كائن الرسالة
            const messageObj = {
                id: Date.now().toString(),
                name: name,
                message: message,
                timestamp: new Date().toISOString(),
                isUser: true
            };

            // حفظ الرسالة في localStorage
            const posts = JSON.parse(localStorage.getItem('sudanMarketPosts') || '[]');
            posts.push(messageObj);
            localStorage.setItem('sudanMarketPosts', JSON.stringify(posts));

            // عرض الرسالة في الدردشة
            const messageElement = document.createElement('div');
            messageElement.className = 'message user-message';
            messageElement.innerHTML = `<strong>${name}:</strong> ${message}`;
            chatContainer.appendChild(messageElement);

            // عرض رد SDM فوراً
            const sdmResponse = document.createElement('div');
            sdmResponse.className = 'message sdm-message';
            sdmResponse.innerHTML = `<strong>SDM:</strong> شكراً على رسالتك ${name}! سنرد عليك قريباً`;
            chatContainer.appendChild(sdmResponse);

            // مسح حقل الرسالة
            messageInput.value = '';

            // التمرير إلى الأسفل
            chatContainer.scrollTop = chatContainer.scrollHeight;
        } catch (error) {
            console.error('Error in sendMessage:', error);
        }
    }

    // دالة لتهيئة الإرسال
    function initSend() {
        try {
            const sendButton = document.getElementById('sdm-send-btn');
            const messageInput = document.getElementById('sdm-message');

            if (sendButton && messageInput) {
                sendButton.addEventListener('click', sendMessage);
                messageInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        sendMessage();
                    }
                });
            }
        } catch (error) {
            console.error('Error in initSend:', error);
        }
    }

    // تهيئة الإرسال عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', initSend);

    // تصدير الدوال
    window.sdmSendMessage = sendMessage;
    window.sdmInitSend = initSend;
})();