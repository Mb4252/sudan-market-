// public/sdm/sdm-module-175.js
(function() {
    'use strict';

    // دالة عرض عدد المنشورات المحفوظة
    function displaySavedPostsCount() {
        try {
            // التحقق من وجود عنصر DOM
            const countElement = document.getElementById('saved-posts-count');
            if (!countElement) {
                console.warn('Element #saved-posts-count not found');
                return;
            }

            // جلب المنشورات من localStorage
            const posts = JSON.parse(localStorage.getItem('sudanMarketPosts') || '[]');

            // عرض العدد
            countElement.textContent = posts.length;
        } catch (error) {
            console.error('Error displaying saved posts count:', error);
        }
    }

    // تنفيذ الوظيفة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', displaySavedPostsCount);
})();