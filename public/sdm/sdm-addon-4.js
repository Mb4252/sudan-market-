// public/sdm/sdm-addon-4.js
(function() {
    'use strict';

    // إعدادات التوسعة
    const ADDON_STORAGE_KEY = 'sdmAddon4Data';
    const ADDON_NAME = 'SDM Addon #4';
    const USER_CHAT_KEY_PREFIX = 'sdmUserChat_';

    // دالة تهيئة التوسعة
    function initAddon() {
        // التحقق من وجود عناصر DOM المطلوبة
        if (!document.getElementById('sdm-chat')) {
            console.warn('SDM chat UI not found, addon cannot initialize');
            return;
        }

        // تحميل البيانات المحفوظة
        loadSavedData();

        // إضافة زر التوسعة إلى واجهة الدردشة
        addAddonButton();

        // تهيئة الأحداث
        setupEventListeners();
    }

    // دالة تحميل البيانات المحفوظة
    function loadSavedData() {
        try {
            const savedData = localStorage.getItem(ADDON_STORAGE_KEY);
            if (savedData) {
                // معالجة البيانات المحفوظة
                console.log('Addon data loaded:', JSON.parse(savedData));
            }
        } catch (error) {
            console.error('Error loading addon data:', error);
        }
    }

    // دالة إضافة زر التوسعة
    function addAddonButton() {
        const chatContainer = document.getElementById('sdm-chat');
        const addonButton = document.createElement('button');
        addonButton.id = 'sdm-addon-4-button';
        addonButton.textContent = ADDON_NAME;
        addonButton.addEventListener('click', handleAddonClick);
        chatContainer.appendChild(addonButton);
    }

    // دالة معالجة النقر على زر التوسعة
    function handleAddonClick() {
        // هنا يمكنك إضافة الوظيفة الرئيسية للتوسعة
        console.log('SDM Addon #4 clicked');
        // مثال: حفظ رسالة دردشة خاصة للمستخدم الحالي
        saveUserChatMessage('Hello, this is a test message from SDM Addon #4');
    }

    // دالة حفظ رسالة دردشة خاصة للمستخدم
    function saveUserChatMessage(message) {
        const userId = getCurrentUserId();
        if (!userId) return;

        const chatKey = USER_CHAT_KEY_PREFIX + userId;
        let chatHistory = localStorage.getItem(chatKey);
        chatHistory = chatHistory ? JSON.parse(chatHistory) : [];
        chatHistory.push({
            timestamp: new Date().toISOString(),
            message: message
        });

        localStorage.setItem(chatKey, JSON.stringify(chatHistory));
        console.log('Message saved for user:', userId);
    }

    // دالة الحصول على معرف المستخدم الحالي
    function getCurrentUserId() {
        // هنا يمكنك إضافة منطق للحصول على معرف المستخدم الحالي
        // مثال: من localStorage أو من واجهة المستخدم
        return localStorage.getItem('currentUserId') || 'defaultUser';
    }

    // دالة تهيئة الأحداث
    function setupEventListeners() {
        // هنا يمكنك إضافة أي أحداث إضافية للتوسعة
    }

    // تهيئة التوسعة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAddon);
    } else {
        initAddon();
    }

})();