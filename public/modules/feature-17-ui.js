(function() {
    'use strict';

    // تحسين معالجة الأخطاء في عرض المنشورات
    function renderPosts(posts) {
        const postsContainer = document.getElementById('posts-container');
        if (!postsContainer) {
            console.warn('Element #posts-container not found');
            return;
        }

        postsContainer.innerHTML = '';
        posts.forEach(post => {
            try {
                const postElement = document.createElement('div');
                postElement.className = 'post';
                postElement.innerHTML = `
                    <h3>${escapeHTML(post.author)}</h3>
                    <p>${escapeHTML(post.content)}</p>
                    <p>السعر: ${escapeHTML(post.price)}</p>
                    <p>المدينة: ${escapeHTML(post.city)}</p>
                    <p>التاريخ: ${new Date(post.timestamp).toLocaleString()}</p>
                `;
                postsContainer.appendChild(postElement);
            } catch (error) {
                console.error('Error rendering post:', error);
            }
        });
    }

    // دالة فرعية لتجنب XSS
    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g,
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag]));
    }

    // تصدير الواجهة
    window.feature17UI = {
        renderPosts
    };
})();