// sdm-addon-33.js
(function() {
    'use strict';

    // دالة لجلب هوية المستخدم من localStorage
    function getUserIdentity() {
        try {
            const identity = localStorage.getItem('userIdentity');
            return identity || 'مستخدم مجهول';
        } catch (e) {
            console.error('Error getting user identity:', e);
            return 'مستخدم مجهول';
        }
    }

    // دالة لإضافة رسالة الترحيب عند بدء الدردشة
    function addWelcomeMessage() {
        try {
            const chatElement = document.getElementById('sdm-chat');
            if (!chatElement) return;

            const userIdentity = getUserIdentity();
            const welcomeMessage = document.createElement('div');
            welcomeMessage.textContent = `مرحباً ${userIdentity}! هذه دردشة خاصة بك.`;
            welcomeMessage.style.color = '#4CAF50';
            welcomeMessage.style.marginBottom = '10px';

            chatElement.appendChild(welcomeMessage);
        } catch (e) {
            console.error('Error adding welcome message:', e);
        }
    }

    // تفعيل الميزة فوراً
    document.addEventListener('DOMContentLoaded', addWelcomeMessage);

})();