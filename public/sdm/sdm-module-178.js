// public/sdm/sdm-module-178.js
(function() {
    'use strict';

    // دالة لتخزين وتحديث عدد الزيارات
    function updateVisitCount() {
        try {
            // التحقق من وجود عنصر DOM
            const visitCountElement = document.getElementById('visit-count');
            if (!visitCountElement) return;

            // جلب عدد الزيارات من localStorage
            let visitCount = localStorage.getItem('sdmVisitCount') || 0;
            visitCount = parseInt(visitCount) + 1;

            // تحديث localStorage
            localStorage.setItem('sdmVisitCount', visitCount);

            // تحديث الواجهة
            visitCountElement.textContent = `Visit count: ${visitCount}`;
        } catch (e) {
            console.error('Error in updateVisitCount:', e);
        }
    }

    // تنفيذ عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', updateVisitCount);

    // تصدير الدالة للتواصل مع الوحدات الأخرى
    window.sdmUpdateVisitCount = updateVisitCount;
})();