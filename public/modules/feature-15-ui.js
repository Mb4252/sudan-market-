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

    window.feature15UI = {
        safeSetTextContent
    };
})();