(function() {
    'use strict';

    function validateElementExistence(elementId) {
        return !!document.getElementById(elementId);
    }

    window.feature38Logic = {
        validateElementExistence
    };
})();