(function() {
    'use strict';

    function validatePost(post) {
        if (!post || typeof post !== 'object') {
            throw new Error('Invalid post object');
        }

        if (!post.author || typeof post.author !== 'string') {
            throw new Error('Invalid author');
        }

        if (!post.content || typeof post.content !== 'string') {
            throw new Error('Invalid content');
        }

        if (!post.price || typeof post.price !== 'number' || post.price <= 0) {
            throw new Error('Invalid price');
        }

        if (!post.city || typeof post.city !== 'string') {
            throw new Error('Invalid city');
        }

        if (!post.timestamp || !window.store.isValidDate(new Date(post.timestamp))) {
            throw new Error('Invalid timestamp');
        }
    }

    window.feature15Logic = {
        validatePost
    };
})();