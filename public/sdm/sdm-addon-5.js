// public/sdm/sdm-addon-5.js
(function() {
    'use strict';

    // إعدادات التوسعة
    const ADDON_STORAGE_KEY = 'sdmAddon5Data';
    const ADDON_NAME = 'SDM Addon #5: Chat Reminders';

    // دالة تهيئة التوسعة
    function initAddon() {
        // التحقق من وجود عناصر DOM المطلوبة
        if (!document.getElementById('sdm-chat') || !document.getElementById('sdm-chat-input')) {
            console.warn('Required SDM chat elements not found, addon cannot initialize');
            return;
        }

        // تحميل البيانات المحفوظة
        loadSavedData();

        // إضافة ميزة التذكير
        setupReminderFeature();

        console.log(`${ADDON_NAME} initialized successfully`);
    }

    // دالة إعداد ميزة التذكير
    function setupReminderFeature() {
        const chatInput = document.getElementById('sdm-chat-input');
        const chatContainer = document.getElementById('sdm-chat');

        // إنشاء عنصر التذكير
        const reminderElement = document.createElement('div');
        reminderElement.id = 'sdm-chat-reminder';
        reminderElement.style.padding = '10px';
        reminderElement.style.backgroundColor = '#f0f0f0';
        reminderElement.style.marginBottom = '10px';
        reminderElement.style.borderRadius = '5px';
        reminderElement.style.display = 'none';

        // إضافة العنصر إلى واجهة الدردشة
        chatContainer.insertBefore(reminderElement, chatInput);

        // دالة عرض التذكير
        function showReminder() {
            const userId = getCurrentUserId();
            const savedChats = getSavedChats(userId);

            if (savedChats && savedChats.length > 0) {
                const lastChat = savedChats[savedChats.length - 1];
                reminderElement.textContent = `تذكير: آخر محادثة كانت: ${lastChat.message}`;
                reminderElement.style.display = 'block';
            }
        }

        // دالة إخفاء التذكير
        function hideReminder() {
            reminderElement.style.display = 'none';
        }

        // عرض التذكير عند التركيز في حقل الإدخال
        chatInput.addEventListener('focus', showReminder);

        // إخفاء التذكير عند فقدان التركيز
        chatInput.addEventListener('blur', hideReminder);
    }

    // دالة تحميل البيانات المحفوظة
    function loadSavedData() {
        try {
            const savedData = localStorage.getItem(ADDON_STORAGE_KEY);
            if (savedData) {
                const parsedData = JSON.parse(savedData);
                // هنا يمكنك استخدام البيانات المحفوظة
                console.log('Addon data loaded:', parsedData);
            }
        } catch (error) {
            console.error('Error loading addon data:', error);
        }
    }

    // دالة الحصول على معرف المستخدم الحالي
    function getCurrentUserId() {
        // هنا يمكنك استخدام أي طريقة للحصول على معرف المستخدم الحالي
        // هذا مثال بسيط
        return 'user_' + Math.floor(Math.random() * 1000);
    }

    // دالة الحصول على المحادثات المحفوظة للمستخدم
    function getSavedChats(userId) {
        // هنا يمكنك استخدام أي طريقة للحصول على المحادثات المحفوظة
        // هذا مثال بسيط
        return [
            { message: 'مرحبا! كيف يمكنني مساعدتك اليوم؟' },
            { message: 'أريد معرفة آخر تحديثات السوق.' }
        ];
    }

    // تهيئة التوسعة عند تحميل الصفحة
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initAddon();
    } else {
        document.addEventListener('DOMContentLoaded', initAddon);
    }

    // تصدير الدوال المطلوبة
    window.sdmAddon5 = {
        init: initAddon,
        name: ADDON_NAME
    };

})();