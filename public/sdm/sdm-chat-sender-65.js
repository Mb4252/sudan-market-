// public/sdm/sdm-chat-sender-65.js
(function() {
    'use strict';

    // إعدادات
    const CHAT_STORAGE_KEY = 'sdmChatMessages';
    const SDM_REPLY_DELAY = 500; // تأخير رد SDM (مللي ثانية)

    // دالة لجلب الرسائل المحفوظة
    function getSavedMessages() {
        try {
            const data = localStorage.getItem(CHAT_STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('Error getting saved messages:', error);
            return [];
        }
    }

    // دالة لحفظ رسالة جديدة
    function saveMessage(message) {
        try {
            const messages = getSavedMessages();
            messages.push(message);
            localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
            return true;
        } catch (error) {
            console.error('Error saving message:', error);
            return false;
        }
    }

    // دالة لتوليد رد SDM
    function generateSDMReply() {
        const replies = [
            "شكراً لرسالتك! نحن نعمل على معالجة طلبك.",
            "نحن نقدر اهتمامك. سنرد على رسالتك قريباً.",
            "شكراً لتواصلك معنا. سنرد عليك في أقرب وقت ممكن."
        ];
        return replies[Math.floor(Math.random() * replies.length)];
    }

    // دالة لإضافة رسالة إلى صندوق الدردشة
    function addMessageToChat(message) {
        const chatContainer = document.getElementById('sdm-chat');
        if (!chatContainer) return;

        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.sender}`;
        messageElement.innerHTML = `<strong>${message.sender}:</strong> ${message.text}`;
        chatContainer.appendChild(messageElement);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // دالة لإرسال رسالة
    function sendMessage() {
        const nameInput = document.getElementById('sdm-name');
        const messageInput = document.getElementById('sdm-message');

        if (!nameInput || !messageInput) return;

        const name = nameInput.value.trim();
        const messageText = messageInput.value.trim();

        if (!name || !messageText) return;

        // حفظ الرسالة
        const userMessage = {
            sender: 'user',
            text: messageText,
            timestamp: new Date().toISOString()
        };
        saveMessage(userMessage);
        addMessageToChat(userMessage);

        // توليد رد SDM
        setTimeout(() => {
            const sdmReply = {
                sender: 'SDM',
                text: generateSDMReply(),
                timestamp: new Date().toISOString()
            };
            saveMessage(sdmReply);
            addMessageToChat(sdmReply);
        }, SDM_REPLY_DELAY);

        // مسح حقل الرسالة
        messageInput.value = '';
    }

    // دالة لتحميل الرسائل المحفوظة
    function loadSavedMessages() {
        const messages = getSavedMessages();
        messages.forEach(message => addMessageToChat(message));
    }

    // تهيئة التطبيق
    function init() {
        try {
            // تحميل الرسائل المحفوظة
            loadSavedMessages();

            // إعداد معالج الحدث لزر الإرسال
            const sendButton = document.getElementById('sdm-send-btn');
            if (sendButton) {
                sendButton.addEventListener('click', sendMessage);
            }

            // إعداد معالج الحدث لاختصار Enter
            const messageInput = document.getElementById('sdm-message');
            if (messageInput) {
                messageInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        sendMessage();
                    }
                });
            }
        } catch (error) {
            console.error('Error initializing chat sender:', error);
        }
    }

    // بدء التطبيق
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // تصدير الدوال العامة
    window.sdmChatSender = {
        sendMessage,
        loadSavedMessages
    };
})();