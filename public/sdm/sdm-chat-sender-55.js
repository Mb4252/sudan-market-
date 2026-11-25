// sdm-chat-sender-55.js
(function() {
    'use strict';

    // دالة معالجة الإرسال
    function handleSend() {
        // الحصول على العناصر DOM
        const nameInput = document.getElementById('sdm-name');
        const messageInput = document.getElementById('sdm-message');
        const chatContainer = document.getElementById('sdm-chat');

        // التحقق من وجود العناصر
        if (!nameInput || !messageInput || !chatContainer) {
            console.error('Required elements not found');
            return;
        }

        // الحصول على القيم
        const name = nameInput.value.trim();
        const message = messageInput.value.trim();

        // التحقق من القيم
        if (!name || !message) {
            alert('الرجاء إدخال الاسم والرسالة');
            return;
        }

        // إنشاء معرف فريد للرسالة
        const messageId = Date.now().toString();

        // إنشاء كائن الرسالة
        const messageObj = {
            id: messageId,
            name: name,
            message: message,
            timestamp: new Date().toISOString(),
            isUser: true
        };

        // حفظ الرسالة في localStorage
        saveMessageToLocalStorage(messageObj);

        // عرض الرسالة في الدردشة
        displayMessage(messageObj);

        // توليد رد من SDM
        const sdmResponse = generateSDMResponse(message);

        // عرض الرد في الدردشة
        displayMessage(sdmResponse);

        // حفظ الرد في localStorage
        saveMessageToLocalStorage(sdmResponse);

        // مسح حقل الرسالة
        messageInput.value = '';
    }

    // دالة حفظ الرسالة في localStorage
    function saveMessageToLocalStorage(message) {
        try {
            const messages = JSON.parse(localStorage.getItem('sdmChatMessages')) || [];
            messages.push(message);
            localStorage.setItem('sdmChatMessages', JSON.stringify(messages));
        } catch (error) {
            console.error('Error saving message to localStorage:', error);
        }
    }

    // دالة عرض الرسالة في الدردشة
    function displayMessage(message) {
        const chatContainer = document.getElementById('sdm-chat');
        if (!chatContainer) return;

        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.isUser ? 'user-message' : 'sdm-message'}`;

        const nameElement = document.createElement('div');
        nameElement.className = 'message-name';
        nameElement.textContent = message.name;

        const textElement = document.createElement('div');
        textElement.className = 'message-text';
        textElement.textContent = message.message;

        const timeElement = document.createElement('div');
        timeElement.className = 'message-time';
        timeElement.textContent = new Date(message.timestamp).toLocaleTimeString();

        messageElement.appendChild(nameElement);
        messageElement.appendChild(textElement);
        messageElement.appendChild(timeElement);

        chatContainer.appendChild(messageElement);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // دالة توليد رد من SDM
    function generateSDMResponse(userMessage) {
        const responses = [
            "شكراً لرسالتك! سنرد عليك قريباً.",
            "تم استلام رسالتك بنجاح.",
            "شكراً لتواصلك معنا.",
            "سنقوم بالرد على رسالتك في أقرب وقت ممكن."
        ];

        const randomIndex = Math.floor(Math.random() * responses.length);

        return {
            id: Date.now().toString() + '-sdm',
            name: 'SDM',
            message: responses[randomIndex],
            timestamp: new Date().toISOString(),
            isUser: false
        };
    }

    // تحميل الرسائل المحفوظة عند تحميل الصفحة
    function loadSavedMessages() {
        try {
            const messages = JSON.parse(localStorage.getItem('sdmChatMessages')) || [];
            messages.forEach(message => displayMessage(message));
        } catch (error) {
            console.error('Error loading saved messages:', error);
        }
    }

    // إضافة مستمع لزر الإرسال
    document.addEventListener('DOMContentLoaded', function() {
        const sendButton = document.getElementById('sdm-send-btn');
        if (sendButton) {
            sendButton.addEventListener('click', handleSend);
        }

        // تحميل الرسائل المحفوظة
        loadSavedMessages();
    });

    // تصدير الدوال العامة
    window.sdmChatSender = {
        handleSend,
        saveMessageToLocalStorage,
        displayMessage,
        generateSDMResponse,
        loadSavedMessages
    };
})();