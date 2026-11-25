(function() {
    'use strict';

    // التحقق من وجود العنصر قبل الإسناد
    function safeSetTextContent(selector, text) {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = text;
        } else {
            console.warn(`Element not found: ${selector}`);
        }
    }

    // مثال على استخدام الدالة
    function updateUI(data) {
        safeSetTextContent('#feature-85-status', data.status);
        safeSetTextContent('#feature-85-data', JSON.stringify(data));
    }

    window.feature85UI = {
        updateUI
    };
})();