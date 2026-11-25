(function() {
    'use strict';

    function validateElementExistence(elementId) {
        return !!document.getElementById(elementId);
    }

    window.feature25Logic = {
        validateElementExistence
    };
})();