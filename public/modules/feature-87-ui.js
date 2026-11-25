(function() {
    'use strict';

    // تأكد من وجود العنصر قبل إسناد القيمة
    function safeSetTextContent(selector, text) {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = text;
        } else {
            console.warn(`Element ${selector} not found`);
        }
    }

    // تحديث واجهة المستخدم
    function updateUI(data) {
        safeSetTextContent('#feature-87-status', data.status || 'جاهز');
        safeSetTextContent('#feature-87-data', JSON.stringify(data, null, 2));
    }

    // تهيئة الميزة
    function init() {
        console.log('Feature 87 UI initialized');
        window.feature87UI = {
            updateUI
        };
    }

    init();
})();