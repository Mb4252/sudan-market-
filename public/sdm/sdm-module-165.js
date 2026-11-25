// public/sdm/sdm-module-165.js
(function() {
    'use strict';

    try {
        // دالة لجلب عدد المنشورات المحفوظة
        function getSavedPostsCount() {
            const posts = window.getAllPosts ? window.getAllPosts() : [];
            return posts.length;
        }

        // دالة لعرض عدد المنشورات في عنصر HTML
        function displaySavedPostsCount() {
            const countElement = document.getElementById('saved-posts-count');
            if (countElement) {
                const count = getSavedPostsCount();
                window.safeSetTextContent(countElement, count.toString());
            }
        }

        // تنفيذ الوظيفة عند تحميل الصفحة
        document.addEventListener('DOMContentLoaded', displaySavedPostsCount);
    } catch (e) {
        console.error('Error in sdm-module-165:', e);
    }
})();