// public/sdm/sdm-module-78.js
(function() {
    'use strict';

    // دالة لجلب عدد المنشورات المحفوظة محلياً
    function getLocalPostsCount() {
        try {
            const posts = JSON.parse(localStorage.getItem('sudanMarketPosts')) || [];
            return posts.length;
        } catch (e) {
            console.error('Error getting local posts count:', e);
            return 0;
        }
    }

    // تحديث عرض عدد المنشورات في الواجهة
    function updatePostsCountDisplay() {
        const countElement = document.getElementById('local-posts-count');
        if (countElement) {
            const count = getLocalPostsCount();
            countElement.textContent = `عدد المنشورات المحفوظة: ${count}`;
        }
    }

    // تنفيذ عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            // إنشاء عنصر عرض عدد المنشورات إذا لم يكن موجوداً
            let countElement = document.getElementById('local-posts-count');
            if (!countElement) {
                countElement = document.createElement('div');
                countElement.id = 'local-posts-count';
                countElement.className = 'local-posts-count';
                document.body.appendChild(countElement);
            }

            // تحديث العرض
            updatePostsCountDisplay();

            // تحديث العرض عند تغيير localStorage
            window.addEventListener('storage', updatePostsCountDisplay);
        } catch (e) {
            console.error('Error in sdm-module-78:', e);
        }
    });
})();