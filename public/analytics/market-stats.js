// public/analytics/market-stats.js
(function() {
    'use strict';

    function initMarketStats() {
        const statsContainer = document.getElementById('marketStats');

        if (!statsContainer) {
            console.error('عنصر الإحصائيات غير موجود في DOM');
            return;
        }

        function updateStats() {
            const posts = window.store.getState().posts;

            if (!posts || posts.length === 0) {
                statsContainer.innerHTML = '<p>لا توجد بيانات إحصائية متاحة</p>';
                return;
            }

            const totalPosts = posts.length;
            const avgPrice = (posts.reduce((sum, post) => sum + post.price, 0) / totalPosts).toFixed(2);
            const cities = [...new Set(posts.map(post => post.city))];

            statsContainer.innerHTML = `
                <div class="stat-card">
                    <h3>إجمالي المنشورات</h3>
                    <p>${totalPosts}</p>
                </div>
                <div class="stat-card">
                    <h3>متوسط السعر</h3>
                    <p>${avgPrice} جنيها</p>
                </div>
                <div class="stat-card">
                    <h3>المدن</h3>
                    <p>${cities.length}</p>
                </div>
            `;
        }

        window.store.on('storeUpdated', updateStats);
        updateStats();
    }

    window.initMarketStats = initMarketStats;
})();