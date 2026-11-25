(function() {
    'use strict';

    function safeSetTextContent(elementId, text) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = text;
        } else {
            console.warn(`Element with ID ${elementId} not found`);
        }
    }

    function updateUI(data) {
        safeSetTextContent('status', data.status);
        safeSetTextContent('price', data.price);
        // أضف تحديثات أخرى هنا
    }

    window.feature88UI = {
        updateUI
    };
})();