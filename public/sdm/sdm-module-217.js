// public/sdm/sdm-module-217.js
(function() {
    'use strict';

    // Module constants
    const MODULE_NAME = 'SDM Module #217';
    const STORAGE_KEY = 'sdmModule217Data';
    const UI_ELEMENT_ID = 'sdm-module-217-ui';

    // Initialize the module
    function initModule() {
        try {
            // Check if required DOM elements exist
            if (!document.getElementById('sdm-chat')) {
                console.warn('SDM chat UI not found, module cannot initialize');
                return;
            }

            // Create UI element if it doesn't exist
            let uiElement = document.getElementById(UI_ELEMENT_ID);
            if (!uiElement) {
                uiElement = document.createElement('div');
                uiElement.id = UI_ELEMENT_ID;
                uiElement.style.margin = '10px 0';
                document.getElementById('sdm-chat').appendChild(uiElement);
            }

            // Load and display module data
            loadAndDisplayData();

            // Set up event listeners
            setupEventListeners();

            console.log(`${MODULE_NAME} initialized successfully`);
        } catch (error) {
            console.error(`${MODULE_NAME} initialization failed:`, error);
        }
    }

    // Load data from localStorage and display it
    function loadAndDisplayData() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            const uiElement = document.getElementById(UI_ELEMENT_ID);

            if (uiElement) {
                if (data) {
                    uiElement.textContent = `Module Data: ${data}`;
                } else {
                    uiElement.textContent = 'No data available. Click the button to generate data.';
                }
            }
        } catch (error) {
            console.error(`${MODULE_NAME} data loading failed:`, error);
        }
    }

    // Set up event listeners
    function setupEventListeners() {
        try {
            const uiElement = document.getElementById(UI_ELEMENT_ID);
            if (uiElement) {
                uiElement.addEventListener('click', () => {
                    const newData = `Data generated at ${new Date().toLocaleTimeString()}`;
                    localStorage.setItem(STORAGE_KEY, newData);
                    loadAndDisplayData();
                });
            }
        } catch (error) {
            console.error(`${MODULE_NAME} event listener setup failed:`, error);
        }
    }

    // Initialize the module when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }

})();