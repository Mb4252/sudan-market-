// public/modules/live-1-logic.js
(function() {
    'use strict';

    // دالة للتحقق من صحة التاريخ
    function isValidDate(date) {
        return date instanceof Date && !isNaN(date);
    }

    // دالة لمعالجة البث
    function handleBroadcast(post) {
        if (!isValidDate(new Date(post.timestamp))) {
            window.liveUI.handleUIError(new Error('تاريخ غير صالح'));
            return;
        }

        // تخزين المنشور في localStorage
        const posts = JSON.parse(localStorage.getItem('posts')) || [];
        posts.push(post);
        localStorage.setItem('posts', JSON.stringify(posts));

        // تحديث الواجهة
        window.liveUI.updateStatus('تم نشر المنشور بنجاح');
        window.liveUI.renderPosts(posts);
    }

    // دالة لجلب المنشورات من localStorage
    function loadPosts() {
        const posts = JSON.parse(localStorage.getItem('posts')) || [];
        window.liveUI.renderPosts(posts);
    }

    // تصدير الوظائف
    window.liveLogic = {
        handleBroadcast,
        loadPosts
    };

    // تحميل المنشورات عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', loadPosts);
})();