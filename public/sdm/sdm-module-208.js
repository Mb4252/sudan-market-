// public/sdm/sdm-module-208.js
(function() {
    'use strict';

    // Module configuration
    const MODULE_NAME = 'SDM Module #208';
    const STORAGE_KEY = 'sdmModule208Data';
    const DOM_ELEMENT_ID = 'sdm-module-208-output';

    // Initialize the module
    function initModule() {
        try {
            // Check if required DOM element exists
            const outputElement = document.getElementById(DOM_ELEMENT_ID);
            if (!outputElement) {
                console.warn(`DOM element with ID '${DOM_ELEMENT_ID}' not found`);
                return;
            }

            // Get or initialize module data
            let moduleData = getModuleData();
            if (!moduleData) {
                moduleData = {
                    lastUpdated: new Date().toISOString(),
                    counter: 0
                };
                saveModuleData(moduleData);
            }

            // Update counter and display information
            moduleData.counter++;
            moduleData.lastUpdated = new Date().toISOString();
            saveModuleData(moduleData);

            // Display module information
            const displayText = `SDM Module 208 is active. Counter: ${moduleData.counter}. Last updated: ${formatDate(moduleData.lastUpdated)}`;
            safeSetTextContent(outputElement, displayText);

            console.log(`${MODULE_NAME} initialized successfully`);
        } catch (error) {
            console.error(`${MODULE_NAME} initialization failed:`, error);
        }
    }

    // Get module data from localStorage
    function getModuleData() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Error getting module data:', error);
            return null;
        }
    }

    // Save module data to localStorage
    function saveModuleData(data) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('Error saving module data:', error);
        }
    }

    // Format date for display
    function formatDate(dateString) {
        try {
            const date = new Date(dateString);
            if (!isValidDate(date)) {
                return 'Invalid Date';
            }
            return safeFormatDate(date, 'en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            console.error('Error formatting date:', error);
            return 'Invalid Date';
        }
    }

    // Initialize the module when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }

    // Expose module functions if needed
    window.sdmModule208 = {
        init: initModule,
        getData: getModuleData
    };
})();