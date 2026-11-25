// public/sdm/sdm-addon-10.js
(function() {
    'use strict';

    // إعدادات التوسعة
    const ADDON_STORAGE_KEY = 'sdmAddon10Data';
    const ADDON_NAME = 'SDM Addon #10 - Chat History Summary';

    // دالة تهيئة التوسعة
    function initAddon() {
        // التحقق من وجود عناصر DOM المطلوبة
        if (!document.getElementById('sdm-chat')) {
            console.warn('SDM chat UI not found, addon cannot initialize');
            return;
        }

        // إنشاء زر جديد في واجهة الدردشة
        createAddonButton();

        // تحميل البيانات المحفوظة
        loadSavedData();

        console.log(`${ADDON_NAME} initialized successfully`);
    }

    // إنشاء زر التوسعة
    function createAddonButton() {
        const chatContainer = document.getElementById('sdm-chat');
        const button = document.createElement('button');
        button.id = 'sdm-addon-10-button';
        button.textContent = 'Chat Summary';
        button.onclick = generateChatSummary;
        chatContainer.appendChild(button);
    }

    // دالة إنشاء ملخص للدردشة
    function generateChatSummary() {
        const chatMessages = document.querySelectorAll('#sdm-chat .message');
        let summary = 'Chat Summary:\n\n';

        chatMessages.forEach((message, index) => {
            const sender = message.querySelector('.sender')?.textContent || 'Unknown';
            const time = message.querySelector('.time')?.textContent || 'Unknown time';
            const text = message.querySelector('.text')?.textContent || '';

            summary += `${index + 1}. [${time}] ${sender}: ${text}\n`;
        });

        // حفظ الملخص
        saveSummary(summary);

        // عرض الملخص للمستخدم
        alert(summary);
    }

    // دالة حفظ الملخص
    function saveSummary(summary) {
        try {
            const savedData = JSON.parse(localStorage.getItem(ADDON_STORAGE_KEY)) || {};
            savedData.lastSummary = summary;
            savedData.lastSummaryDate = new Date().toISOString();
            localStorage.setItem(ADDON_STORAGE_KEY, JSON.stringify(savedData));
        } catch (error) {
            console.error('Error saving summary:', error);
        }
    }

    // دالة تحميل البيانات المحفوظة
    function loadSavedData() {
        try {
            const savedData = JSON.parse(localStorage.getItem(ADDON_STORAGE_KEY));
            if (savedData && savedData.lastSummary) {
                console.log('Loaded saved chat summary data');
            }
        } catch (error) {
            console.error('Error loading saved data:', error);
        }
    }

    // تهيئة التوسعة عند تحميل الصفحة
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initAddon();
    } else {
        document.addEventListener('DOMContentLoaded', initAddon);
    }

    // تحديث index.html
    // <script src="sdm/sdm-addon-10.js"></script>
})();