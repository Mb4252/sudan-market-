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
            if (window.isValidDate(new Date(newPost.timestamp))) {
                window.broadcast(newPost);
            } else {
                console.error('تاريخ غير صالح');
            }
        });

        compareBtn.addEventListener('click', function() {
            // منطق المقارنة
        });

        document.addEventListener('storeUpdated', function(e) {
            const { posts, status } = e.detail;
            document.getElementById('status').textContent = status;
            renderPosts(posts);
        });
    });

    function renderPosts(posts) {
        const postsContainer = document.getElementById('posts');
        postsContainer.innerHTML = posts.map(post => {
            const date = new Date(post.timestamp);
            const formattedDate = window.formatDate(date);
            return `<div class="post">
                <h3>${post.author}</h3>
                <p>${post.content}</p>
                <p>السعر: ${post.price} جنية</p>
                <p>المدينة: ${post.city}</p>
                <p>التاريخ: ${formattedDate}</p>
            </div>`;
        }).join('');
    }
})();