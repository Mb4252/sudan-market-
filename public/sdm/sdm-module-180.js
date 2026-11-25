// public/sdm/sdm-module-180.js
(function() {
    'use strict';

    // Module configuration
    const MODULE_NAME = 'SDM Module #180';
    const STORAGE_KEY = 'sdmModule180Data';
    const UI_ELEMENT_ID = 'sdm-module-180-ui';

    // Initialize the module
    function initModule() {
        try {
            // Check if DOM is ready
            if (document.readyState !== 'loading') {
                setupModule();
            } else {
                document.addEventListener('DOMContentLoaded', setupModule);
            }
        } catch (error) {
            console.error(`Error initializing ${MODULE_NAME}:`, error);
        }
    }

    // Set up the module UI and functionality
    function setupModule() {
        try {
            // Create UI element if it doesn't exist
            let uiElement = document.getElementById(UI_ELEMENT_ID);
            if (!uiElement) {
                uiElement = document.createElement('div');
                uiElement.id = UI_ELEMENT_ID;
                uiElement.className = 'sdm-module';
                document.body.appendChild(uiElement);
            }

            // Add module content
            uiElement.innerHTML = `
                <div class="module-header">${MODULE_NAME}</div>
                <div class="module-content">
                    <p>This is a small SDM module that demonstrates basic functionality.</p>
                    <button id="sdm-module-180-btn">Click Me</button>
                    <div id="sdm-module-180-output"></div>
                </div>
            `;

            // Add event listener
            const button = document.getElementById('sdm-module-180-btn');
            if (button) {
                button.addEventListener('click', handleButtonClick);
            }
        } catch (error) {
            console.error(`Error setting up ${MODULE_NAME}:`, error);
        }
    }

    // Handle button click
    function handleButtonClick() {
        try {
            const outputElement = document.getElementById('sdm-module-180-output');
            if (outputElement) {
                const timestamp = new Date().toLocaleString();
                outputElement.textContent = `Button clicked at: ${timestamp}`;
                
                // Save to localStorage
                const data = {
                    lastClick: timestamp,
                    clickCount: (localStorage.getItem(STORAGE_KEY) ? JSON.parse(localStorage.getItem(STORAGE_KEY)).clickCount : 0) + 1
                };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            }
        } catch (error) {
            console.error(`Error handling button click in ${MODULE_NAME}:`, error);
        }
    }

    // Initialize the module
    initModule();

    // Expose module functions if needed
    window.sdmModule180 = {
        init: initModule,
        getData: () => JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    };
})();