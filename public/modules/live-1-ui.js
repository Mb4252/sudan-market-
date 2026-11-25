// public/modules/live-1-ui.js
(function() {
    'use strict';

    // دالة مساعدة للتحقق من وجود العنصر
    function elementExists(selector) {
        return document.querySelector(selector) !== null;
    }

    // دالة تحديث حالة البث
    function updateStatus(status) {
        if (elementExists('#status')) {
            document.getElementById('status').textContent = status;
        }
    }

    // دالة عرض المنشورات
    function renderPosts(posts) {
        if (elementExists('#posts')) {
            const postsContainer = document.getElementById('posts');
            postsContainer.innerHTML = '';
            posts.forEach(post => {
                const postElement = document.createElement('div');
                postElement.className = 'post';
                postElement.innerHTML = `
                    <h3>${post.author}</h3>
                    <p>${post.content}</p>
                    <p>السعر: ${post.price}</p>
                    <p>المدينة: ${post.city}</p>
                    <p>التاريخ: ${new Date(post.timestamp).toLocaleString()}</p>
                `;
                postsContainer.appendChild(postElement);
            });
        }
    }

    // دالة عرض خطأ
    function displayError(message) {
        if (elementExists('#error')) {
            document.getElementById('error').textContent = message;
        }
    }

    // تصدير الوظائف
    window.liveUI = {
        updateStatus,
        renderPosts,
        displayError
    };

    // تهيئة الواجهة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        updateStatus('جاهز');
    });
})();