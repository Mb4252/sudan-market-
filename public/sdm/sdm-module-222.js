// public/sdm/sdm-module-222.js
(function() {
    'use strict';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عنصر العرض المطلوب
            const postCountElement = document.getElementById('sdm-post-count');
            if (!postCountElement) {
                console.warn('Element with id "sdm-post-count" not found');
                return;
            }

            // جلب المنشورات من التخزين المحلي
            const posts = JSON.parse(localStorage.getItem('sudanMarketPosts') || '[]');

            // عرض عدد المنشورات
            safeSetTextContent(postCountElement, `عدد المنشورات المحفوظة: ${posts.length}`);

            console.log('SDM Module 222 initialized successfully');
        } catch (error) {
            console.error('Error in SDM Module 222:', error);
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }
})();