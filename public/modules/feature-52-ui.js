(function() {
    'use strict';

    function safeSetTextContent(elementId, text) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = text;
        } else {
            console.warn(`Element with ID ${elementId} not found`);
        }
    }

    function updateStatus(status) {
        safeSetTextContent('status', status);
    }

    function renderPosts(posts) {
        const postsContainer = document.getElementById('posts');
        if (!postsContainer) {
            console.warn('Posts container not found');
            return;
        }

        postsContainer.innerHTML = posts.map(post => `
            <div class="post">
                <h3>${post.author}</h3>
                <p>${post.content}</p>
                <p>السعر: ${post.price}</p>
                <p>المدينة: ${post.city}</p>
                <p>التاريخ: ${new Date(post.timestamp).toLocaleString()}</p>
            </div>
        `).join('');
    }

    window.feature52UI = {
        updateStatus,
        renderPosts
    };
})();