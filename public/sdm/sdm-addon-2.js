(function() {
    'use strict';

    // دالة لجلب سجل الدردشة الخاصة بالمستخدم الحالي
    function getPrivateChatHistory() {
        const userId = localStorage.getItem('userId') || 'anonymous';
        const chatKey = `sdmPrivateChat_${userId}`;
        const history = localStorage.getItem(chatKey);
        return history ? JSON.parse(history) : [];
    }

    // دالة لحفظ رسالة جديدة في سجل الدردشة الخاصة
    function savePrivateChatMessage(message) {
        const userId = localStorage.getItem('userId') || 'anonymous';
        const chatKey = `sdmPrivateChat_${userId}`;
        const history = getPrivateChatHistory();
        history.push(message);
        localStorage.setItem(chatKey, JSON.stringify(history));
    }

    // دالة لعرض سجل الدردشة الخاصة
    function renderPrivateChatHistory() {
        const chatMessages = document.getElementById('private-chat-messages');
        if (!chatMessages) return;

        const history = getPrivateChatHistory();
        chatMessages.innerHTML = '';

        history.forEach(msg => {
            const messageElement = document.createElement('div');
            messageElement.className = `chat-message ${msg.sender === 'user' ? 'user-message' : 'sdm-message'}`;
            messageElement.textContent = msg.text;
            chatMessages.appendChild(messageElement);
        });

        // التمرير إلى آخر رسالة
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // دالة لمعالجة إرسال رسالة جديدة
    function handleSendPrivateMessage() {
        const messageInput = document.getElementById('private-user-message');
        if (!messageInput) return;

        const messageText = messageInput.value.trim();
        if (!messageText) return;

        const message = {
            text: messageText,
            sender: 'user',
            timestamp: new Date().toISOString()
        };

        savePrivateChatMessage(message);
        renderPrivateChatHistory();
        messageInput.value = '';

        // هنا يمكنك إضافة منطق للرد من SDM إذا كنت تريد
    }

    // دالة لتهيئة واجهة الدردشة الخاصة
    function initPrivateChatUI() {
        const chatContainer = document.getElementById('private-sdm-chat');
        if (!chatContainer) return;

        // إنشاء عناصر واجهة الدردشة إذا لم تكن موجودة
        if (!document.getElementById('private-chat-messages')) {
            const messagesDiv = document.createElement('div');
            messagesDiv.id = 'private-chat-messages';
            messagesDiv.style.height = '300px';
            messagesDiv.style.overflowY = 'auto';
            messagesDiv.style.border = '1px solid #ddd';
            messagesDiv.style.padding = '10px';
            messagesDiv.style.marginBottom = '10px';
            chatContainer.appendChild(messagesDiv);
        }

        if (!document.getElementById('private-user-message')) {
            const input = document.createElement('input');
            input.id = 'private-user-message';
            input.type = 'text';
            input.placeholder = 'اكتب رسالتك الخاصة مع SDM...';
            input.style.width = '70%';
            input.style.padding = '8px';
            chatContainer.appendChild(input);
        }

        if (!document.getElementById('private-send-button')) {
            const button = document.createElement('button');
            button.id = 'private-send-button';
            button.textContent = 'إرسال';
            button.style.marginLeft = '10px';
            button.style.padding = '8px 15px';
            button.addEventListener('click', handleSendPrivateMessage);
            chatContainer.appendChild(button);
        }

        // عرض سجل الدردشة الحالي
        renderPrivateChatHistory();
    }

    // تهيئة الدردشة الخاصة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        initPrivateChatUI();
    });

    // تحديث واجهة الدردشة إذا تم إضافة عنصر الدردشة إلى الصفحة لاحقًا
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.addedNodes) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.id === 'private-sdm-chat') {
                        initPrivateChatUI();
                    }
                });
            }
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // تصدير الدوال العامة
    window.sdmPrivateChat = {
        getHistory: getPrivateChatHistory,
        saveMessage: savePrivateChatMessage,
        renderHistory: renderPrivateChatHistory
    };
})();