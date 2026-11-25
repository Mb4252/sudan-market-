// sdm-chat-ui.js
(function() {
    'use strict';

    // إعدادات الدردشة
    const CHAT_STORAGE_KEY = 'sdmPrivateChats';
    let currentUserId = null;
    let chatMessages = [];

    // دالة لجلب سجل الدردشة الحالي
    function getCurrentChatHistory() {
        if (!currentUserId) return [];

        try {
            const allChats = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY)) || {};
            return allChats[currentUserId] || [];
        } catch (error) {
            console.error('Error getting chat history:', error);
            return [];
        }
    }

    // دالة لحفظ رسالة جديدة
    function saveMessage(message) {
        if (!currentUserId || !message) return false;

        try {
            const allChats = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY)) || {};
            const userChat = allChats[currentUserId] || [];

            userChat.push({
                text: message,
                timestamp: new Date().toISOString(),
                sender: currentUserId === 'sdm' ? 'sdm' : 'user'
            });

            allChats[currentUserId] = userChat;
            localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(allChats));
            return true;
        } catch (error) {
            console.error('Error saving message:', error);
            return false;
        }
    }

    // دالة لعرض الرسائل
    function renderMessages() {
        const messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer) return;

        messagesContainer.innerHTML = '';
        chatMessages.forEach(msg => {
            const messageElement = document.createElement('div');
            messageElement.className = `message ${msg.sender}`;
            messageElement.innerHTML = `
                <strong>${msg.sender === 'sdm' ? 'SDM' : 'You'}:</strong>
                <p>${msg.text}</p>
                <small>${new Date(msg.timestamp).toLocaleTimeString()}</small>
            `;
            messagesContainer.appendChild(messageElement);
        });

        // التمرير إلى آخر رسالة
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // دالة لتبديل المستخدم
    function switchUser(userId) {
        currentUserId = userId;
        chatMessages = getCurrentChatHistory();
        renderMessages();

        // تحديث واجهة المستخدم
        const userDisplay = document.getElementById('current-user');
        if (userDisplay) {
            userDisplay.textContent = userId === 'sdm' ? 'SDM' : `User: ${userId}`;
        }
    }

    // دالة لإرسال رسالة
    function sendMessage() {
        const messageInput = document.getElementById('user-message');
        if (!messageInput || !messageInput.value.trim()) return;

        const message = messageInput.value.trim();
        if (saveMessage(message)) {
            chatMessages = getCurrentChatHistory();
            renderMessages();
            messageInput.value = '';
        }
    }

    // دالة لتهيئة الواجهة
    function initChatUI() {
        // إنشاء عناصر واجهة المستخدم إذا لم تكن موجودة
        if (!document.getElementById('current-user')) {
            const userDisplay = document.createElement('div');
            userDisplay.id = 'current-user';
            userDisplay.textContent = 'No user selected';
            document.getElementById('sdm-chat').prepend(userDisplay);
        }

        if (!document.getElementById('chat-messages')) {
            const messagesContainer = document.createElement('div');
            messagesContainer.id = 'chat-messages';
            document.getElementById('sdm-chat').appendChild(messagesContainer);
        }

        if (!document.getElementById('user-message')) {
            const messageInput = document.createElement('input');
            messageInput.id = 'user-message';
            messageInput.type = 'text';
            messageInput.placeholder = 'Type your message...';
            document.getElementById('sdm-chat').appendChild(messageInput);

            const sendButton = document.createElement('button');
            sendButton.id = 'send-message';
            sendButton.textContent = 'Send';
            sendButton.onclick = sendMessage;
            document.getElementById('sdm-chat').appendChild(sendButton);
        }

        // تهيئة المستخدم الافتراضي
        switchUser('user1');
    }

    // تهيئة الواجهة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', initChatUI);

    // ربط الدوال مع النافذة العالمية
    window.switchUser = switchUser;
    window.sendMessage = sendMessage;
})();