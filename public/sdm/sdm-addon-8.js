// public/sdm/sdm-addon-8.js
(function() {
    'use strict';

    // إعدادات التوسعة
    const ADDON_STORAGE_KEY = 'sdmAddon8Data';
    const ADDON_NAME = 'SDM Addon #8';
    const CHAT_CONTAINER_ID = 'sdm-chat-messages';

    // دالة تهيئة التوسعة
    function initAddon() {
        // التحقق من وجود عناصر DOM المطلوبة
        const chatContainer = document.getElementById(CHAT_CONTAINER_ID);
        if (!chatContainer) {
            console.warn('Chat container not found, addon cannot initialize');
            return;
        }

        // تحميل البيانات المحفوظة
        loadSavedData();

        // إضافة ميزة جديدة: زر لتسريع الردود الشائعة
        addQuickReplyButtons();

        // إضافة ميزة جديدة: مؤشر نشاط SDM
        addActivityIndicator();

        console.log(`${ADDON_NAME} initialized successfully`);
    }

    // دالة لإضافة زر الرد السريع
    function addQuickReplyButtons() {
        const quickReplies = [
            { text: 'شكراً لك', response: 'شكراً لك أيضاً! 😊' },
            { text: 'كيف حالك؟', response: 'أنا بخير، شكراً! كيف يمكنني مساعدتك؟' },
            { text: 'هل يمكنك المساعدة؟', response: 'بالطبع! ما الذي تريد مساعدتك به؟' }
        ];

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'quick-reply-container';
        buttonContainer.style.marginTop = '10px';

        quickReplies.forEach(reply => {
            const button = document.createElement('button');
            button.textContent = reply.text;
            button.className = 'quick-reply-button';
            button.style.marginRight = '5px';
            button.style.padding = '5px 10px';
            button.style.cursor = 'pointer';

            button.addEventListener('click', () => {
                // إرسال الرد إلى واجهة الدردشة
                const chatInput = document.getElementById('sdm-chat-input');
                if (chatInput) {
                    chatInput.value = reply.response;
                    chatInput.dispatchEvent(new Event('input'));
                }
            });

            buttonContainer.appendChild(button);
        });

        const chatInputContainer = document.querySelector('.sdm-chat-input-container');
        if (chatInputContainer) {
            chatInputContainer.appendChild(buttonContainer);
        }
    }

    // دالة لإضافة مؤشر النشاط
    function addActivityIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'sdm-activity-indicator';
        indicator.style.display = 'none';
        indicator.style.marginTop = '10px';
        indicator.style.color = '#666';
        indicator.textContent = 'SDM is typing...';

        const chatContainer = document.getElementById(CHAT_CONTAINER_ID);
        if (chatContainer) {
            chatContainer.appendChild(indicator);
        }
    }

    // دالة لتحميل البيانات المحفوظة
    function loadSavedData() {
        try {
            const savedData = localStorage.getItem(ADDON_STORAGE_KEY);
            if (savedData) {
                const data = JSON.parse(savedData);
                console.log(`${ADDON_NAME} data loaded successfully`);
                return data;
            }
        } catch (error) {
            console.error(`${ADDON_NAME} error loading data:`, error);
        }
        return null;
    }

    // دالة لحفظ البيانات
    function saveData(data) {
        try {
            localStorage.setItem(ADDON_STORAGE_KEY, JSON.stringify(data));
            console.log(`${ADDON_NAME} data saved successfully`);
        } catch (error) {
            console.error(`${ADDON_NAME} error saving data:`, error);
        }
    }

    // تهيئة التوسعة عند تحميل الصفحة
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initAddon();
    } else {
        document.addEventListener('DOMContentLoaded', initAddon);
    }

    // تصدير الدوال العامة
    window.sdmAddon8 = {
        init: initAddon,
        saveData,
        loadSavedData: loadSavedData
    };
})();