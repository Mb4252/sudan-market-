// public/sdm/sdm-module-168.js
(function() {
    'use strict';

    // دالة لتحميل البيانات من localStorage
    function loadDataFromStorage() {
        try {
            const data = localStorage.getItem('sdmModule168Data');
            return data ? JSON.parse(data) : { lastVisit: null, visitCount: 0 };
        } catch (e) {
            console.error('Error loading data from storage:', e);
            return { lastVisit: null, visitCount: 0 };
        }
    }

    // دالة لحفظ البيانات في localStorage
    function saveDataToStorage(data) {
        try {
            localStorage.setItem('sdmModule168Data', JSON.stringify(data));
        } catch (e) {
            console.error('Error saving data to storage:', e);
        }
    }

    // دالة لتحديث معلومات الزيارة
    function updateVisitInfo() {
        try {
            const data = loadDataFromStorage();
            const now = new Date();

            // تحديث بيانات الزيارة
            data.lastVisit = now.toISOString();
            data.visitCount += 1;

            // حفظ البيانات المحدثة
            saveDataToStorage(data);

            // عرض المعلومات في الواجهة
            const visitInfoElement = document.getElementById('sdm-visit-info');
            if (visitInfoElement) {
                const lastVisit = new Date(data.lastVisit);
                if (isValidDate(lastVisit)) {
                    visitInfoElement.textContent = `Last visit: ${safeFormatDate(lastVisit)} | Visits: ${data.visitCount}`;
                }
            }
        } catch (e) {
            console.error('Error updating visit info:', e);
        }
    }

    // تهيئة التوسعة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', updateVisitInfo);

    // تحديث المعلومات عند كل زيارة
    window.addEventListener('focus', updateVisitInfo);

    // ربط الدالة مع النافذة العالمية
    window.sdmModule168 = {
        updateVisitInfo: updateVisitInfo
    };
})();