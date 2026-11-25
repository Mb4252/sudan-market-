// public/sdm/sdm-chat-sender-38.js
(function() {
    'use strict';

    try {
        // التحقق من وجود جميع العناصر المطلوبة
        const requiredElements = [
            'user-identity',
            'message-input',
            'send-button',
            'sdm-chat'
        ];

        if (!requiredElements.every(id => document.getElementById(id))) {
            console.error('Missing required DOM elements');
            return;
        }

        // دالة لإضافة رسالة إلى الدردشة
        function addMessageToChat(message, isUser = true) {
            const chatElement = document.getElementById('sdm-chat');
            const messageElement = document.createElement('div');
            messageElement.className = isUser ? 'user-message' : 'sdm-message';
            messageElement.textContent = message;
            chatElement.appendChild(messageElement);
            chatElement.scrollTop = chatElement.scrollHeight;
        }

        // دالة لحفظ الرسالة في localStorage
        function saveMessage(userId, message) {
            const timestamp = new Date().toISOString();
            const post = {
                id: `${userId}-${timestamp}`,
                userId,
                message,
                timestamp,
                type: 'chat'
            };

            const posts = JSON.parse(localStorage.getItem('sdmChatMessages') || '[]');
            posts.push(post);
            localStorage.setItem('sdmChatMessages', JSON.stringify(posts));
        }

        // دالة لرد SDM فوراً
        function getSDMResponse(message) {
            // رد بسيط من SDM
            if (message.toLowerCase().includes('سعر')) {
                return 'السعر الحالي هو 100 دولار';
            } else if (message.toLowerCase().includes('مدة')) {
                return 'المدة المتوقعة هي 7 أيام';
            } else {
                return 'شكراً لرسالتك. سنرد عليك قريباً';
            }
        }

        // معالجة إرسال الرسالة
        document.getElementById('send-button').addEventListener('click', function() {
            const userId = document.getElementById('user-identity').value.trim();
            const message = document.getElementById('message-input').value.trim();

            if (userId && message) {
                // إضافة الرسالة إلى الدردشة
                addMessageToChat(`${userId}: ${message}`);

                // حفظ الرسالة
                saveMessage(userId, message);

                // الحصول على رد SDM
                const sdmResponse = getSDMResponse(message);
                addMessageToChat(`SDM: ${sdmResponse}`, false);

                // مسح حقل الإدخال
                document.getElementById('message-input').value = '';
            }
        });

        // تحميل الرسائل المحفوظة عند التحميل
        function loadSavedMessages() {
            const posts = JSON.parse(localStorage.getItem('sdmChatMessages') || '[]');
            posts.forEach(post => {
                addMessageToChat(`${post.userId}: ${post.message}`);
            });
        }

        loadSavedMessages();
    } catch (error) {
        console.error('Error in sdm-chat-sender-38:', error);
    }
})();