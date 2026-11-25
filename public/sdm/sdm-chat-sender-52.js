// public/sdm/sdm-chat-sender-52.js
(function() {
    'use strict';

    // إعدادات التخزين
    const STORAGE_KEY = 'sdm_chat_history_v52';
    const USER_KEY = 'sdm_user_name_v52';

    // دوال مساعدة آمنة
    function safeGetElement(id) {
        return document.getElementById(id);
    }

    function getSafeDate() {
        const now = new Date();
        return isNaN(now.getTime()) ? 'الآن' : now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    }

    function sanitizeInput(str) {
        if (!str) return '';
        return str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // تحميل تاريخ الدردشة
    function loadChatHistory() {
        try {
            const history = localStorage.getItem(STORAGE_KEY);
            return history ? JSON.parse(history) : [];
        } catch (e) {
            console.error('Error loading chat history:', e);
            return [];
        }
    }

    // حفظ تاريخ الدردشة
    function saveChatHistory(history) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
        } catch (e) {
            console.error('Error saving chat history:', e);
        }
    }

    // إضافة رسالة إلى الدردشة
    function addMessageToChat(name, message, isUser = true) {
        const chatContainer = safeGetElement('sdm-chat');
        if (!chatContainer) return;

        const messageElement = document.createElement('div');
        messageElement.className = isUser ? 'user-message' : 'sdm-message';

        const nameElement = document.createElement('span');
        nameElement.className = 'message-name';
        nameElement.textContent = sanitizeInput(name) + ': ';

        const textElement = document.createElement('span');
        textElement.className = 'message-text';
        textElement.textContent = sanitizeInput(message);

        const timeElement = document.createElement('span');
        timeElement.className = 'message-time';
        timeElement.textContent = getSafeDate();

        messageElement.appendChild(nameElement);
        messageElement.appendChild(textElement);
        messageElement.appendChild(timeElement);

        chatContainer.appendChild(messageElement);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // معالجة ردود SDM
    function handleSDMResponse(response) {
        if (!response || typeof response !== 'object') return;

        const { name, message } = response;
        if (!name || !message) return;

        // إضافة الرد إلى الدردشة
        addMessageToChat(name, message, false);

        // حفظ الرد في التاريخ
        const history = loadChatHistory();
        history.push({ name, message, time: new Date().toISOString(), isUser: false });
        saveChatHistory(history);
    }

    // إرسال رسالة
    function sendMessage() {
        const nameInput = safeGetElement('sdm-name');
        const messageInput = safeGetElement('sdm-message');

        if (!nameInput || !messageInput) return;

        const name = nameInput.value.trim();
        const message = messageInput.value.trim();

        if (!name || !message) return;

        // حفظ الاسم في التخزين المحلي
        try {
            localStorage.setItem(USER_KEY, name);
        } catch (e) {
            console.error('Error saving user name:', e);
        }

        // إضافة الرسالة إلى الدردشة
        addMessageToChat(name, message);

        // حفظ الرسالة في التاريخ
        const history = loadChatHistory();
        history.push({ name, message, time: new Date().toISOString(), isUser: true });
        saveChatHistory(history);

        // توليد رد SDM محلياً
        const sdmResponse = {
            name: 'SDM',
            message: `شكراً لك ${name} على رسالتك: "${message}". هذا رد تلقائي من نظام SDM.`
        };
        handleSDMResponse(sdmResponse);

        // مسح حقل الرسالة
        messageInput.value = '';
    }

    // تحميل تاريخ الدردشة عند التحميل
    function loadInitialChat() {
        const history = loadChatHistory();
        history.forEach(item => {
            addMessageToChat(item.name, item.message, item.isUser);
        });

        // تحميل الاسم المحفوظ
        const savedName = localStorage.getItem(USER_KEY);
        const nameInput = safeGetElement('sdm-name');
        if (nameInput && savedName) {
            nameInput.value = savedName;
        }
    }

    // تهيئة التطبيق
    function init() {
        try {
            // تحميل تاريخ الدردشة عند التحميل
            loadInitialChat();

            // إعداد معالج الإرسال
            const sendButton = safeGetElement('sdm-send-btn');
            if (sendButton) {
                sendButton.addEventListener('click', sendMessage);
            }

            // إعداد معالج مفتاح Enter
            const messageInput = safeGetElement('sdm-message');
            if (messageInput) {
                messageInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        sendMessage();
                    }
                });
            }
        } catch (e) {
            console.error('Error initializing chat sender:', e);
        }
    }

    // بدء التطبيق
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();