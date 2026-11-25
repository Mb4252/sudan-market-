(function() {
    'use strict';

    // دالة التحقق من صحة البيانات
    function validatePost(post) {
        if (!post.author || !post.content || !post.price || !post.city || !post.timestamp) {
            throw new Error('بيانات المنشور غير كاملة');
        }
        if (typeof post.price !== 'number' || post.price <= 0) {
            throw new Error('السعر يجب أن يكون رقم موجب');
        }
        if (!window.store.isValidDate(new Date(post.timestamp))) {
            throw new Error('تاريخ غير صالح');
        }
    }

    // دالة معالجة المنشورات
    function processPosts(posts) {
        return posts.map(post => ({
            ...post,
            price: Number(post.price),
            timestamp: new Date(post.timestamp).toISOString()
        }));
    }

    window.feature77Logic = {
        validatePost,
        processPosts
    };
})();