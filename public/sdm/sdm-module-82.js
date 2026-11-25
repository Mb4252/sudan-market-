// public/sdm/sdm-module-82.js
(function() {
    'use strict';

    try {
        // دالة لتخزين عدد المنشورات في localStorage
        function storePostCount() {
            const posts = window.getAllPosts ? window.getAllPosts() : [];
            const count = posts.length;
            localStorage.setItem('sdmPostCount', count.toString());

            // عرض العدد في الواجهة
            const countElement = document.getElementById('post-count');
            if (countElement) {
                countElement.textContent = `عدد المنشورات: ${count}`;
            }
        }

        // تنفيذ الدالة عند تحميل الصفحة
        document.addEventListener('DOMContentLoaded', storePostCount);

        // تحديث العدد عند إضافة منشور جديد
        if (window.addEventListener) {
            window.addEventListener('postAdded', storePostCount);
        }
    } catch (e) {
        console.error('Error in sdm-module-82:', e);
    }
})();
