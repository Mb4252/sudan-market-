// public/sdm/sdm-module-163.js
(function() {
    'use strict';

    // دالة لتخزين وتحديث عدد الزيارات
    function updateVisitCount() {
        try {
            // التحقق من وجود عنصر DOM
            const visitCountElement = document.getElementById('visit-count');
            if (!visitCountElement) {
                console.warn('Visit count element not found');
                return;
            }

            // جلب عدد الزيارات من localStorage
            let visitCount = localStorage.getItem('sdmVisitCount');

            // تهيئة إذا لم يكن موجوداً
            if (!visitCount) {
                visitCount = 0;
            } else {
                visitCount = parseInt(visitCount, 10);
            }

            // زيادة عدد الزيارات
            visitCount++;

            // حفظ القيمة الجديدة في localStorage
            localStorage.setItem('sdmVisitCount', visitCount.toString());

            // تحديث عنصر DOM
            if (window.safeSetTextContent) {
                window.safeSetTextContent(visitCountElement, `You've visited ${visitCount} times`);
            } else {
                visitCountElement.textContent = `You've visited ${visitCount} times`;
            }
        } catch (error) {
            console.error('Error in updateVisitCount:', error);
        }
    }

    // تنفيذ الدالة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', updateVisitCount);

    // تصدير الدالة إذا كان مطلوباً
    window.sdmUpdateVisitCount = updateVisitCount;
})();