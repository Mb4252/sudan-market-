(function() {
    'use strict';

    try {
        // التحقق من وجود عناصر DOM المطلوبة
        if (!document.getElementById('market-shell')) {
            console.warn('Market shell not found, SDM module 162 will not initialize');
            return;
        }

        // الوظيفة الرئيسية: عرض عدد المنشورات المحفوظة
        function displaySavedPostsCount() {
            const posts = JSON.parse(localStorage.getItem('sudanMarketPosts') || '[]');
            const countElement = document.createElement('div');
            countElement.id = 'saved-posts-count';
            countElement.textContent = `Saved posts: ${posts.length}`;
            document.getElementById('market-shell').appendChild(countElement);
        }

        // تنفيذ الوظيفة
        displaySavedPostsCount();
    } catch (error) {
        console.error('Error in SDM module 162:', error);
    }
})();