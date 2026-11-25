// public/sdm/sdm-addon-37.js
(function() {
    'use strict';

    // دالة لتهيئة واجهة SDM
    function initSDMUI() {
        try {
            // التحقق من وجود جميع العناصر المطلوبة
            const requiredElements = [
                { id: 'sdm-chat', type: 'div' },
                { id: 'user-identity', type: 'input' },
                { id: 'message-input', type: 'input' },
                { id: 'send-button', type: 'button' },
                { id: 'connection-status', type: 'div' }
            ];

            let allElementsExist = true;

            requiredElements.forEach(element => {
                const el = document.getElementById(element.id);
                if (!el || el.tagName.toLowerCase() !== element.type) {
                    console.error(`Missing or incorrect element: ${element.id}`);
                    allElementsExist = false;
                }
            });

            if (!allElementsExist) {
                throw new Error('Missing required UI elements');
            }

            // تهيئة واجهة SDM
            document.querySelector('.header h1').textContent = 'سوق السودان - واجهة SDM';
            document.getElementById('user-identity').placeholder = 'أدخل هويةك للدردشة';
            document.getElementById('message-input').placeholder = 'اكتب رسالتك';
            document.getElementById('send-button').textContent = 'إرسال';
            document.getElementById('connection-status').textContent = 'غير متصل';
        } catch (error) {
            console.error('Error initializing SDM UI:', error);
        }
    }

    // تهيئة الواجهة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', initSDMUI);

    // تصدير الدوال المطلوبة
    window.initSDMUI = initSDMUI;
})();