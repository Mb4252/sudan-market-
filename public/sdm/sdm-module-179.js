// public/sdm/sdm-module-179.js
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
            visitCount = parseInt(visitCount, 10) + 1;

            // تحديث localStorage
            localStorage.setItem('sdmVisitCount', visitCount);

            // تحديث الواجهة
            if (window.safeSetTextContent) {
                window.safeSetTextContent(visitCountElement, `Visit count: ${visitCount}`);
            } else {
                visitCountElement.textContent = `Visit count: ${visitCount}`;
            }
        } catch (error) {
            console.error('Error in updateVisitCount:', error);
        }
    }

    // تنفيذ الدالة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateVisitCount);
    } else {
        updateVisitCount();
    }
})();