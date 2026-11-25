// public/sdm/sdm-module-190.js
(function() {
    'use strict';

    // دالة لحفظ وتحميل حالة التمرير
    function manageScrollPosition() {
        const SCROLL_KEY = 'sdmScrollPosition';
        const scrollElement = document.documentElement || document.body;

        // تحميل حالة التمرير عند التحميل
        try {
            const savedPosition = localStorage.getItem(SCROLL_KEY);
            if (savedPosition) {
                scrollElement.scrollTop = parseInt(savedPosition, 10);
            }
        } catch (e) {
            console.error('Error loading scroll position:', e);
        }

        // حفظ حالة التمرير عند التمرير
        scrollElement.addEventListener('scroll', function() {
            try {
                localStorage.setItem(SCROLL_KEY, scrollElement.scrollTop.toString());
            } catch (e) {
                console.error('Error saving scroll position:', e);
            }
        });
    }

    // تنفيذ الوظيفة عند تحميل الصفحة
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        manageScrollPosition();
    } else {
        document.addEventListener('DOMContentLoaded', manageScrollPosition);
    }
})();