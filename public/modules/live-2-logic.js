(function() {
    'use strict';

    async function fetchAndUpdateLiveData() {
        try {
            const posts = await window.api.fetchPosts();
            window.liveUI.updateLiveUI(posts);
        } catch (error) {
            console.error('خطأ في تحديث البيانات الحية:', error);
        }
    }

    async function fetchAndUpdateCompareData() {
        try {
            const compareData = await window.api.fetchCompareData();
            window.liveUI.updateCompareUI(compareData);
        } catch (error) {
            console.error('خطأ في تحديث بيانات المقارنة:', error);
        }
    }

    window.liveLogic = {
        fetchAndUpdateLiveData,
        fetchAndUpdateCompareData
    };

    // تحديث البيانات كل 30 ثانية
    setInterval(fetchAndUpdateLiveData, 30000);
    setInterval(fetchAndUpdateCompareData, 30000);

    // تحديث البيانات عند التحميل الأول
    document.addEventListener('DOMContentLoaded', function() {
        fetchAndUpdateLiveData();
        fetchAndUpdateCompareData();
    });
})();