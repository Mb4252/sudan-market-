// feature-29-ui.js
function initializeErrorHandlingUI() {
    const errorContainer = document.createElement('div');
    errorContainer.id = 'error-container';
    errorContainer.style.position = 'fixed';
    errorContainer.style.bottom = '20px';
    errorContainer.style.right = '20px';
    errorContainer.style.padding = '10px';
    errorContainer.style.backgroundColor = '#ffdddd';
    errorContainer.style.border = '1px solid #ff0000';
    errorContainer.style.borderRadius = '5px';
    errorContainer.style.display = 'none';
    document.body.appendChild(errorContainer);
}

window.showError = function(message) {
    const errorContainer = document.getElementById('error-container');
    if (errorContainer) {
        errorContainer.textContent = message;
        errorContainer.style.display = 'block';
        setTimeout(() => {
            errorContainer.style.display = 'none';
        }, 5000);
    }
};

// Initialize UI when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeErrorHandlingUI);
} else {
    initializeErrorHandlingUI();
}