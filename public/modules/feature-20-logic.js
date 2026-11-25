(function() {
    'use strict';

    class Feature20Logic {
        constructor() {
            this.posts = [];
        }

        async fetchPosts() {
            try {
                const response = await fetch('https://sudan-market-2.onrender.com/posts');
                if (!response.ok) throw new Error('خطأ في جلب المنشورات');
                this.posts = await response.json();
                window.feature20UI.renderPosts(this.posts);
                window.feature20UI.updateStatus('تم تحديث المنشورات بنجاح');
            } catch (error) {
                window.feature20UI.updateStatus(`خطأ: ${error.message}`);
            }
        }

        async createPost(post) {
            try {
                const response = await fetch('https://sudan-market-2.onrender.com/posts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(post)
                });
                if (!response.ok) throw new Error('خطأ في إنشاء المنشور');
                const newPost = await response.json();
                this.posts.push(newPost);
                window.feature20UI.renderPosts(this.posts);
                window.feature20UI.updateStatus('تم إنشاء المنشور بنجاح');
            } catch (error) {
                window.feature20UI.updateStatus(`خطأ: ${error.message}`);
            }
        }
    }

    window.feature20Logic = new Feature20Logic();
})();