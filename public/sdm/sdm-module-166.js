// public/sdm/sdm-module-166.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule166Data';
    const MODULE_NAME = 'SDM Module #166';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const chatContainer = document.getElementById('sdm-chat');
            if (!chatContainer) {
                console.warn('SDM chat container not found');
                return;
            }

            // إنشاء عنصر جديد لعرض عدد الرسائل المحفوظة
            const messageCountElement = document.createElement('div');
            messageCountElement.id = 'sdm-message-count';
            messageCountElement.style.position = 'absolute';
            messageCountElement.style.top = '10px';
            messageCountElement.style.right = '10px';
            messageCountElement.style.backgroundColor = '#f0f0f0';
            messageCountElement.style.padding = '5px 10px';
            messageCountElement.style.borderRadius = '5px';
            messageCountElement.style.fontSize = '12px';

            chatContainer.appendChild(messageCountElement);

            // تحديث عداد الرسائل
            updateMessageCount();

            // تحديث العداد كل 5 ثوان
            setInterval(updateMessageCount, 5000);

        } catch (error) {
            console.error(`Error initializing ${MODULE_NAME}:`, error);
        }
    }

    // دالة تحديث عداد الرسائل المحفوظة
    function updateMessageCount() {
        try {
            // جلب جميع الرسائل من التخزين المحلي
            const posts = window.getAllPosts ? window.getAllPosts() : [];
            const messageCount = posts.length;

            // تحديث العنصر في الواجهة
            const messageCountElement = document.getElementById('sdm-message-count');
            if (messageCountElement) {
                messageCountElement.textContent = `Messages: ${messageCount}`;
            }
        } catch (error) {
            console.error(`Error updating message count in ${MODULE_NAME}:`, error);
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initModule();
    } else {
        document.addEventListener('DOMContentLoaded', initModule);
    }

})();