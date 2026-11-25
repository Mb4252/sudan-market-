(function() {
    'use strict';

    function extractPrices(posts) {
        if (!Array.isArray(posts)) return [];

        return posts.map(post => {
            const price = parseFloat(post.price);
            return isNaN(price) ? 0 : price;
        }).filter(price => price > 0);
    }

    function calculateAveragePrice(prices) {
        if (!prices.length) return 0;
        const sum = prices.reduce((a, b) => a + b, 0);
        return sum / prices.length;
    }

    function getPriceTrend(prices) {
        if (prices.length < 2) return 'غير متاح';

        const first = prices[0];
        const last = prices[prices.length - 1];
        const change = last - first;

        if (change > 0) return '↑ ارتفاع';
        if (change < 0) return '↓ انخفاض';
        return '→ استقرار';
    }

    window.priceExtractor = {
        extractPrices,
        calculateAveragePrice,
        getPriceTrend
    };
})();