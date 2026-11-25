(function() {
    'use strict';

    // دالة آمنة لتحديث نص العنصر
    function safeSetTextContent(selector, text) {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = text;
        } else {
            console.warn(`[Feature32-UI] Element not found: ${selector}`);
        }
    }

    // دالة عرض حالة التوسع (Status)
    function renderExpansionStatus(status) {
        safeSetTextContent('#expansion-status', status);
    }

    // تصدير الواجهة
    window.feature32UI = {
        renderExpansionStatus
    };
})();