// public/sdm/sdm-module-169.js
(function() {
    'use strict';

    // Module configuration
    const MODULE_NAME = 'SDM Module #169';
    const STORAGE_KEY = 'sdmModule169Data';
    const UI_ELEMENT_ID = 'sdm-module-169-ui';

    // Initialize the module
    function init() {
        try {
            // Check if DOM is ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', setupUI);
            } else {
                setupUI();
            }
        } catch (error) {
            console.error(`${MODULE_NAME} initialization error:`, error);
        }
    }

    // Set up the UI elements
    function setupUI() {
        try {
            // Create UI container if it doesn't exist
            let uiContainer = document.getElementById(UI_ELEMENT_ID);
            if (!uiContainer) {
                uiContainer = document.createElement('div');
                uiContainer.id = UI_ELEMENT_ID;
                uiContainer.style.padding = '10px';
                uiContainer.style.margin = '10px 0';
                uiContainer.style.border = '1px solid #ddd';
                uiContainer.style.borderRadius = '4px';

                // Add to market shell if available
                const marketShell = document.getElementById('market-shell');
                if (marketShell) {
                    marketShell.appendChild(uiContainer);
                } else {
                    document.body.appendChild(uiContainer);
                }
            }

            // Add module title
            const titleElement = document.createElement('h3');
            titleElement.textContent = MODULE_NAME;
            uiContainer.appendChild(titleElement);

            // Add data display element
            const dataElement = document.createElement('div');
            dataElement.id = `${UI_ELEMENT_ID}-data`;
            uiContainer.appendChild(dataElement);

            // Load and display data
            displayData();
        } catch (error) {
            console.error(`${MODULE_NAME} UI setup error:`, error);
        }
    }

    // Display stored data
    function displayData() {
        try {
            const dataElement = document.getElementById(`${UI_ELEMENT_ID}-data`);
            if (!dataElement) return;

            const storedData = localStorage.getItem(STORAGE_KEY);
            const data = storedData ? JSON.parse(storedData) : {
                lastUpdated: new Date().toISOString(),
                message: 'No data available'
            };

            // Format the date safely
            const lastUpdatedDate = new Date(data.lastUpdated);
            const formattedDate = isValidDate(lastUpdatedDate)
                ? safeFormatDate(lastUpdatedDate, 'ar-SD', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                : 'Invalid date';

            // Update the UI
            safeSetTextContent(dataElement, `\n${data.message}\n\nLast updated: ${formattedDate}`);
        } catch (error) {
            console.error(`${MODULE_NAME} data display error:`, error);
        }
    }

    // Initialize the module when loaded
    init();

    // Expose module functions globally if needed
    window.sdmModule169 = {
        displayData
    };
})();