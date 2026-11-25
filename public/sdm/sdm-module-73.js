// public/sdm/sdm-module-73.js
(function() {
    'use strict';

    // دالة لحفظ اسم المستخدم في localStorage وتحديث الواجهة
    function saveAndDisplayUsername() {
        try {
            const nameInput = document.getElementById('sdm-name');
            if (!nameInput) return;

            const username = nameInput.value.trim();
            if (!username) return;

            // حفظ في localStorage
            localStorage.setItem('sdmUsername', username);

            // تحديث الواجهة
            const chatContainer = document.getElementById('sdm-chat');
            if (chatContainer) {
                const messageElement = document.createElement('div');
                messageElement.textContent = `مرحباً ${username}!`;
                chatContainer.appendChild(messageElement);
            }

            // مسح الحقل
            nameInput.value = '';
        } catch (error) {
            console.error('Error in saveAndDisplayUsername:', error);
        }
    }

    // إضافة مستمع الحدث عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        const nameInput = document.getElementById('sdm-name');
        if (nameInput) {
            nameInput.addEventListener('change', saveAndDisplayUsername);
        }
    });

    // تحديث الواجهة عند تحميل الصفحة
    function updateUIOnLoad() {
        try {
            const username = localStorage.getItem('sdmUsername');
            if (username) {
                const chatContainer = document.getElementById('sdm-chat');
                if (chatContainer) {
                    const messageElement = document.createElement('div');
                    messageElement.textContent = `مرحباً ${username}!`;
                    chatContainer.appendChild(messageElement);
                }
            }
        } catch (error) {
            console.error('Error in updateUIOnLoad:', error);
        }
    }

    // استدعاء التحديث عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', updateUIOnLoad);

    // ربط الدوال مع النافذة العالمية
    window.saveAndDisplayUsername = saveAndDisplayUsername;
})();