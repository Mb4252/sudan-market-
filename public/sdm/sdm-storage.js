// public/sdm/sdm-storage.js
(function() {
    'use strict';

    // مفتاح التخزين الرئيسي
    const SDM_STORAGE_KEY = 'sdmConversations';

    // دالة للحصول على جميع المحادثات
    function getAllConversations() {
        try {
            const data = localStorage.getItem(SDM_STORAGE_KEY);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('Error getting conversations:', error);
            return {};
        }
    }

    // دالة لحفظ محادثة
    function saveConversation(userId, message, isUser = true) {
        if (!userId || !message) {
            console.error('Invalid user ID or message');
            return false;
        }

        try {
            const conversations = getAllConversations();
            const timestamp = new Date().toISOString();

            if (!conversations[userId]) {
                conversations[userId] = [];
            }

            conversations[userId].push({
                text: message,
                isUser: isUser,
                timestamp: timestamp
            });

            localStorage.setItem(SDM_STORAGE_KEY, JSON.stringify(conversations));
            return true;
        } catch (error) {
            console.error('Error saving conversation:', error);
            return false;
        }
    }

    // دالة للحصول على محادثة معينة
    function getConversation(userId) {
        const conversations = getAllConversations();
        return conversations[userId] || [];
    }

    // دالة لحذف محادثة
    function deleteConversation(userId) {
        try {
            const conversations = getAllConversations();
            if (conversations[userId]) {
                delete conversations[userId];
                localStorage.setItem(SDM_STORAGE_KEY, JSON.stringify(conversations));
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error deleting conversation:', error);
            return false;
        }
    }

    // ربط الدوال مع النافذة العالمية
    window.sdmStorage = {
        getAllConversations,
        saveConversation,
        getConversation,
        deleteConversation
    };

})();