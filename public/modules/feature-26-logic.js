(function() {
    'use strict';

    async function processFeature26Data() {
        try {
            const data = await window.api.fetchFeature26Data();
            window.feature26UI.update(data);
            return data;
        } catch (error) {
            console.error('Error in feature 26 processing:', error);
            window.feature26UI.update('حدث خطأ أثناء المعالجة');
            throw error;
        }
    }

    window.feature26Logic = {
        process: processFeature26Data
    };
})();