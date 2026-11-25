(function() {
    'use strict';

    function renderErrorMessage(message) {
        const errorElement = document.getElementById('error-message');
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
        }
    }

    function clearErrorMessage() {
        const errorElement = document.getElementById('error-message');
        if (errorElement) {
            errorElement.textContent = '';
            errorElement.style.display = 'none';
        }
    }

    function initErrorDisplay() {
        const errorContainer = document.createElement('div');
        errorContainer.id = 'error-message';
        errorContainer.style.display = 'none';
        errorContainer.style.color = 'red';
        errorContainer.style.margin = '10px 0';
        errorContainer.style.padding = '10px';
        errorContainer.style.border = '1px solid red';
        errorContainer.style.borderRadius = '4px';

        const mainContainer = document.querySelector('main') || document.body;
        mainContainer.insertBefore(errorContainer, mainContainer.firstChild);
    }

    window.feature28UI = {
        renderErrorMessage,
        clearErrorMessage,
        initErrorDisplay
    };
})();