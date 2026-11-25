/**
 * local-posts-store.js
 * نظام تخزين المنشورات المحلي (localStorage)
 * الوظيفة: حفظ، قراءة، تحديث، حذف المنشورات فوراً بدون انتظار الشبكة.
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'sudanMarketPosts';

    // جلب جميع المنشورات
    function getAllPosts() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('Error getting all posts:', error);
            return [];
        }
    }

    // حفظ منشور (جديد أو تحديث)
    function savePost(post) {
        if (!post || typeof post !== 'object' || !post.id) {
            console.error('Invalid post object');
            return false;
        }

        try {
            const posts = getAllPosts();
            const existingIndex = posts.findIndex(p => p.id === post.id);

            if (existingIndex !== -1) {
                posts[existingIndex] = post;
            } else {
                posts.push(post);
            }

            localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
            return true;
        } catch (error) {
            console.error('Error saving post:', error);
            return false;
        }
    }

    // حذف منشور
    function deletePost(postId) {
        try {
            const posts = getAllPosts();
            const updatedPosts = posts.filter(post => post.id !== postId);

            if (posts.length !== updatedPosts.length) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedPosts));
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error deleting post:', error);
            return false;
        }
    }

    // تصدير الواجهة العامة
    window.localPostsStore = {
        getAllPosts,
        savePost,
        deletePost
    };
})();