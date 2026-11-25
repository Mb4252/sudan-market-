// public/sdm/sdm-mobile-layout.js
(function() {
    'use strict';

    // دالة لتطبيق التنسيق على شاشات الهاتف
    function applyMobileLayout() {
        // التحقق من أن الشاشة صغيرة (هاتف)
        if (window.innerWidth <= 768) {
            // الحصول على العناصر المطلوبة
            const chatContainer = document.getElementById('sdm-chat');
            const nameInput = document.getElementById('sdm-name');
            const messageInput = document.getElementById('sdm-message');
            const sendButton = document.getElementById('sdm-send-btn');

            // تطبيق التنسيق
            if (chatContainer) {
                chatContainer.style.height = 'calc(100vh - 200px)';
                chatContainer.style.overflowY = 'auto';
                chatContainer.style.marginBottom = '10px';
            }

            if (nameInput) {
                nameInput.style.width = '100%';
                nameInput.style.marginBottom = '10px';
            }

            if (messageInput) {
                messageInput.style.width = '70%';
                messageInput.style.display = 'inline-block';
            }

            if (sendButton) {
                sendButton.style.width = '25%';
                sendButton.style.display = 'inline-block';
                sendButton.style.marginLeft = '5%';
            }
        }
    }

    // تطبيق التنسيق عند تحميل الصفحة
    window.addEventListener('load', applyMobileLayout);

    // تطبيق التنسيق عند تغيير حجم الشاشة
    window.addEventListener('resize', applyMobileLayout);
})();