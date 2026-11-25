// public/sdm/sdm-commands.js
(function() {
    'use strict';

    // التحقق من وجود عناصر DOM قبل العمل
    if (!document.getElementById('sdm-chat') ||
        !document.getElementById('chat-messages') ||
        !document.getElementById('user-message') ||
        !document.getElementById('send-message')) {
        console.warn('SDM chat elements not found. Commands module will not load.');
        return;
    }

    // أوامر سريعة
    const QUICK_COMMANDS = {
        '/help': 'عرض الأوامر المتاحة',
        '/price [item]': 'مقارنة أسعار المنتج',
        '/history': 'عرض سجل المحادثة',
        '/clear': 'مسح المحادثة'
    };

    // دالة معالجة الأوامر
    function handleCommand(message) {
        const lowerMsg = message.toLowerCase();

        // عرض المساعدة
        if (lowerMsg === '/help') {
            let helpText = 'الأوامر المتاحة:\n';
            for (const [cmd, desc] of Object.entries(QUICK_COMMANDS)) {
                helpText += `${cmd}: ${desc}\n`;
            }
            return helpText.trim();
        }

        // مقارنة الأسعار
        if (lowerMsg.startsWith('/price ')) {
            const item = message.substring(7).trim();
            if (!item) {
                return 'يرجى إدخال اسم المنتج بعد الأمر';
            }

            // هنا يمكنك إضافة منطق مقارنة الأسعار
            // مثال: استرجاع الأسعار من localStorage أو من مصدر آخر
            return `مقارنة أسعار ${item}:\n- المتجر A: 1000 جنية\n- المتجر B: 950 جنية\n- المتجر C: 980 جنية`;
        }

        // عرض سجل المحادثة
        if (lowerMsg === '/history') {
            const chatMessages = document.getElementById('chat-messages');
            return chatMessages ? chatMessages.innerHTML : 'لا يوجد سجل محادثة';
        }

        // مسح المحادثة
        if (lowerMsg === '/clear') {
            const chatMessages = document.getElementById('chat-messages');
            if (chatMessages) {
                chatMessages.innerHTML = '';
            }
            return 'تم مسح المحادثة';
        }

        return null;
    }

    // دالة لإضافة رسالة إلى الدردشة
    function addMessage(sender, text) {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        messageDiv.innerHTML = `<strong>${sender}:</strong> ${text}`;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // معالجة إرسال الرسالة
    function handleSendMessage() {
        const messageInput = document.getElementById('user-message');
        if (!messageInput) return;

        const message = messageInput.value.trim();
        if (!message) return;

        // معالجة الأوامر
        const commandResponse = handleCommand(message);
        if (commandResponse) {
            addMessage('أنت', message);
            addMessage('SDM', commandResponse);
            messageInput.value = '';
            return;
        }

        // إرسال الرسالة إلى الخادم إذا لم تكن أمراً
        addMessage('أنت', message);
        // هنا يمكنك إضافة منطق إرسال الرسالة إلى الخادم
        messageInput.value = '';
    }

    // إعداد الأحداث
    document.addEventListener('DOMContentLoaded', function() {
        const sendButton = document.getElementById('send-message');
        const messageInput = document.getElementById('user-message');

        if (sendButton && messageInput) {
            sendButton.addEventListener('click', handleSendMessage);
            messageInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    handleSendMessage();
                }
            });
        }
    });

    // تحديث index.html
    document.addEventListener('DOMContentLoaded', function() {
        const head = document.head;
        const script = document.createElement('script');
        script.src = 'sdm/sdm-commands.js';
        head.appendChild(script);
    });

    // تصدير الدوال العامة
    window.sdmCommands = {
        handleCommand,
        addMessage,
        handleSendMessage
    };
})();