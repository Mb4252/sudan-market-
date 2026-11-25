/*
 * Feature 21 UI Module
 * مسؤول عن عرض البيانات في الواجهة مع حماية من أخطاء DOM
 */
window.Feature21UI = {
    renderPosts: function(posts) {
        const container = document.getElementById('posts');
        if (!container) {
            console.error('[Feature21UI] عنصر #posts غير موجود في DOM');
            return;
        }

        // تفريغ المحتوى الحالي بأمان
        container.innerHTML = '';

        posts.forEach(post => {
            const postElement = document.createElement('div');
            postElement.className = 'post';
            postElement.innerHTML = `
                <h3>${post.author}</h3>
                <p>${post.content}</p>
                <p>السعر: ${post.price} جنيهاً</p>
                <p>المدينة: ${post.city}</p>
                <p>التاريخ: ${new Date(post.timestamp).toLocaleString('ar-EG')}</p>
            `;
            container.appendChild(postElement);
        });
    },
    showError: function(message) {
        const errorElement = document.getElementById('error');
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
        }
    }
};