(function() {
    'use strict';

    const store = {
        posts: [],
        status: 'غير متصل',
        isValidDate: function(date) {
            return date instanceof Date && !isNaN(date);
        },
        saveToLocalStorage: function() {
            localStorage.setItem('sudanMarketPosts', JSON.stringify(this.posts));
        },
        loadFromLocalStorage: function() {
            const savedPosts = localStorage.getItem('sudanMarketPosts');
            if (savedPosts) {
                this.posts = JSON.parse(savedPosts);
            }
        }
    };

    store.loadFromLocalStorage();

    window.store = store;
})();