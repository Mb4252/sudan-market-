(function() {
    'use strict';

    // دالة التحقق من وجود العنصر قبل الإسناد
    function safeSetTextContent(selector, text) {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = text;
        }
    }

    // دالة عرض المنشورات
    function renderPosts(posts) {
        const postsContainer = document.getElementById('livePosts');
        if (!postsContainer) return;

        postsContainer.innerHTML = '';
        posts.forEach(post => {
            const postElement = document.createElement('div');
            postElement.className = 'post';
            postElement.innerHTML = `
                <h3>${post.author}</h3>
                <p>${post.content}</p>
                <p>السعر: ${post.price} جنية</p>
                <p>المدينة: ${post.city}</p>
                <p>التاريخ: ${new Date(post.timestamp).toLocaleString()}</p>
            `;
            postsContainer.appendChild(postElement);
        });
    }

    // دالة عرض الحالة
    function updateStatus(status) {
        safeSetTextContent('#liveStatus', status);
    }

    // دالة عرض الأخطاء
    function showError(message) {
        safeSetTextContent('#liveError', message);
    }

    // تصدير الواجهة
    window.liveUI = {
        renderPosts,
        updateStatus,
        showError
    };
})();