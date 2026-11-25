(function() {
    'use strict';

    async function updateRadar() {
        try {
            const radarData = await window.api.fetchRadarData();
            const radarVisualizer = new window.plugins.RadarVisualizer();
            radarVisualizer.render(radarData);
        } catch (error) {
            handleError(error);
        }
    }

    function handleError(error) {
        console.error('خطأ في رادار الأسعار:', error);
        const errorElement = document.getElementById('radarError');
        if (errorElement) {
            errorElement.textContent = `خطأ: ${error.message}`;
        }
    }

    window.radar = {
        updateRadar
    };
})();