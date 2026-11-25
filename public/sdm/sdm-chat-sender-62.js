(function() {
    'use strict';

    // دالة للحصول على الوقت الحالي بشكل آمن
    function getCurrentTime() {
        const now = new Date();
        if (!isValidDate(now)) {
            return '';
        }
        return safeFormatDate(now, 'ar-SA', { hour: '2-digit', minute: '2-digit' });
    }

    // دالة لإضافة رسالة إلى الدردشة
    function addMessageToChat(name, message, isSDM = false) {
        const chatContainer = document.getElementById('sdm-chat');
        if (!chatContainer) return;

        const messageElement = document.createElement('div');
        messageElement.className = `message ${isSDM ? 'sdm-message' : 'user-message'}`;

        const timeElement = document.createElement('span');
        timeElement.className = 'message-time';
        timeElement.textContent = getCurrentTime();

        const nameElement = document.createElement('span');
        nameElement.className = 'message-name';
        nameElement.textContent = name;

        const textElement = document.createElement('span');
        textElement.className = 'message-text';
        textElement.textContent = message;

        messageElement.appendChild(timeElement);
        messageElement.appendChild(nameElement);
        messageElement.appendChild(textElement);

        chatContainer.appendChild(messageElement);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // دالة لحفظ الرسالة في localStorage
    function saveMessageToLocalStorage(username, message) {
        const chatKey = `sdm_chat_${username}`;
        const chatHistory = JSON.parse(localStorage.getItem(chatKey)) || [];
        chatHistory.push({
            time: getCurrentTime(),
            name: username,
            message: message
        });
        localStorage.setItem(chatKey, JSON.stringify(chatHistory));
    }

    // دالة لجلب الرد من SDM
    function getSDMResponse(message) {
        // هنا يمكنك إضافة منطق للحصول على الرد من SDM
        // هذا مثال بسيط يرجى تعديله حسب الحاجة
        return `رد من SDM على: ${message}`;
    }

    // دالة لمعالجة إرسال الرسالة
    function handleSendMessage() {
        const nameInput = document.getElementById('sdm-name');
        const messageInput = document.getElementById('sdm-message');

        if (!nameInput || !messageInput) return;

        const username = nameInput.value.trim();
        const message = messageInput.value.trim();

        if (username && message) {
            // إضافة رسالة المستخدم إلى الدردشة
            addMessageToChat(username, message);

            // حفظ الرسالة في localStorage
            saveMessageToLocalStorage(username, message);

            // الحصول على الرد من SDM
            const sdmResponse = getSDMResponse(message);

            // إضافة رد SDM إلى الدردشة
            addMessageToChat('SDM', sdmResponse, true);

            // حفظ رد SDM في localStorage
            saveMessageToLocalStorage('SDM', sdmResponse);

            // مسح حقل الرسالة
            messageInput.value = '';
        }
    }

    // تهيئة الأحداث
    function init() {
        const sendButton = document.getElementById('sdm-send-btn');
        const messageInput = document.getElementById('sdm-message');

        if (sendButton) {
            sendButton.addEventListener('click', handleSendMessage);
        }

        if (messageInput) {
            messageInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    handleSendMessage();
                }
            });
        }
    }

    // تهيئة التطبيق عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', init);

    // تصدير الدوال للتواصل مع الواجهة
    window.addMessageToChat = addMessageToChat;
    window.saveMessageToLocalStorage = saveMessageToLocalStorage;
    window.getSDMResponse = getSDMResponse;
})();