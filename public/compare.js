(function() {
    'use strict';

    async function updateCompare() {
        try {
            const compareData = await window.api.fetchCompareData();
            const compareVisualizer = new window.plugins.CompareVisualizer();
            compareVisualizer.render(compareData);
        } catch (error) {
            handleError(error);
        }
    }

    function handleError(error) {
        console.error('خطأ في المقارنة:', error);
        const errorElement = document.getElementById('compareError');
        if (errorElement) {
            errorElement.textContent = `خطأ: ${error.message}`;
        }
    }

    window.compare = {
        updateCompare
    };
})();