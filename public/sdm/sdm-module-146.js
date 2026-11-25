// sdm-module-146.js
(function() {
    'use strict';

    // دالة لتحميل المنشورات من localStorage
    function loadPosts() {
        try {
            const posts = localStorage.getItem('sdmPosts');
            return posts ? JSON.parse(posts) : [];
        } catch (error) {
            console.error('Error loading posts:', error);
            return [];
        }
    }

    // دالة لحفظ المنشورات في localStorage
    function savePosts(posts) {
        try {
            localStorage.setItem('sdmPosts', JSON.stringify(posts));
            return true;
        } catch (error) {
            console.error('Error saving posts:', error);
            return false;
        }
    }

    // دالة لإضافة منشور جديد
    function addPost(title, content) {
        const posts = loadPosts();
        const newPost = {
            id: Date.now().toString(),
            title: title,
            content: content,
            timestamp: new Date().toISOString()
        };
        posts.unshift(newPost);
        savePosts(posts);
        return newPost;
    }

    // تهيئة الواجهة
    function initUI() {
        const postsContainer = document.getElementById('sdm-posts');
        if (!postsContainer) return;

        // عرض المنشورات الحالية
        const posts = loadPosts();
        posts.forEach(post => {
            const postElement = document.createElement('div');
            postElement.className = 'post';
            postElement.innerHTML = `
                <h3>${post.title}</h3>
                <p>${post.content}</p>
                <small>${new Date(post.timestamp).toLocaleString()}</small>
            `;
            postsContainer.appendChild(postElement);
        });
    }

    // ربط الدوال مع النافذة العالمية
    window.sdmPosts = {
        loadPosts,
        savePosts,
        addPost
    };

    // تهيئة الواجهة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', initUI);
})();