// public/sdm/sdm-addon-28.js
(function() {
    'use strict';

    // دالة لجلب تاريخ آخر تحديث
    function getLastUpdateDate() {
        try {
            const lastUpdate = localStorage.getItem('sdmLastUpdate');
            if (lastUpdate) {
                return new Date(parseInt(lastUpdate));
            }
            return null;
        } catch (e) {
            console.error('Error getting last update date:', e);
            return null;
        }
    }

    // دالة لتحديث تاريخ آخر تحديث
    function updateLastUpdateDate() {
        try {
            localStorage.setItem('sdmLastUpdate', Date.now().toString());
        } catch (e) {
            console.error('Error updating last update date:', e);
        }
    }

    // دالة لعرض تاريخ التحديث في واجهة المستخدم
    function displayLastUpdate() {
        try {
            const lastUpdate = getLastUpdateDate();
            const updateElement = document.getElementById('sdm-last-update');

            if (updateElement && lastUpdate) {
                safeSetTextContent(updateElement, `آخر تحديث: ${safeFormatDate(lastUpdate, 'ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`);
            }
        } catch (e) {
            console.error('Error displaying last update:', e);
        }
    }

    // تحديث التاريخ عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            updateLastUpdateDate();
            displayLastUpdate();

            // تحديث التاريخ كل 30 ثانية
            setInterval(displayLastUpdate, 30000);
        } catch (e) {
            console.error('Error in DOMContentLoaded event:', e);
        }
    });

    // تحديث التاريخ عند استلام رسالة جديدة
    if (window.sdmEngine && window.sdmEngine.onMessageReceived) {
        window.sdmEngine.onMessageReceived(function() {
            try {
                updateLastUpdateDate();
                displayLastUpdate();
            } catch (e) {
                console.error('Error updating on message received:', e);
            }
        });
    }

    // تصدير الدوال
    window.sdmAddon28 = {
        getLastUpdateDate,
        updateLastUpdateDate,
        displayLastUpdate
    };
})();