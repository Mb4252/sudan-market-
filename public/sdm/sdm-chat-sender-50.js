// sdm-chat-sender-50.js

(function() {
    'use strict';

    // التحقق من وجود العناصر المطلوبة
    const chatContainer = document.getElementById('sdm-chat');
    const sendButton = document.getElementById('sdm-send-btn');
    const nameInput = document.getElementById('sdm-name');
    const messageInput = document.getElementById('sdm-message');

    if (!chatContainer || !sendButton || !nameInput || !messageInput) {
        console.error('Required elements not found');
        return;
    }

    // دالة لقراءة المحادثة من localStorage
    function getChatHistory(userId) {
        const key = `sdmChat_${userId}`;
        const history = localStorage.getItem(key);
        return history ? JSON.parse(history) : [];
    }

    // دالة لحفظ المحادثة في localStorage
    function saveChatHistory(userId, chatHistory) {
        const key = `sdmChat_${userId}`;
        localStorage.setItem(key, JSON.stringify(chatHistory));
    }

    // دالة لإظهار الرسائل في الدردشة
    function displayMessages(chatHistory) {
        chatContainer.innerHTML = '';
        chatHistory.forEach(message => {
            const messageElement = document.createElement('div');
            messageElement.className = message.sender === 'user' ? 'user-message' : 'sdm-message';
            messageElement.textContent = `${message.sender === 'user' ? nameInput.value : 'SDM'}: ${message.text}`;
            chatContainer.appendChild(messageElement);
        });
    }

    // دالة لإرسال الرسالة
    function sendMessage() {
        const userId = nameInput.value.trim();
        const messageText = messageInput.value.trim();

        if (!userId || !messageText) return;

        const chatHistory = getChatHistory(userId);
        const newMessage = {
            sender: 'user',
            text: messageText,
            timestamp: new Date().toISOString()
        };

        chatHistory.push(newMessage);
        saveChatHistory(userId, chatHistory);
        displayMessages(chatHistory);

        // رد فوري من SDM
        const sdmReply = {
            sender: 'sdm',
            text: 'تم استلام رسالتك، سنعود قريباً',
            timestamp: new Date().toISOString()
        };

        chatHistory.push(sdmReply);
        saveChatHistory(userId, chatHistory);
        displayMessages(chatHistory);

        messageInput.value = '';
    }

    // إضافة مستمع لزر الإرسال
    sendButton.addEventListener('click', sendMessage);

    // إضافة مستمع لزر Enter في حقل الرسالة
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    // تحميل المحادثة عند تحميل الصفحة
    window.addEventListener('load', function() {
        const userId = nameInput.value.trim();
        if (userId) {
            const chatHistory = getChatHistory(userId);
            displayMessages(chatHistory);
        }
    });

    // تحديث المحادثة عند تغيير الهوية
    nameInput.addEventListener('change', function() {
        const userId = nameInput.value.trim();
        if (userId) {
            const chatHistory = getChatHistory(userId);
            displayMessages(chatHistory);
        }
    });

})();