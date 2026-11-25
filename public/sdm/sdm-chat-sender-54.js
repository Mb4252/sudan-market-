// public/sdm/sdm-chat-sender-54.js
(function() {
    'use strict';

    try {
        // التحقق من وجود جميع العناصر المطلوبة
        const chatContainer = document.getElementById('sdm-chat');
        const nameInput = document.getElementById('sdm-name');
        const messageInput = document.getElementById('sdm-message');
        const sendButton = document.getElementById('sdm-send-btn');

        if (!chatContainer || !nameInput || !messageInput || !sendButton) {
            console.error('One or more required elements are missing');
            return;
        }

        // دالة لحفظ الرسالة في localStorage
        function saveMessage(name, message) {
            try {
                const chatHistory = JSON.parse(localStorage.getItem('sdmChatHistory')) || [];
                chatHistory.push({
                    name: name,
                    message: message,
                    timestamp: new Date().toISOString()
                });
                localStorage.setItem('sdmChatHistory', JSON.stringify(chatHistory));
            } catch (error) {
                console.error('Error saving message:', error);
            }
        }

        // دالة لعرض الرسالة في صندوق الدردشة
        function displayMessage(name, message, isSDM = false) {
            const messageElement = document.createElement('div');
            messageElement.className = isSDM ? 'sdm-message' : 'user-message';
            messageElement.innerHTML = `<strong>${name}:</strong> ${message}`;
            chatContainer.appendChild(messageElement);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        // دالة لرد SDM فوراً
        function getSDMResponse(message) {
            // ردود افتراضية بسيطة من SDM
            const responses = {
                'مرحبا': 'مرحبا بك في سوق السودان! كيف يمكنني مساعدتك؟',
                'سعر': 'سعر المنتج هو 500 جنيه سوداني.',
                'شكرا': 'على الرحب والسلامة!',
                '': 'يرجى إدخال رسالة صالحة'
            };

            // البحث عن الكلمة الأولى في الرسالة
            const firstWord = message.split(' ')[0];
            return responses[firstWord] || 'آسف، لم أفهم طلبك. يمكنك المحاولة مرة أخرى.';
        }

        // دالة لإرسال الرسالة
        function sendMessage() {
            const name = nameInput.value.trim();
            const message = messageInput.value.trim();

            if (!name || !message) {
                alert('يرجى إدخال الاسم والرسالة');
                return;
            }

            // حفظ الرسالة
            saveMessage(name, message);
            // عرض الرسالة
            displayMessage(name, message);
            // عرض رد SDM فوراً
            displayMessage('SDM', getSDMResponse(message), true);

            // مسح حقل الرسالة
            messageInput.value = '';
        }

        // إضافة مستمع للزر
        sendButton.addEventListener('click', sendMessage);

        // إضافة مستمع لزر Enter في حقل الرسالة
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });

        // تحميل الرسائل المحفوظة عند تحميل الصفحة
        function loadSavedMessages() {
            try {
                const chatHistory = JSON.parse(localStorage.getItem('sdmChatHistory')) || [];
                chatHistory.forEach(entry => {
                    displayMessage(entry.name, entry.message);
                });
            } catch (error) {
                console.error('Error loading saved messages:', error);
            }
        }

        loadSavedMessages();
    } catch (error) {
        console.error('Error in sdm-chat-sender-54.js:', error);
    }
})();