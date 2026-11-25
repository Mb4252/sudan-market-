// sdm-module-139.js
(function() {
    'use strict';

    // دالة لتحميل المنشورات من localStorage
    function loadPostsFromLocalStorage() {
        try {
            const posts = localStorage.getItem('sudanMarketPosts');
            return posts ? JSON.parse(posts) : [];
        } catch (e) {
            console.error('Error loading posts from localStorage:', e);
            return [];
        }
    }

    // دالة لعرض المنشورات في الواجهة
    function displayPosts(posts) {
        const chatContainer = document.getElementById('sdm-chat');
        if (!chatContainer) return;

        chatContainer.innerHTML = '';

        posts.forEach(post => {
            const postElement = document.createElement('div');
            postElement.className = 'chat-message';
            postElement.innerHTML = `
                <strong>${post.name || 'مجهول'}:</strong>
                <p>${post.message}</p>
                <small>${new Date(post.timestamp).toLocaleString()}</small>
            `;
            chatContainer.appendChild(postElement);
        });
    }

    // تنفيذ الدوال عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            const posts = loadPostsFromLocalStorage();
            displayPosts(posts);
        } catch (e) {
            console.error('Error in sdm-module-139.js:', e);
        }
    });

    // تصدير الدوال للوصول العالمي
    window.sdmModule139 = {
        loadPostsFromLocalStorage,
        displayPosts
    };
})();