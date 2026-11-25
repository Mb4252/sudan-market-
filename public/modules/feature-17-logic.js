(function() {
    'use strict';

    // تحسين معالجة الأخطاء في منطق المنشورات
    function processPosts(posts) {
        if (!Array.isArray(posts)) {
            console.error('Invalid posts data');
            return [];
        }

        return posts.map(post => {
            try {
                return {
                    ...post,
                    timestamp: new Date(post.timestamp).toISOString()
                };
            } catch (error) {
                console.error('Error processing post:', error);
                return null;
            }
        }).filter(post => post !== null);
    }

    // تصدير الواجهة
    window.feature17Logic = {
        processPosts
    };
})();