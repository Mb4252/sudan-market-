// sdm-addon-36.js

(function() {
    'use strict';

    // دالة لجلب المنشورات من localStorage
    function getPostsFromStorage() {
        try {
            const posts = localStorage.getItem('sudanMarketPosts');
            return posts ? JSON.parse(posts) : [];
        } catch (e) {
            console.error('Error getting posts from storage:', e);
            return [];
        }
    }

    // دالة لعرض المنشورات في الواجهة
    function displayPosts() {
        const postsContainer = document.getElementById('sdm-posts');
        if (!postsContainer) return;

        const posts = getPostsFromStorage();
        if (posts.length === 0) {
            postsContainer.innerHTML = '<p>لا توجد منشورات بعد</p>';
            return;
        }

        let html = '<h3>المنشورات الأخيرة</h3><ul>';
        posts.slice(-5).reverse().forEach(post => {
            html += `<li><strong>${post.title || 'بدون عنوان'}</strong>: ${post.content || 'بدون محتوى'}</li>`;
        });
        html += '</ul>';
        postsContainer.innerHTML = html;
    }

    // تهيئة الميزة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            // إضافة عنصر لعرض المنشورات
            const chatContainer = document.getElementById('sdm-chat');
            if (chatContainer) {
                const postsContainer = document.createElement('div');
                postsContainer.id = 'sdm-posts';
                postsContainer.style.marginTop = '20px';
                chatContainer.parentNode.insertBefore(postsContainer, chatContainer.nextSibling);
            }

            // عرض المنشورات فوراً
            displayPosts();

            // تحديث المنشورات كل 30 ثانية
            setInterval(displayPosts, 30000);
        } catch (e) {
            console.error('Error initializing SDM addon 36:', e);
        }
    });

    // تحديث المنشورات عند تلقي رسالة جديدة
    if (window.sdmEngine) {
        window.sdmEngine.on('message', displayPosts);
    }

})();