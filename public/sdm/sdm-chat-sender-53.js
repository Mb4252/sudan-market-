// public/sdm/sdm-chat-sender-53.js
(function() {
    'use strict';

    // دالة لجلب الوقت الحالي بشكل آمن
    function getCurrentTime() {
        const now = new Date();
        if (!isValidDate(now)) {
            return 'Invalid Date';
        }
        return safeFormatDate(now, 'ar-EG', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    // دالة لإنشاء معرف فريد
    function generateId() {
        return 'msg-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    }

    // دالة لجلب الرسائل المحفوظة
    function getSavedMessages() {
        try {
            const messages = localStorage.getItem('sdmChatMessages');
            return messages ? JSON.parse(messages) : [];
        } catch (e) {
            console.error('Error getting saved messages:', e);
            return [];
        }
    }

    // دالة لحفظ رسالة جديدة
    function saveMessage(message) {
        try {
            const messages = getSavedMessages();
            messages.push(message);
            localStorage.setItem('sdmChatMessages', JSON.stringify(messages));
            return true;
        } catch (e) {
            console.error('Error saving message:', e);
            return false;
        }
    }

    // دالة لعرض رسالة في الدردشة
    function displayMessage(message) {
        const chatContainer = document.getElementById('sdm-chat');
        if (!chatContainer) return;

        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message';
        messageElement.innerHTML = `
            <strong>${message.name || 'مجهول'}</strong> (${message.time}):
            <p>${message.text}</p>
        `;
        chatContainer.appendChild(messageElement);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // دالة لجلب رد من SDM
    function getSDMResponse(messageText) {
        // رد افتراضي من SDM
        const responses = [
            "شكراً لرسالتك! سنرد عليك قريباً.",
            "تم استلام رسالتك بنجاح.",
            "شكراً لتواصلك معنا."
        ];
        return responses[Math.floor(Math.random() * responses.length)];
    }

    // دالة لإرسال رسالة
    function sendMessage() {
        const nameInput = document.getElementById('sdm-name');
        const messageInput = document.getElementById('sdm-message');

        if (!nameInput || !messageInput) return;

        const name = nameInput.value.trim();
        const messageText = messageInput.value.trim();

        if (!name || !messageText) return;

        const message = {
            id: generateId(),
            name: name,
            text: messageText,
            time: getCurrentTime()
        };

        // عرض الرسالة في الدردشة
        displayMessage(message);

        // حفظ الرسالة
        saveMessage(message);

        // عرض رد من SDM فوراً
        const sdmResponse = {
            id: generateId(),
            name: 'SDM',
            text: getSDMResponse(messageText),
            time: getCurrentTime()
        };
        displayMessage(sdmResponse);
        saveMessage(sdmResponse);

        // مسح حقل الرسالة بعد الإرسال
        messageInput.value = '';
    }

    // دالة لتحميل الرسائل المحفوظة عند تحميل الصفحة
    function loadSavedMessages() {
        const messages = getSavedMessages();
        messages.forEach(message => displayMessage(message));
    }

    // إضافة مستمع للزر
    function setupEventListeners() {
        const sendButton = document.getElementById('sdm-send-btn');
        if (sendButton) {
            sendButton.addEventListener('click', sendMessage);
        }

        // إضافة دعم لإرسال الرسالة عند الضغط على Enter
        const messageInput = document.getElementById('sdm-message');
        if (messageInput) {
            messageInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    sendMessage();
                }
            });
        }
    }

    // تنفيذ الدوال عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            loadSavedMessages();
            setupEventListeners();
        } catch (e) {
            console.error('Error initializing chat sender:', e);
        }
    });

    // تحديث حالة الاتصال
    updateConnectionStatus('متصل (محلي)');
})();