(function() {
    'use strict';

    // دالة التحقق من صحة التاريخ
    function isValidDate(date) {
        return date instanceof Date && !isNaN(date);
    }

    // دالة معالجة الأخطاء
    function handleError(error) {
        console.error('خطأ:', error);
        window.liveUI.showError(error.message);
    }

    // دالة تحديث الحالة
    function updateStatus(status) {
        window.liveUI.updateStatus(status);
    }

    // دالة تحديث المنشورات
    function updatePosts(posts) {
        window.liveUI.renderPosts(posts);
    }

    // دالة الاتصال بالـ API
    async function fetchPosts() {
        try {
            updateStatus('جارٍ جلب المنشورات...');
            const posts = await window.api.fetchPosts();
            updatePosts(posts);
            updateStatus('تم تحديث المنشورات');
        } catch (error) {
            handleError(error);
        }
    }

    // دالة إنشاء منشور جديد
    async function createPost(post) {
        try {
            updateStatus('جارٍ إنشاء المنشور...');
            const newPost = await window.api.createPost(post);
            updateStatus('تم إنشاء المنشور بنجاح');
            return newPost;
        } catch (error) {
            handleError(error);
            throw error;
        }
    }

    // دالة تهيئة الوحدة
    function init() {
        fetchPosts();
        setInterval(fetchPosts, 30000); // تحديث كل 30 ثانية
    }

    // تصدير المنطق
    window.liveLogic = {
        init,
        createPost
    };

    // تهيئة الوحدة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', init);
})();