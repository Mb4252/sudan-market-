(function() {
    'use strict';

    // دالة لحفظ إعدادات الدردشة (مثل آخر رسالة أو حالة) في localStorage
    function saveChatSettings(settings) {
        try {
            if (!settings || typeof settings !== 'object') {
                throw new Error('Invalid settings object');
            }
            localStorage.setItem('sdmChatSettings', JSON.stringify(settings));
            return true;
        } catch (error) {
            console.error('Error saving chat settings:', error);
            return false;
        }
    }

    // دالة لجلب إعدادات الدردشة
    function loadChatSettings() {
        try {
            const settingsString = localStorage.getItem('sdmChatSettings');
            return settingsString ? JSON.parse(settingsString) : {};
        } catch (error) {
            console.error('Error loading chat settings:', error);
            return {};
        }
    }

    // تحديث واجهة المستخدم باستخدام إعدادات الدردشة
    function updateChatUI() {
        try {
            const settings = loadChatSettings();
            const nameInput = document.getElementById('sdm-name');
            const messageInput = document.getElementById('sdm-message');

            if (nameInput && settings.lastName) {
                nameInput.value = settings.lastName;
            }

            if (messageInput && settings.lastMessage) {
                messageInput.value = settings.lastMessage;
            }

        } catch (error) {
            console.error('Error updating chat UI:', error);
        }
    }

    // حفظ إعدادات الدردشة عند تغييرها
    document.getElementById('sdm-name')?.addEventListener('input', (e) => {
        const settings = loadChatSettings();
        settings.lastName = e.target.value;
        saveChatSettings(settings);
    });

    document.getElementById('sdm-message')?.addEventListener('input', (e) => {
        const settings = loadChatSettings();
        settings.lastMessage = e.target.value;
        saveChatSettings(settings);
    });

    // التحقق من وجود عناصر DOM قبل التحديث
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateChatUI);
    } else {
        updateChatUI();
    }

    // ربط الدالة مع النافذة العالمية
    window.sdmModule76 = {
        saveChatSettings,
        loadChatSettings,
        updateChatUI
    };

})();