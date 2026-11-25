(function() {
    'use strict';

    class Feature35Logic {
        constructor() {
            this.posts = [];
        }

        addPost(post) {
            this.posts.push(post);
            window.store.updateStore({ posts: this.posts });
        }

        getPosts() {
            return this.posts;
        }

        comparePrices() {
            // منطق المقارنة
        }
    }

    window.feature35Logic = new Feature35Logic();
})();