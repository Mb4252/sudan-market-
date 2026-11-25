// public/sdm/sdm-addon-13.js
(function() {
    'use strict';

    // إعدادات التوسعة
    const ADDON_STORAGE_KEY = 'sdmPersonalChatHistory';
    const ADDON_NAME = 'Personal Chat History';

    // دالة تحميل سجل الدردشة الشخصي
    function loadPersonalChatHistory() {
        try {
            const userId = window.sdmStorage.getUserId();
            if (!userId) return;

            const history = window.sdmStorage.getPersonalChatHistory(userId);
            if (!history || history.length === 0) return;

            const chatContainer = document.getElementById('sdm-chat');
            if (!chatContainer) return;

            // إنشاء تبويب جديد
            const tabButton = document.createElement('button');
            tabButton.textContent = 'سجلّي';
            tabButton.className = 'sdm-tab-button';
            tabButton.addEventListener('click', () => showChatHistory(history));

            const tabContainer = document.createElement('div');
            tabContainer.className = 'sdm-tab-container';
            tabContainer.appendChild(tabButton);

            chatContainer.insertBefore(tabContainer, chatContainer.firstChild);
        } catch (error) {
            console.error('Error loading personal chat history:', error);
        }
    }

    // دالة عرض سجل الدردشة
    function showChatHistory(history) {
        try {
            const chatDisplay = document.getElementById('sdm-chat-display');
            if (!chatDisplay) return;

            chatDisplay.innerHTML = '';
            history.forEach(message => {
                const messageElement = document.createElement('div');
                messageElement.className = 'sdm-chat-message';

                const dateElement = document.createElement('span');
                dateElement.className = 'sdm-message-date';
                dateElement.textContent = window.safeFormatDate(new Date(message.timestamp), 'ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

                const contentElement = document.createElement('div');
                contentElement.className = 'sdm-message-content';
                contentElement.textContent = message.content;

                messageElement.appendChild(dateElement);
                messageElement.appendChild(contentElement);
                chatDisplay.appendChild(messageElement);
            });
        } catch (error) {
            console.error('Error displaying chat history:', error);
        }
    }

    // تهيئة التوسعة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', () => {
        loadPersonalChatHistory();
    });

    // تصدير الوظائف العامة
    window.sdmAddon13 = {
        loadPersonalChatHistory,
        showChatHistory
    };
})();