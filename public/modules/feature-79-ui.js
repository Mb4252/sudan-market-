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

    function safeAddEventListener(elementId, eventType, callback) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener(eventType, callback);
        } else {
            console.warn(`Element with ID ${elementId} not found for event listener`);
        }
    }

    window.feature79UI = {
        safeSetTextContent,
        safeAddEventListener
    };
})();