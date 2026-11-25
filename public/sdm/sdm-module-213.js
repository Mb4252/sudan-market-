// public/sdm/sdm-module-213.js
(function() {
    'use strict';

    try {
        // دالة للحصول على عدد المنشورات المحفوظة
        function getPostCount() {
            const posts = localStorage.getItem('sudanMarketPosts');
            return posts ? JSON.parse(posts).length : 0;
        }

        // دالة لعرض عدد المنشورات على الواجهة
        function displayPostCount() {
            const countElement = document.getElementById('post-count');
            if (countElement) {
                const count = getPostCount();
                countElement.textContent = `عدد المنشورات المحفوظة: ${count}`;
            }
        }

        // تنفيذ الوظيفة عند تحميل الصفحة
        document.addEventListener('DOMContentLoaded', displayPostCount);

        // تحديث العرض عند تغيير localStorage
        window.addEventListener('storage', displayPostCount);

    } catch (error) {
        console.error('Error in SDM Module 213:', error);
    }
})();