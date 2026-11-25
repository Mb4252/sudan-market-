(function() {
    'use strict';

    function handleError(error) {
        console.error('Error:', error);
        window.feature34UI.updateStatus(`Error: ${error.message}`);
    }

    window.feature34Logic = {
        handleError
    };
})();