// sdm-module-156.js
(function() {
    'use strict';

    // دالة لتحميل المنشورات المحفوظة من localStorage
    function loadSavedPosts() {
        try {
            const posts = JSON.parse(localStorage.getItem('sudanMarketPosts')) || [];
            const chatContainer = document.getElementById('sdm-chat');

            if (chatContainer && posts.length > 0) {
                const loadButton = document.createElement('button');
                loadButton.textContent = 'تحميل المنشورات المحفوظة';
                loadButton.className = 'load-posts-button';
                loadButton.onclick = function() {
                    posts.forEach(post => {
                        if (post && post.content) {
                            const postElement = document.createElement('div');
                            postElement.className = 'saved-post';
                            postElement.textContent = post.content;
                            chatContainer.appendChild(postElement);
                        }
                    });
                };

                chatContainer.insertBefore(loadButton, chatContainer.firstChild);
            }
        } catch (error) {
            console.error('Error loading saved posts:', error);
        }
    }

    // تنفيذ الدالة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', loadSavedPosts);
})();