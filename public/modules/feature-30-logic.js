(function() {
    'use strict';

    let analysisData = null;

    function initFeature30Logic() {
        // تهيئة منطق الميزة 30
        loadAnalysisData();
    }

    function loadAnalysisData() {
        // تحميل بيانات التحليل من الخادم
        window.api.fetchAnalysisData()
            .then(data => {
                analysisData = data;
                window.feature30UI.update(data);
            })
            .catch(error => {
                console.error('Error loading analysis data:', error);
                window.feature30UI.update(null);
            });
    }

    function refreshAnalysis() {
        // تحديث التحليل
        loadAnalysisData();
    }

    // تصدير الوظائف العامة
    window.feature30Logic = {
        init: initFeature30Logic,
        refresh: refreshAnalysis
    };
})();