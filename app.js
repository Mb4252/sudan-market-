(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', function() {
        const publishBtn = document.getElementById('publishBtn');
        const compareBtn = document.getElementById('compareBtn');

        publishBtn.addEventListener('click', function() {
            const newPost = {
                author: 'مستخدم',
                content: 'منتج جديد',
                price: 100,
                city: 'الخرطوم',
                timestamp: new Date().toISOString()
            };
            if (window.store.isValidDate(new Date(newPost.timestamp))) {
                window.broadcast(newPost);
            } else {
                handleError(new Error('تاريخ غير صالح'));
            }
        });

        compareBtn.addEventListener('click', function() {
            // منطق المقارنة
        });

        window.store.on('storeUpdated', function(e) {
            const { posts, status } = e.detail;
            document.getElementById('status').textContent = status;
            renderPosts(posts);
        });

        window.onerror = function(message, source, lineno, colno, error) {
            handleError(error);
        };

        window.addEventListener('unhandledrejection', function(event) {
            handleError(event.reason);
        });
    });

    function renderPosts(posts) {
        const postsContainer = document.getElementById('posts');
        postsContainer.innerHTML = posts.map(post => {
            const date = new Date(post.timestamp);
            return `
                <div class="post">
                    <h3>${post.author}</h3>
                    <p>${post.content}</p>
                    <p>السعر: ${post.price} جنية</p>
                    <p>المدينة: ${post.city}</p>
                    <p>التاريخ: ${window.store.formatDate(date)}</p>
                </div>
            `;
        }).join('');
    }

    function handleError(error) {
        console.error('خطأ:', error);
        document.getElementById('status').textContent = `خطأ: ${error.message}`;
    }
})();