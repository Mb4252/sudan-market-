(function() {
    'use strict';

    const store = new Proxy({
        posts: [],
        status: 'جاهز'
    }, {
        set(target, key, value) {
            target[key] = value;
            document.dispatchEvent(new CustomEvent('storeUpdated', {
                detail: {
                    posts: target.posts,
                    status: target.status
                }
            }));
            return true;
        }
    });

    function addPost(post) {
        store.posts = [...store.posts, post];
        store.status = 'تم النشر بنجاح';
    }

    function updateStatus(status) {
        store.status = status;
    }

    window.store = {
        addPost,
        updateStatus
    };

    window.isValidDate = function(date) {
        return date instanceof Date && !isNaN(date.getTime());
    };
})();