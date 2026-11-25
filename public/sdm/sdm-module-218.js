// public/sdm/sdm-module-218.js
(function() {
    'use strict';

    // Constants
    const DATE_FORMAT_KEY = 'sdmDateFormat';
    const DEFAULT_FORMAT = 'long';
    const DATE_ELEMENT_ID = 'sdm-current-date';

    // Initialize the module
    function init() {
        try {
            // Check if required DOM elements exist
            if (!document.getElementById(DATE_ELEMENT_ID)) {
                console.warn(`Element with ID ${DATE_ELEMENT_ID} not found`);
                return;
            }

            // Get user's preferred date format from localStorage
            const format = localStorage.getItem(DATE_FORMAT_KEY) || DEFAULT_FORMAT;

            // Display the current date
            displayCurrentDate(format);

        } catch (error) {
            console.error('Error in SDM Module 218:', error);
        }
    }

    // Display the current date in the specified format
    function displayCurrentDate(format) {
        const dateElement = document.getElementById(DATE_ELEMENT_ID);
        if (!dateElement) return;

        const now = new Date();
        let formattedDate;

        switch (format) {
            case 'short':
                formattedDate = safeFormatDate(now, 'en-US', { dateStyle: 'short' });
                break;
            case 'long':
                formattedDate = safeFormatDate(now, 'en-US', { dateStyle: 'long' });
                break;
            case 'full':
                formattedDate = safeFormatDate(now, 'en-US', { dateStyle: 'full' });
                break;
            default:
                formattedDate = safeFormatDate(now, 'en-US', { dateStyle: 'long' });
        }

        safeSetTextContent(dateElement, formattedDate);
    }

    // Initialize the module when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();