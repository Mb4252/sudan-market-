(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', function() {
        const publishBtn = document.getElementById('publishBtn');
        const compareBtn = document.getElementById('compareBtn');

        publishBtn.addEventListener('click', function() {
            const authorInput = document.getElementById('authorInput');
            const contentInput = document.getElementById('contentInput');
            const priceInput = document.getElementById('priceInput');
            const cityInput = document.getElementById('cityInput');

            const newPost = {
                author: authorInput.value,
                content: contentInput.value,
                price: parseFloat(priceInput.value),
                city: cityInput.value,
                timestamp: new Date().toISOString()
            };

            if (window.store.isValidDate(new Date(newPost.timestamp))) {
                window.broadcast(newPost);
            } else {
                handleError(new Error('تاريخ غير صالح'));
            }
        });

        compareBtn.addEventListener('click', function() {
            window.comparePrices();
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
        const postsContainer = document.getElementById('postsContainer');
        postsContainer.innerHTML = '';

        posts.forEach(post => {
            const postElement = document.createElement('div');
            postElement.className = 'post';
            postElement.innerHTML = `
                <h3>${post.author}</h3>
                <p>${post.content}</p>
                <p>السعر: ${post.price} جنيه</p>
                <p>المدينة: ${post.city}</p>
                <p>التاريخ: ${new Date(post.timestamp).toLocaleString('ar-EG')}</p>
            `;
            postsContainer.appendChild(postElement);
        });
    }

    function handleError(error) {
        console.error('خطأ:', error);
        // يمكن إضافة عرض رسالة خطأ للمستخدم هنا
    }
})();