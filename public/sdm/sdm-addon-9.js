// public/sdm/sdm-addon-9.js
(function() {
    'use strict';

    // إعدادات التوسعة
    const ADDON_STORAGE_KEY = 'sdmAddon9Data';
    const ADDON_NAME = 'SDM Addon #9 - Chat History Summary';

    // دالة تهيئة التوسعة
    function initAddon() {
        // التحقق من وجود عناصر DOM المطلوبة
        if (!document.getElementById('sdm-chat') || !document.getElementById('sdm-chat-messages')) {
            console.warn('Required SDM chat elements not found, addon cannot initialize');
            return;
        }

        // تحميل البيانات المحفوظة
        loadSavedData();

        // إضافة زر التوسعة إلى واجهة الدردشة
        addAddonButton();

        // تهيئة الأحداث
        setupEvents();
    }

    // تحميل البيانات المحفوظة
    function loadSavedData() {
        try {
            const savedData = localStorage.getItem(ADDON_STORAGE_KEY);
            if (savedData) {
                // معالجة البيانات المحفوظة هنا
                console.log('SDM Addon #9 data loaded');
            }
        } catch (error) {
            console.error('Error loading SDM Addon #9 data:', error);
        }
    }

    // إضافة زر التوسعة إلى واجهة الدردشة
    function addAddonButton() {
        const chatElement = document.getElementById('sdm-chat');
        const button = document.createElement('button');
        button.id = 'sdm-addon-9-button';
        button.textContent = 'Chat Summary';
        button.className = 'sdm-addon-button';
        chatElement.appendChild(button);
    }

    // تهيئة الأحداث
    function setupEvents() {
        const button = document.getElementById('sdm-addon-9-button');
        if (button) {
            button.addEventListener('click', generateChatSummary);
        }
    }

    // توليد ملخص للدردشة
    function generateChatSummary() {
        const messages = document.querySelectorAll('#sdm-chat-messages .message');
        let summary = 'Chat Summary:\n\n';

        messages.forEach((message, index) => {
            const sender = message.querySelector('.sender')?.textContent || 'Unknown';
            const text = message.querySelector('.text')?.textContent || '';
            summary += `${index + 1}. ${sender}: ${text}\n`;
        });

        // عرض الملخص في واجهة الدردشة
        displaySummary(summary);

        // حفظ الملخص في localStorage
        saveSummary(summary);
    }

    // عرض الملخص في واجهة الدردشة
    function displaySummary(summary) {
        const summaryElement = document.createElement('div');
        summaryElement.id = 'sdm-chat-summary';
        summaryElement.className = 'chat-summary';
        summaryElement.textContent = summary;

        const messagesContainer = document.getElementById('sdm-chat-messages');
        messagesContainer.appendChild(summaryElement);
    }

    // حفظ الملخص في localStorage
    function saveSummary(summary) {
        try {
            const userId = localStorage.getItem('userId') || 'defaultUser';
            const storageKey = `${ADDON_STORAGE_KEY}_${userId}`;
            localStorage.setItem(storageKey, summary);
        } catch (error) {
            console.error('Error saving chat summary:', error);
        }
    }

    // تهيئة التوسعة عند تحميل الصفحة
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initAddon();
    } else {
        document.addEventListener('DOMContentLoaded', initAddon);
    }

    // تحديث التوسعة عند تحديث الدردشة
    document.addEventListener('sdmChatUpdated', initAddon);

})();