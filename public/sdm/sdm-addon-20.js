// public/sdm/sdm-addon-20.js
(function() {
    'use strict';

    // دالة التحقق من وجود عنصر DOM
    function elementExists(selector) {
        return document.querySelector(selector) !== null;
    }

    // دالة آمنة لإضافة ميزة جديدة
    function addNewFeature() {
        try {
            // التحقق من وجود عناصر الواجهة الأساسية
            if (!elementExists('#chat-container') || !elementExists('#message-input')) {
                console.error('Required UI elements not found');
                return;
            }

            // إضافة زر جديد في واجهة الدردشة
            const chatContainer = document.getElementById('chat-container');
            const newButton = document.createElement('button');
            newButton.id = 'sdm-feature-20';
            newButton.textContent = 'ميزة SDM #20';
            newButton.style.margin = '5px';
            newButton.style.padding = '5px 10px';
            newButton.style.backgroundColor = '#4CAF50';
            newButton.style.color = 'white';
            newButton.style.border = 'none';
            newButton.style.borderRadius = '4px';
            newButton.style.cursor = 'pointer';

            // إضافة حدث النقر
            newButton.addEventListener('click', function() {
                // تخزين البيانات في localStorage
                const currentTime = new Date();
                localStorage.setItem('sdmFeature20LastUsed', currentTime.toISOString());
                alert('تم تفعيل ميزة SDM #20!');
            });

            // إضافة الزر إلى واجهة الدردشة
            chatContainer.appendChild(newButton);
        } catch (e) {
            console.error('Error in addNewFeature:', e);
        }
    }

    // تفعيل الميزة فوراً عند تحميل الصفحة
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        addNewFeature();
    } else {
        document.addEventListener('DOMContentLoaded', addNewFeature);
    }
})();