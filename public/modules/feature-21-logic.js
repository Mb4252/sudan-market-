/*
 * Feature 21 Logic Module
 * مسؤول عن معالجة البيانات والمنطق التجاري
 */
window.Feature21Logic = {
    processPosts: function(posts) {
        // معالجة البيانات هنا
        return posts.map(post => ({
            ...post,
            processed: true
        }));
    },
    validatePost: function(post) {
        if (!post.author || !post.content || !post.price || !post.city || !post.timestamp) {
            throw new Error('بيانات المنشور غير كاملة');
        }
        if (typeof post.price !== 'number' || post.price <= 0) {
            throw new Error('السعر يجب أن يكون رقم موجب');
        }
        if (!window.store.isValidDate(new Date(post.timestamp))) {
            throw new Error('تاريخ غير صالح');
        }
        return true;
    }
};