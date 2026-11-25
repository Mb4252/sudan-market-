(function() {
    'use strict';

    function validatePostData(post) {
        if (!post || typeof post !== 'object') {
            throw new Error('بيانات المنشور غير صالحة');
        }

        if (!post.author || typeof post.author !== 'string' || post.author.trim() === '') {
            throw new Error('اسم المؤلف مطلوب');
        }

        if (!post.content || typeof post.content !== 'string' || post.content.trim() === '') {
            throw new Error('محتوى المنشور مطلوب');
        }

        if (!post.price || typeof post.price !== 'number' || post.price <= 0) {
            throw new Error('السعر مطلوب ويجب أن يكون رقم موجب');
        }

        if (!post.city || typeof post.city !== 'string' || post.city.trim() === '') {
            throw new Error('المدينة مطلوبة');
        }

        if (!post.timestamp || !window.store.isValidDate(new Date(post.timestamp))) {
            throw new Error('تاريخ غير صالح');
        }
    }

    window.feature28Logic = {
        validatePostData
    };
})();