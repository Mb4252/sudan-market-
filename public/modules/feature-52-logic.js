(function() {
    'use strict';

    function validatePost(post) {
        if (!post.author || !post.content || !post.price || !post.city || !post.timestamp) {
            throw new Error('المنشور غير صالح: الحقول المطلوبة مفقودة');
        }
        if (typeof post.price !== 'number' || post.price <= 0) {
            throw new Error('السعر غير صالح');
        }
        if (!window.store.isValidDate(new Date(post.timestamp))) {
            throw new Error('تاريخ غير صالح');
        }
    }

    function handleError(error) {
        console.error('خطأ:', error.message);
        window.feature52UI.updateStatus(`خطأ: ${error.message}`);
    }

    window.feature52Logic = {
        validatePost,
        handleError
    };
})();