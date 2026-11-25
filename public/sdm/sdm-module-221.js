(function() {
    'use strict';

    // إعدادات التوسعة
    const MODULE_NAME = 'SDM Module #221';
    const STORAGE_KEY = 'sdmModule221Data';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            if (!document.getElementById('sdm-chat')) {
                console.warn('SDM chat UI not found, skipping module initialization');
                return;
            }

            // تنفيذ الوظيفة الرئيسية
            mainFunction();

        } catch (error) {
            console.error(`${MODULE_NAME} initialization error:`, error);
        }
    }

    // الوظيفة الرئيسية: عرض عدد الزوار
    function mainFunction() {
        try {
            // جلب عدد الزوار من localStorage
            let visitorCount = localStorage.getItem(STORAGE_KEY) || 0;
            visitorCount = parseInt(visitorCount) + 1;

            // تحديث localStorage
            localStorage.setItem(STORAGE_KEY, visitorCount.toString());

            // عرض عدد الزوار في الواجهة
            const visitorCountElement = document.getElementById('visitor-count');
            if (visitorCountElement) {
                visitorCountElement.textContent = visitorCount;
            }

        } catch (error) {
            console.error(`${MODULE_NAME} error:`, error);
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }

})();