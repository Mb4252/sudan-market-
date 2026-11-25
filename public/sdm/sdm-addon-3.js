// public/sdm/sdm-addon-3.js
(function() {
    'use strict';

    // تأكد من وجود جميع العناصر المطلوبة
    function ensureElementsExist() {
        return document.getElementById('sdm-chat') &&
               document.getElementById('chat-messages') &&
               document.getElementById('user-message') &&
               document.getElementById('send-message');
    }

    // دالة لجلب الرسائل المحفوظة
    function getSavedMessages() {
        try {
            const userId = localStorage.getItem('sdmUserId') || 'default';
            const messages = localStorage.getItem(`sdmChatMessages_${userId}`);
            return messages ? JSON.parse(messages) : [];
        } catch (e) {
            console.error('Error getting saved messages:', e);
            return [];
        }
    }

    // دالة لحفظ رسالة جديدة
    function saveMessage(message) {
        try {
            const userId = localStorage.getItem('sdmUserId') || 'default';
            const messages = getSavedMessages();
            messages.push(message);
            localStorage.setItem(`sdmChatMessages_${userId}`, JSON.stringify(messages));
            return true;
        } catch (e) {
            console.error('Error saving message:', e);
            return false;
        }
    }

    // دالة لعرض الرسائل المحفوظة
    function displaySavedMessages() {
        if (!ensureElementsExist()) return;

        const messages = getSavedMessages();
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.innerHTML = '';

        messages.forEach(msg => {
            const messageElement = document.createElement('div');
            messageElement.textContent = `${msg.sender}: ${msg.text}`;
            chatMessages.appendChild(messageElement);
        });
    }

    // دالة لإرسال رسالة
    function sendMessage() {
        if (!ensureElementsExist()) return;

        const userMessage = document.getElementById('user-message');
        const messageText = userMessage.value.trim();

        if (messageText) {
            const message = {
                sender: 'User',
                text: messageText,
                timestamp: new Date().toISOString()
            };

            if (saveMessage(message)) {
                displaySavedMessages();
                userMessage.value = '';

                // رد تلقائي من SDM
                setTimeout(() => {
                    const sdmResponse = {
                        sender: 'SDM',
                        text: `شكراً لرسالتك! هذا رد تلقائي من SDM.`,
                        timestamp: new Date().toISOString()
                    };
                    saveMessage(sdmResponse);
                    displaySavedMessages();
                }, 1000);
            }
        }
    }

    // دالة لتهيئة الدردشة
    function initChat() {
        if (!ensureElementsExist()) return;

        // عرض الرسائل المحفوظة عند التحميل
        displaySavedMessages();

        // إضافة معالج للزر
        document.getElementById('send-message').addEventListener('click', sendMessage);

        // إضافة معالج للمدخلات
        document.getElementById('user-message').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }

    // تهيئة الدردشة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initChat);
    } else {
        initChat();
    }

})();