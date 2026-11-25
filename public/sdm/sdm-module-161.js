// public/sdm/sdm-module-161.js
(function() {
    'use strict';

    try {
        // دالة للحصول على عدد المنشورات المحفوظة
        function getSavedPostsCount() {
            const posts = localStorage.getItem('sudanMarketPosts');
            return posts ? JSON.parse(posts).length : 0;
        }

        // دالة لعرض العدد في الواجهة
        function displayPostsCount() {
            const countElement = document.getElementById('sdm-posts-count');
            if (countElement) {
                const count = getSavedPostsCount();
                safeSetTextContent(countElement, `Saved posts: ${count}`);
            }
        }

        // تنفيذ الوظيفة عند تحميل الصفحة
        document.addEventListener('DOMContentLoaded', displayPostsCount);
    } catch (e) {
        console.error('Error in SDM Module 161:', e);
    }
})();