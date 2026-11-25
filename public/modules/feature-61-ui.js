(function() {
    'use strict';

    // دالة آمنة لتحديث نص العنصر
    function safeSetTextContent(selector, text) {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = text;
        } else {
            console.warn(`[Feature-61 UI] Element not found: ${selector}`);
        }
    }

    // تحديث الواجهة بناءً على البيانات الواردة
    function updateUI(data) {
        if (!data) return;
        
        // تحديث حالة الميزة
        safeSetTextContent('#feature-61-status', data.status || 'غير متاح');
        
        // تحديث قائمة المنشورات
        const postsList = document.querySelector('#feature-61-posts');
        if (postsList) {
            postsList.innerHTML = '';
            data.posts.forEach(post => {
                const li = document.createElement('li');
                li.textContent = `${post.author}: ${post.content} - ${post.price} SDG`;
                postsList.appendChild(li);
            });
        }
    }

    // تصدير الواجهة
    window.feature61UI = {
        updateUI
    };
})();