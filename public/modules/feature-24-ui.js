(function() {
    'use strict';

    // التحقق من وجود العنصر قبل استخدام .textContent
    function safeSetTextContent(elementId, text) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = text;
        } else {
            console.warn(`Element with ID ${elementId} not found`);
        }
    }

    // دالة عرض المنشورات
    function renderPosts(posts) {
        const postsContainer = document.getElementById('postsContainer');
        if (!postsContainer) {
            console.warn('Posts container not found');
            return;
        }

        postsContainer.innerHTML = '';
        posts.forEach(post => {
            const postElement = document.createElement('div');
            postElement.className = 'post';

            // استخدام الدالة الآمنة لتعيين المحتوى
            safeSetTextContent('postAuthor', post.author);
            safeSetTextContent('postContent', post.content);
            safeSetTextContent('postPrice', post.price);
            safeSetTextContent('postCity', post.city);
            safeSetTextContent('postTimestamp', new Date(post.timestamp).toLocaleString());

            postsContainer.appendChild(postElement);
        });
    }

    // تصدير الواجهة
    window.feature24UI = {
        renderPosts,
        safeSetTextContent
    };
})();