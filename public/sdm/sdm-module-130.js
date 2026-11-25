// sdm-module-130.js
(function() {
    'use strict';

    // دالة لجلب عدد المنشورات المحفوظة
    function getSavedPostsCount() {
        try {
            const STORAGE_KEY = 'sudanMarketPosts';
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data).length : 0;
        } catch (error) {
            console.error('Error getting saved posts count:', error);
            return 0;
        }
    }

    // دالة لعرض العدد في الواجهة
    function displaySavedPostsCount() {
        try {
            const count = getSavedPostsCount();
            const element = document.getElementById('saved-posts-count');
            if (element) {
                element.textContent = `عدد المنشورات المحفوظة: ${count}`;
            }
        } catch (error) {
            console.error('Error displaying saved posts count:', error);
        }
    }

    // تنفيذ عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', displaySavedPostsCount);

    // تحديث العدد عند تغيير localStorage
    window.addEventListener('storage', displaySavedPostsCount);
})();