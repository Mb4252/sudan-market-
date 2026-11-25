(function() {
    'use strict';

    // التحقق من وجود العنصر قبل استخدام .textContent
    function safeSetTextContent(selector, text) {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = text;
        } else {
            console.warn(`Element not found: ${selector}`);
        }
    }

    // دالة عرض الحالة
    function renderStatus(status) {
        safeSetTextContent('#status', status);
    }

    // دالة عرض المنشورات
    function renderPosts(posts) {
        const postsContainer = document.querySelector('#posts');
        if (!postsContainer) {
            console.warn('Posts container not found');
            return;
        }

        postsContainer.innerHTML = '';
        posts.forEach(post => {
            const postElement = document.createElement('div');
            postElement.className = 'post';
            postElement.innerHTML = `
                <h3>${post.author}</h3>
                <p>${post.content}</p>
                <p>السعر: ${post.price} جنيه</p>
                <p>المدينة: ${post.city}</p>
                <p>الوقت: ${new Date(post.timestamp).toLocaleString()}</p>
            `;
            postsContainer.appendChild(postElement);
        });
    }

    window.feature77UI = {
        renderStatus,
        renderPosts
    };
})();