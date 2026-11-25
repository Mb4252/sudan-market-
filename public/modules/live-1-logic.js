// public/modules/live-1-logic.js
(function() {
    'use strict';

    // دالة معالجة المنشورات الواردة
    function handleIncomingPost(post) {
        if (!window.store.isValidDate(new Date(post.timestamp))) {
            window.liveUI.displayError('تاريخ المنشور غير صالح');
            return;
        }

        window.store.addPost(post);
        window.liveUI.updateStatus('تم تحديث المنشورات');
    }

    // دالة تحديث الواجهة
    function updateUI() {
        const posts = window.store.getPosts();
        window.liveUI.renderPosts(posts);
    }

    // تهيئة المنطق
    document.addEventListener('DOMContentLoaded', function() {
        // تحديث الواجهة عند تحديث المخزن
        window.store.on('storeUpdated', updateUI);

        // معالجة المنشورات الواردة من البث
        window.addEventListener('postReceived', function(e) {
            handleIncomingPost(e.detail);
        });
    });

    // تصدير الوظائف
    window.liveLogic = {
        handleIncomingPost
    };
})();