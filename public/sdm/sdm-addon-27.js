// sdm-addon-27.js
(function() {
    'use strict';

    // دالة لجلب عدد المنشورات المحفوظة
    function getSavedPostsCount() {
        try {
            const data = localStorage.getItem('sudanMarketPosts');
            if (data) {
                const posts = JSON.parse(data);
                return posts.length;
            }
            return 0;
        } catch (error) {
            console.error('Error getting saved posts count:', error);
            return 0;
        }
    }

    // تحديث عداد المنشورات المحفوظة في الواجهة
    function updateSavedPostsCounter() {
        const counterElement = document.getElementById('saved-posts-counter');
        if (counterElement) {
            const count = getSavedPostsCount();
            counterElement.textContent = `المنشورات المحفوظة: ${count}`;
        }
    }

    // تهيئة الميزة
    function init() {
        try {
            // إضافة عنصر العداد إلى واجهة الدردشة
            const chatContainer = document.getElementById('chat-container');
            if (chatContainer) {
                const counterElement = document.createElement('div');
                counterElement.id = 'saved-posts-counter';
                counterElement.style.margin = '10px 0';
                counterElement.style.fontSize = '0.9em';
                counterElement.style.color = '#666';
                chatContainer.appendChild(counterElement);

                // تحديث العداد أول مرة
                updateSavedPostsCounter();

                // تحديث العداد عند تغيير localStorage
                window.addEventListener('storage', updateSavedPostsCounter);
            }
        } catch (error) {
            console.error('Error initializing saved posts counter:', error);
        }
    }

    // بدء الميزة عند تحميل الصفحة
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
})();