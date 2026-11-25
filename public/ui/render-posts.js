(function() {
    'use strict';

    // دالة لعرض المنشورات في DOM
    function renderPosts() {
        const postsList = document.getElementById('posts-list');
        if (!postsList) {
            console.error('لم يتم العثور على العنصر #posts-list');
            return;
        }

        const posts = window.store.getPosts();
        postsList.innerHTML = '';

        if (posts.length === 0) {
            postsList.innerHTML = '<li>لا يوجد منشورات بعد.</li>';
            return;
        }

        posts.forEach(post => {
            const postElement = document.createElement('li');
            postElement.className = 'post-item';

            const date = new Date(post.timestamp);
            const formattedDate = window.store.formatDate(date);

            postElement.innerHTML = `<div class="post-header">` +
                `<span class="post-author">${post.author || 'مستخدم مجهول'}</span>` +
                `<span class="post-city">(${post.city || 'غير معروف'})</span>` +
                `<span class="post-date">${date.toLocaleString('ar-EG')}</span>` +
                `</div>` +
                `<div class="post-content">${post.content}</div>` +
                `<div class="post-price">السعر: ${post.price || 'غير معروف'} SDG</div>`;

            postsList.appendChild(postElement);
        });
    }

    // استماع إلى تغييرات في المخزن
    window.store.on('storeUpdated', (event) => {
        renderPosts();
    });

    // استدعاء الدالة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', renderPosts);

})();