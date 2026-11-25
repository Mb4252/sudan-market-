// sdm-chat-sender-39.js
(function() {
    'use strict';

    try {
        // التحقق من وجود جميع العناصر المطلوبة
        const chatContainer = document.getElementById('sdm-chat');
        const userIdentityInput = document.getElementById('user-identity');
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('send-button');

        if (!chatContainer || !userIdentityInput || !messageInput || !sendButton) {
            console.error('Required elements not found');
            return;
        }

        // دالة لجلب المحادثات المحفوظة
        function getSavedChats() {
            try {
                const savedChats = localStorage.getItem('sdmChats');
                return savedChats ? JSON.parse(savedChats) : {};
            } catch (e) {
                console.error('Error getting saved chats:', e);
                return {};
            }
        }

        // دالة لحفظ المحادثة
        function saveChat(userId, message, isUser = true) {
            try {
                const chats = getSavedChats();
                const timestamp = new Date().toISOString();

                if (!chats[userId]) {
                    chats[userId] = [];
                }

                chats[userId].push({
                    message,
                    timestamp,
                    isUser
                });

                localStorage.setItem('sdmChats', JSON.stringify(chats));
                return true;
            } catch (e) {
                console.error('Error saving chat:', e);
                return false;
            }
        }

        // دالة لعرض المحادثة
        function displayChat(userId) {
            try {
                const chats = getSavedChats();
                const userChats = chats[userId] || [];

                chatContainer.innerHTML = userChats.map(chat => {
                    const messageClass = chat.isUser ? 'user-message' : 'sdm-message';
                    return `<div class="${messageClass}">
                        <span class="timestamp">[${new Date(chat.timestamp).toLocaleTimeString()}]</span>
                        ${chat.message}
                    </div>`;
                }).join('');

                // التمرير إلى الأسفل
                chatContainer.scrollTop = chatContainer.scrollHeight;
            } catch (e) {
                console.error('Error displaying chat:', e);
            }
        }

        // دالة لإرسال الرسالة
        function sendMessage() {
            const userId = userIdentityInput.value.trim();
            const message = messageInput.value.trim();

            if (!userId || !message) return;

            // حفظ الرسالة
            saveChat(userId, message, true);
            displayChat(userId);

            // عرض رد فوري من SDM
            const sdmResponse = `رد من SDM: ${message}`;
            saveChat(userId, sdmResponse, false);
            displayChat(userId);

            // مسح حقل الرسالة
            messageInput.value = '';
        }

        // إضافة مستمع للزر
        sendButton.addEventListener('click', sendMessage);

        // إضافة مستمع لزر Enter
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });

        // تحميل المحادثة عند تغيير الهوية
        userIdentityInput.addEventListener('change', function() {
            displayChat(this.value.trim());
        });
    } catch (e) {
        console.error('Error in sdm-chat-sender-39.js:', e);
    }
})();