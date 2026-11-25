(function() {
    'use strict';

    async function analyzePrices() {
        try {
            const posts = await window.api.fetchPosts();
            if (!posts || !Array.isArray(posts)) {
                throw new Error('بيانات المنشورات غير صالحة');
            }

            const prices = posts.map(post => post.price).filter(price => typeof price === 'number');
            if (prices.length === 0) {
                throw new Error('لا توجد أسعار صالحة');
            }

            const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
            const min = Math.min(...prices);
            const max = Math.max(...prices);

            return { average, min, max };
        } catch (error) {
            handleError(error);
            throw error;
        }
    }

    window.feature39Logic = {
        analyzePrices
    };
})();