(function() {
    'use strict';

    const store = new EventTarget();
    const state = {
        posts: [],
        status: 'غير متصل'
    };

    const proxyState = new Proxy(state, {
        set(target, property, value) {
            target[property] = value;
            store.dispatchEvent(new CustomEvent('storeUpdated', { detail: target }));
            return true;
        }
    });

    function isValidDate(date) {
        return date instanceof Date && !isNaN(date);
    }

    function addPost(post) {
        if (isValidDate(new Date(post.timestamp))) {
            proxyState.posts = [...proxyState.posts, post];
        } else {
            console.error('تاريخ غير صالح');
        }
    }

    function updateStatus(status) {
        proxyState.status = status;
    }

    window.store = {
        on: store.addEventListener.bind(store),
        addPost,
        updateStatus,
        isValidDate
    };
})();