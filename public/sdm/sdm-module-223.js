// public/sdm/sdm-module-223.js
(function() {
    'use strict';

    // Module configuration
    const MODULE_NAME = 'SDM Module #223';
    const STORAGE_KEY = 'sdmModule223Data';
    const DOM_ELEMENT_ID = 'sdm-module-223-display';

    // Initialize the module
    function initModule() {
        try {
            // Check if required DOM element exists
            const displayElement = document.getElementById(DOM_ELEMENT_ID);
            if (!displayElement) {
                console.warn(`DOM element with ID '${DOM_ELEMENT_ID}' not found.`);
                return;
            }

            // Get or initialize module data from localStorage
            let moduleData = getModuleData();

            // Update display with module data
            updateDisplay(displayElement, moduleData);

            // Set up event listeners if needed
            setupEventListeners();

            console.log(`${MODULE_NAME} initialized successfully.`);
        } catch (error) {
            console.error(`${MODULE_NAME} initialization failed:`, error);
        }
    }

    // Get module data from localStorage
    function getModuleData() {
        try {
            const storedData = localStorage.getItem(STORAGE_KEY);
            if (storedData) {
                return JSON.parse(storedData);
            }

            // Initialize default data if none exists
            const defaultData = {
                lastAccessed: new Date().toISOString(),
                accessCount: 1
            };

            localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultData));
            return defaultData;
        } catch (error) {
            console.error('Error getting module data:', error);
            return {
                lastAccessed: new Date().toISOString(),
                accessCount: 1
            };
        }
    }

    // Update display with module data
    function updateDisplay(element, data) {
        try {
            if (window.safeSetTextContent) {
                window.safeSetTextContent(element, `Module accessed ${data.accessCount} times. Last accessed: ${window.safeFormatDate(new Date(data.lastAccessed))}`);
            } else {
                element.textContent = `Module accessed ${data.accessCount} times. Last accessed: ${new Date(data.lastAccessed).toLocaleString()}`;
            }
        } catch (error) {
            console.error('Error updating display:', error);
        }
    }

    // Set up event listeners
    function setupEventListeners() {
        // Example: Add click listener to update access count
        document.addEventListener('click', function() {
            try {
                const data = getModuleData();
                data.accessCount++;
                data.lastAccessed = new Date().toISOString();
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

                const displayElement = document.getElementById(DOM_ELEMENT_ID);
                if (displayElement) {
                    updateDisplay(displayElement, data);
                }
            } catch (error) {
                console.error('Error updating access count:', error);
            }
        });
    }

    // Initialize the module when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }

    // Expose module functions if needed
    window.sdmModule223 = {
        init: initModule,
        getData: getModuleData
    };

})();