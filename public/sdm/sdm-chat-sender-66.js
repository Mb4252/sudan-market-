// public/sdm/sdm-chat-sender-66.js
(function() {
    'use strict';

    // دالة لإرسال الرسالة وحفظها في localStorage وعرضها فوراً
    function setupChatSender() {
        const sendButton = document.getElementById('sdm-send-btn');
        const nameInput = document.getElementById('sdm-name');
        const messageInput = document.getElementById('sdm-message');
        const chatContainer = document.getElementById('sdm-chat');

        if (!sendButton || !nameInput || !messageInput || !chatContainer) {
            console.error('Required elements not found');
            return;
        }

        // دالة لجلب الرسائل المحفوظة
        function getSavedMessages() {
            try {
                const saved = localStorage.getItem('sdmChatMessages');
                return saved ? JSON.parse(saved) : [];
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
            } catch (e) {
                console.error('Error saving message:', e);
            }
        }

        // دالة لعرض رسالة في الدردشة
        function displayMessage(message, isUser = true) {
            const messageElement = document.createElement('div');
            messageElement.className = isUser ? 'user-message' : 'sdm-message';

            const nameElement = document.createElement('strong');
            nameElement.textContent = isUser ? message.name : 'SDM';

            const textElement = document.createElement('p');
            textElement.textContent = message.text;

            const timeElement = document.createElement('small');
            timeElement.textContent = new Date(message.timestamp).toLocaleTimeString();

            messageElement.appendChild(nameElement);
            messageElement.appendChild(textElement);
            messageElement.appendChild(timeElement);

            chatContainer.appendChild(messageElement);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        // دالة لرد SDM الفوري
        function getSDMResponse(messageText) {
            // ردود SDM الفورية
            const responses = {
                'مرحبا': 'مرحبا بك في سوق السودان! كيف يمكنني مساعدتك؟',
                'سعر': 'سعر المنتج هو 100 دولار. هل تريد مزيد من التفاصيل؟',
                'شكرا': 'شكراً لك! إذا كان لديك أي أسئلة أخرى، لا تتردد في السؤال.',
                'موقعك': 'نحن في الخرطوم، شارع السوق الرئيسي. يمكنك زيارتنا في أي وقت.'
            };

            // البحث عن الرد المناسب
            for (const key in responses) {
                if (messageText.includes(key)) {
                    return responses[key];
                }
            }

            // رد افتراضي إذا لم يتم العثور على رد مناسب
            return 'شكراً لرسالتك. سنرد عليك قريباً.';
        }

        // دالة لإرسال الرسالة
        function sendMessage() {
            const name = nameInput.value.trim();
            const messageText = messageInput.value.trim();

            if (!name || !messageText) {
                alert('الرجاء إدخال الاسم والرسالة');
                return;
            }

            const message = {
                name,
                text: messageText,
                timestamp: new Date().toISOString()
            };

            // عرض الرسالة في الدردشة
            displayMessage(message);

            // حفظ الرسالة
            saveMessage(message);

            // الحصول على رد SDM الفوري
            const sdmResponse = getSDMResponse(messageText);
            const sdmMessage = {
                name: 'SDM',
                text: sdmResponse,
                timestamp: new Date().toISOString()
            };

            // عرض رد SDM
            displayMessage(sdmMessage, false);

            // حفظ رد SDM
            saveMessage(sdmMessage);

            // مسح حقل الرسالة بعد الإرسال
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

        // عرض الرسائل المحفوظة عند التحميل
        function loadSavedMessages() {
            const messages = getSavedMessages();
            messages.forEach(message => {
                displayMessage(message, message.name !== 'SDM');
            });
        }

        // تحميل الرسائل المحفوظة عند بدء التشغيل
        loadSavedMessages();
    }

    // تفعيل الدالة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', setupChatSender);

    // تصدير الدالة للتواصل مع الملفات الأخرى
    window.setupChatSender = setupChatSender;
})();