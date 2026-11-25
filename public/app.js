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
        if (!postsContainer) {
            console.error('العنصر "posts" غير موجود في DOM');
            return;
        }

        postsContainer.innerHTML = '';
        posts.forEach(post => {
            const postElement = document.createElement('div');
            postElement.className = 'post';

            const authorElement = document.createElement('div');
            authorElement.className = 'author';
            authorElement.textContent = post.author || 'مجهول';
            postElement.appendChild(authorElement);

            const contentElement = document.createElement('div');
            contentElement.className = 'content';
            contentElement.textContent = post.content || 'لا يوجد محتوى';
            postElement.appendChild(contentElement);

            const priceElement = document.createElement('div');
            priceElement.className = 'price';
            priceElement.textContent = post.price ? `${post.price} جنية سوداني` : 'سعر غير محدد';
            postElement.appendChild(priceElement);

            const cityElement = document.createElement('div');
            cityElement.className = 'city';
            cityElement.textContent = post.city || 'مدينة غير محددة';
            postElement.appendChild(cityElement);

            const timestampElement = document.createElement('div');
            timestampElement.className = 'timestamp';
            timestampElement.textContent = post.timestamp ? new Date(post.timestamp).toLocaleString('ar-SD') : 'تاريخ غير محدد';
            postElement.appendChild(timestampElement);

            postsContainer.appendChild(postElement);
        });
    }

    function handleError(error) {
        console.error('خطأ:', error);
        const errorElement = document.getElementById('error');
        if (errorElement) {
            errorElement.textContent = `حدث خطأ: ${error.message}`;
        }
    }

    window.renderPosts = renderPosts;
    window.handleError = handleError;
})();