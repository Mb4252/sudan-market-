(function() {
    'use strict';

    // دالة لحساب الإحصائيات
    function calculateStats(posts) {
        if (!posts || posts.length === 0) return {
            totalPosts: 0,
            avgPrice: 0,
            minPrice: 0,
            maxPrice: 0
        };

        const prices = posts.map(post => post.price);
        const totalPosts = posts.length;
        const avgPrice = prices.reduce((sum, price) => sum + price, 0) / totalPosts;
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);

        return {
            totalPosts,
            avgPrice,
            minPrice,
            maxPrice
        };
    }

    // دالة لتحديث واجهة الإحصائيات
    function updateStatsUI() {
        if (document.getElementById('totalPosts') && document.getElementById('avgPrice') && document.getElementById('minPrice') && document.getElementById('maxPrice')) {
            const posts = window.store.getState().posts;
            const stats = calculateStats(posts);

            document.getElementById('totalPosts').textContent = stats.totalPosts;
            document.getElementById('avgPrice').textContent = stats.avgPrice.toFixed(2);
            document.getElementById('minPrice').textContent = stats.minPrice;
            document.getElementById('maxPrice').textContent = stats.maxPrice;
        }
    }

    // تحديث واجهة الإحصائيات عند تحديث المخزن
    window.store.on('storeUpdated', () => {
        updateStatsUI();
    });

    // تحديث واجهة الإحصائيات عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', () => {
        updateStatsUI();
    });

    // تصدير الدالة
    window.marketStats = {
        calculateStats
    };
})();