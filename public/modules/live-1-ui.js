// public/modules/live-1-ui.js
(function() {
    'use strict';

    // دالة للتحقق من وجود العنصر في DOM
    function elementExists(selector) {
        return document.querySelector(selector) !== null;
    }

    // دالة لتحديث حالة البث
    function updateStatus(status) {
        if (elementExists('#status')) {
            document.getElementById('status').textContent = status;
        }
    }

    // دالة لعرض المنشورات
    function renderPosts(posts) {
        if (elementExists('#posts')) {
            const postsContainer = document.getElementById('posts');
            postsContainer.innerHTML = posts.map(post =>
                `<div class="post">
                    <h3>${post.author}</h3>
                    <p>${post.content}</p>
                    <p>السعر: ${post.price}</p>
                    <p>المدينة: ${post.city}</p>
                    <p>التاريخ: ${new Date(post.timestamp).toLocaleString()}</p>
                </div>`
            ).join('');
        }
    }

    // دالة لمعالجة الأخطاء
    function handleUIError(error) {
        console.error('خطأ في الواجهة:', error);
        if (elementExists('#error')) {
            document.getElementById('error').textContent = `خطأ: ${error.message}`;
        }
    }

    // تصدير الواجهة
    window.liveUI = {
        updateStatus,
        renderPosts,
        handleUIError
    };
})();