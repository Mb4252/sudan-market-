(function() {
    'use strict';

    function updateElementText(elementId, text) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = text;
        } else {
            console.error(`Element with ID ${elementId} not found`);
        }
    }

    // إضافة أي وظائف إضافية هنا
})();