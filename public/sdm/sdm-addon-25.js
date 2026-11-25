// sdm-addon-25.js
(function() {
    'use strict';

    // دالة لإضافة زر جديد في واجهة SDM
    function addNewButton() {
        try {
            const chatContainer = document.getElementById('chat-container');
            if (!chatContainer) return;

            const newButton = document.createElement('button');
            newButton.id = 'sdm-new-feature-button';
            newButton.textContent = 'ميزة جديدة';
            newButton.style.margin = '5px';
            newButton.style.padding = '5px 10px';

            newButton.addEventListener('click', function() {
                alert('تم تفعيل الميزة الجديدة!');
                // هنا يمكنك إضافة الكود الخاص بالميزة الجديدة
            });

            chatContainer.appendChild(newButton);
        } catch (e) {
            console.error('Error in sdm-addon-25:', e);
        }
    }

    // تفعيل الميزة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', addNewButton);

    // تصدير الدالة إذا كان مطلوباً
    window.sdmAddon25 = {
        addNewButton: addNewButton
    };
})();