(function() {
    'use strict';

    function comparePrices(posts, currentPrice) {
        if (!Array.isArray(posts) || !currentPrice) return [];

        const current = parseFloat(currentPrice);
        if (isNaN(current)) return [];

        const sorted = [...posts].sort((a, b) => {
            const priceA = parseFloat(a.price);
            const priceB = parseFloat(b.price);
            return priceA - priceB;
        });

        return sorted.map(post => {
            const postPrice = parseFloat(post.price);
            const difference = postPrice - current;
            const percentage = ((difference / current) * 100).toFixed(2);

            return {
                ...post,
                difference: difference.toFixed(2),
                percentage: `${percentage}%`,
                isCheaper: difference < 0
            };
        });
    }

    window.compareEngine = {
        comparePrices
    };
})();