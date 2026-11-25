// public/sdm/sdm-shell.js
(function() {
    'use strict';

    // إعدادات SDM
    const SDM_CHAT_KEY = 'sdmChatHistory';
    const SDM_USER_KEY = 'sdmUserId';

    // إنشاء معرف مستخدم فريد إذا لم يكن موجوداً
    function initializeUser() {
        let userId = localStorage.getItem(SDM_USER_KEY);
        if (!userId) {
            userId = 'user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem(SDM_USER_KEY, userId);
        }
        return userId;
    }

    // تحميل سجل الدردشة
    function loadChatHistory() {
        const userId = localStorage.getItem(SDM_USER_KEY);
        if (!userId) return [];

        const history = localStorage.getItem(`${SDM_CHAT_KEY}_${userId}`);
        return history ? JSON.parse(history) : [];
    }

    // حفظ رسالة جديدة
    function saveMessage(message) {
        const userId = localStorage.getItem(SDM_USER_KEY);
        if (!userId) return false;

        const history = loadChatHistory();
        history.push(message);
        localStorage.setItem(`${SDM_CHAT_KEY}_${userId}`, JSON.stringify(history));
        return true;
    }

    // تهيئة واجهة SDM
    function initializeSDMUI() {
        const chatContainer = document.getElementById('sdm-chat');
        if (!chatContainer) return;

        // إنشاء عناصر واجهة المستخدم
        const messagesContainer = document.createElement('div');
        messagesContainer.id = 'chat-messages';

        const inputContainer = document.createElement('div');
        const messageInput = document.createElement('input');
        messageInput.id = 'user-message';
        messageInput.type = 'text';
        messageInput.placeholder = 'اكتب رسالتك...';

        const sendButton = document.createElement('button');
        sendButton.id = 'send-message';
        sendButton.textContent = 'إرسال';

        inputContainer.appendChild(messageInput);
        inputContainer.appendChild(sendButton);

        chatContainer.appendChild(messagesContainer);
        chatContainer.appendChild(inputContainer);

        // تحميل سجل الدردشة السابق
        const chatHistory = loadChatHistory();
        chatHistory.forEach(msg => {
            addMessageToUI(msg.sender, msg.text, msg.timestamp);
        });

        // إضافة معالج لزر الإرسال
        sendButton.addEventListener('click', handleSendMessage);
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') handleSendMessage();
        });
    }

    // معالج إرسال الرسالة
    function handleSendMessage() {
        const messageInput = document.getElementById('user-message');
        if (!messageInput || !messageInput.value.trim()) return;

        const message = {
            sender: 'user',
            text: messageInput.value.trim(),
            timestamp: new Date().toISOString()
        };

        addMessageToUI(message.sender, message.text, message.timestamp);
        saveMessage(message);
        messageInput.value = '';

        // إرسال الرسالة إلى SDM
        sendToSDM(message.text);
    }

    // إضافة رسالة إلى واجهة المستخدم
    function addMessageToUI(sender, text, timestamp) {
        const messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer) return;

        const messageElement = document.createElement('div');
        messageElement.className = `message ${sender}`;

        const senderElement = document.createElement('div');
        senderElement.className = 'message-sender';
        senderElement.textContent = sender === 'user' ? 'أنت' : 'SDM';

        const textElement = document.createElement('div');
        textElement.className = 'message-text';
        textElement.textContent = text;

        const timeElement = document.createElement('div');
        timeElement.className = 'message-time';
        timeElement.textContent = new Date(timestamp).toLocaleTimeString();

        messageElement.appendChild(senderElement);
        messageElement.appendChild(textElement);
        messageElement.appendChild(timeElement);

        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // إرسال الرسالة إلى SDM
    function sendToSDM(message) {
        // هنا يمكنك إضافة منطق الاتصال مع SDM
        // هذا مجرد مثال بسيط
        setTimeout(() => {
            const response = {
                sender: 'sdm',
                text: `تم استلام رسالتك: "${message}"`,
                timestamp: new Date().toISOString()
            };
            addMessageToUI(response.sender, response.text, response.timestamp);
            saveMessage(response);
        }, 1000);
    }

    // تهيئة SDM عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        initializeUser();
        initializeSDMUI();
    });

    // تصدير الدوال المطلوبة
    window.sdmShell = {
        initializeUser,
        loadChatHistory,
        saveMessage,
        addMessageToUI
    };
})();