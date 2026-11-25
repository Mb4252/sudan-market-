// public/modules/feature-90-ui.js
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

    // تصدير الوظائف العامة
    window.feature90UI = {
        safeSetTextContent
    };
})();