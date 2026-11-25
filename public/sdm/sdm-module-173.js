// public/sdm/sdm-module-173.js
(function() {
    'use strict';

    // دالة لتحميل البيانات من localStorage
    function loadDataFromStorage() {
        try {
            const data = localStorage.getItem('sdmModule173Data');
            return data ? JSON.parse(data) : { lastVisit: null, visitCount: 0 };
        } catch (e) {
            console.error('Error loading data from storage:', e);
            return { lastVisit: null, visitCount: 0 };
        }
    }

    // دالة لحفظ البيانات في localStorage
    function saveDataToStorage(data) {
        try {
            localStorage.setItem('sdmModule173Data', JSON.stringify(data));
        } catch (e) {
            console.error('Error saving data to storage:', e);
        }
    }

    // دالة لتحديث معلومات الزيارة
    function updateVisitInfo() {
        const data = loadDataFromStorage();
        const now = new Date();

        // تحديث معلومات الزيارة
        data.lastVisit = now.toISOString();
        data.visitCount = (data.visitCount || 0) + 1;

        // حفظ البيانات المحدثة
        saveDataToStorage(data);

        // عرض المعلومات في الواجهة
        const visitInfoElement = document.getElementById('sdm-visit-info');
        if (visitInfoElement) {
            const lastVisit = new Date(data.lastVisit);
            const formattedDate = safeFormatDate(lastVisit, 'ar-SD', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            safeSetTextContent(visitInfoElement, `\nآخر زيارة: ${formattedDate}\nعدد الزيارات: ${data.visitCount}`);
        }
    }

    // تهيئة التوسعة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            updateVisitInfo();
        } catch (e) {
            console.error('Error initializing SDM Module 173:', e);
        }
    });

    // ربط الدالة مع النافذة العالمية
    window.sdmModule173 = {
        updateVisitInfo: updateVisitInfo
    };
})();