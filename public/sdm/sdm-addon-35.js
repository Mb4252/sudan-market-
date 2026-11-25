(function() {
    'use strict';

    // دالة لحفظ الرسالة المؤقتة
    function saveTempMessage(message) {
        try {
            const tempMessages = JSON.parse(localStorage.getItem('sdmTempMessages')) || [];
            tempMessages.push({
                message: message,
                timestamp: new Date().toISOString()
            });
            localStorage.setItem('sdmTempMessages', JSON.stringify(tempMessages));
            alert('تم حفظ الرسالة مؤقتاً!');
        } catch (e) {
            console.error('Error saving temp message:', e);
        }
    }

    // دالة لعرض الرسائل المحفوظة
    function displayTempMessages() {
        try {
            const tempMessages = JSON.parse(localStorage.getItem('sdmTempMessages')) || [];
            const chatElement = document.getElementById('sdm-chat');
            if (chatElement) {
                chatElement.innerHTML += `<div class="temp-messages">${tempMessages.map(msg => `<p>${msg.message} (${new Date(msg.timestamp).toLocaleString()})</p>`).join('')}</div>`;
            }
        } catch (e) {
            console.error('Error displaying temp messages:', e);
        }
    }

    // إضافة زر "حفظ مؤقت" إلى واجهة الدردشة
    function addTempSaveButton() {
        try {
            const sendButton = document.getElementById('send-button');
            if (sendButton) {
                const tempSaveButton = document.createElement('button');
                tempSaveButton.textContent = 'حفظ مؤقت';
                tempSaveButton.id = 'temp-save-button';
                tempSaveButton.style.marginRight = '5px';
                tempSaveButton.onclick = function() {
                    const messageInput = document.getElementById('message-input');
                    if (messageInput && messageInput.value.trim()) {
                        saveTempMessage(messageInput.value.trim());
                        messageInput.value = '';
                    }
                };
                sendButton.parentNode.insertBefore(tempSaveButton, sendButton);
            }
        } catch (e) {
            console.error('Error adding temp save button:', e);
        }
    }

    // تهيئة الميزة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            addTempSaveButton();
            displayTempMessages();
        } catch (e) {
            console.error('SDM Addon 35 Initialization Error:', e);
        }
    });

})();