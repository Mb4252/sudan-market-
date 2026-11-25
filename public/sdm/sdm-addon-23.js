(function() {
    'use strict';
    try {
        // التحقق من وجود عناصر DOM المطلوبة
        const chatContainer = document.querySelector('.chat-container');
        if (!chatContainer) return;

        // التحقق من وجود زر الإرسال
        const sendButton = document.querySelector('.send-button');
        if (!sendButton) return;

        // التحقق من وجود حقل إدخال الرسائل
        const messageInput = document.querySelector('.message-input');
        if (!messageInput) return;

        // التحقق من وجود شريط حالة الاتصال
        const connectionStatus = document.getElementById('connection-status');
        if (!connectionStatus) return;

        // دالة لتفعيل ميزة حفظ الرسائل في localStorage
        function saveMessagesToLocalStorage() {
            try {
                const messages = [];
                const messageElements = chatContainer.querySelectorAll('.message');
                messageElements.forEach(element => {
                    const message = {
                        text: element.textContent,
                        timestamp: element.dataset.timestamp || new Date().toISOString()
                    };
                    messages.push(message);
                });
                localStorage.setItem('sdmMessagesHistory', JSON.stringify(messages));
            } catch (error) {
                console.error('Error saving messages:', error);
            }
        }

        // دالة لاستعادة الرسائل من localStorage
        function loadMessagesFromLocalStorage() {
            try {
                const savedMessages = localStorage.getItem('sdmMessagesHistory');
                if (savedMessages) {
                    const messages = JSON.parse(savedMessages);
                    messages.forEach(message => {
                        const messageElement = document.createElement('div');
                        messageElement.className = 'message';
                        messageElement.textContent = message.text;
                        messageElement.dataset.timestamp = message.timestamp;
                        chatContainer.appendChild(messageElement);
                    });
                }
            } catch (error) {
                console.error('Error loading messages:', error);
            }
        }

        // استعادة الرسائل عند تحميل الصفحة
        loadMessagesFromLocalStorage();

        // حفظ الرسائل عند إرسال رسالة جديدة
        sendButton.addEventListener('click', function() {
            saveMessagesToLocalStorage();
        });

        // حفظ الرسائل عند الضغط على Enter في حقل الإدخال
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                saveMessagesToLocalStorage();
            }
        });

        // عرض رسالة تأكيد عند حفظ الرسائل بنجاح
        saveMessagesToLocalStorage();
        if (connectionStatus) {
            safeSetTextContent(connectionStatus, 'المessages saved locally');
            setTimeout(() => {
                if (connectionStatus) {
                    safeSetTextContent(connectionStatus, 'Online');
                }
            }, 2000);
        }

    } catch (e) {
        console.error('Error in sdm-addon-23:', e);
    }
})();