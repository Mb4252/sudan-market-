// sdm-addon-18.js
// ميزة جديدة: عرض عدد الرسائل في صندوق الرسائل

(function() {
    'use strict';

    // دالة تحديث عداد الرسائل
    function updateMessageCount() {
        try {
            const chatContainer = document.getElementById('chat-container');
            const messageCountElement = document.getElementById('message-count');

            if (!chatContainer || !messageCountElement) return;

            const messages = chatContainer.querySelectorAll('.message');
            const count = messages.length;

            safeSetTextContent(messageCountElement, `(${count})`);
        } catch (e) {
            console.error('Error updating message count:', e);
        }
    }

    // تحديث العداد عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', updateMessageCount);

    // تحديث العداد عند إضافة رسالة جديدة
    if (window.sdmEngine) {
        window.sdmEngine.on('newMessage', updateMessageCount);
    }

    // تحديث العداد كل 30 ثانية
    setInterval(updateMessageCount, 30000);

    // تحديث العداد عند تغيير حجم النافذة
    window.addEventListener('resize', updateMessageCount);

    // تحديث العداد عند التمرير
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
        chatContainer.addEventListener('scroll', updateMessageCount);
    }
})();