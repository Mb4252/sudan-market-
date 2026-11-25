// public/sdm/sdm-module-69.js
(function() {
    'use strict';

    // دالة لجلب المنشورات من التخزين المحلي
    function getPostsFromLocalStorage() {
        try {
            const posts = localStorage.getItem('sudanMarketPosts');
            return posts ? JSON.parse(posts) : [];
        } catch (error) {
            console.error('Error getting posts from localStorage:', error);
            return [];
        }
    }

    // دالة لعرض المنشورات في الواجهة
    function displayPosts() {
        const posts = getPostsFromLocalStorage();
        const chatContainer = document.getElementById('sdm-chat');

        if (!chatContainer) {
            console.error('Chat container not found');
            return;
        }

        chatContainer.innerHTML = '';

        posts.forEach(post => {
            const postElement = document.createElement('div');
            postElement.className = 'post';
            postElement.innerHTML = `
                <div class="post-header">
                    <span class="post-author">${post.author || 'مجهول'}</span>
                    <span class="post-date">${safeFormatDate(new Date(post.date), 'ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>
                <div class="post-content">${post.content}</div>
            `;
            chatContainer.appendChild(postElement);
        });
    }

    // دالة لتهيئة الواجهة
    function init() {
        try {
            displayPosts();
        } catch (error) {
            console.error('Error initializing SDM module 69:', error);
        }
    }

    // تهيئة الواجهة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // تصدير الدوال العامة
    window.sdmModule69 = {
        displayPosts: displayPosts
    };
})();
