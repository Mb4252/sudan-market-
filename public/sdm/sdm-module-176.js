// public/sdm/sdm-module-176.js
(function() {
    'use strict';

    // دالة لتخزين وتحميل حالة التمرير
    function handleScrollPosition() {
        try {
            const chatContainer = document.getElementById('sdm-chat');
            if (!chatContainer) return;

            // تحميل حالة التمرير المحفوظة
            const savedScroll = localStorage.getItem('sdmChatScrollPosition');
            if (savedScroll) {
                chatContainer.scrollTop = parseInt(savedScroll, 10);
            }

            // حفظ حالة التمرير عند التمرير
            chatContainer.addEventListener('scroll', function() {
                localStorage.setItem('sdmChatScrollPosition', chatContainer.scrollTop.toString());
            });

            // إعادة التمرير إلى الأسفل عند إضافة رسالة جديدة
            const observer = new MutationObserver(function() {
                chatContainer.scrollTop = chatContainer.scrollHeight;
            });

            observer.observe(chatContainer, { childList: true });
        } catch (error) {
            console.error('Error in scroll position handling:', error);
        }
    }

    // تهيئة التوسعة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', handleScrollPosition);
})();
