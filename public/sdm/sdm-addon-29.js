// sdm-addon-29.js
(function() {
    'use strict';

    // دالة لجلب الوقت الحالي بشكل منظم
    function getCurrentTime() {
        const now = new Date();
        return safeFormatDate(now, 'ar-EG', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    // دالة لتحديث وقت آخر تحديث
    function updateLastUpdateTime() {
        try {
            const lastUpdateElement = document.getElementById('last-update-time');
            if (lastUpdateElement) {
                const currentTime = getCurrentTime();
                safeSetTextContent(lastUpdateElement, `آخر تحديث: ${currentTime}`);
            }
        } catch (e) {
            console.error('Error updating last update time:', e);
        }
    }

    // تحديث الوقت كل ثانية
    setInterval(updateLastUpdateTime, 1000);

    // تحديث الوقت عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', updateLastUpdateTime);

    // إظهار رسالة في وحدة التحكم عند التفعيل
    console.log('SDM Addon #29: ميزة عرض الوقت الحالي مفعلة');
})();