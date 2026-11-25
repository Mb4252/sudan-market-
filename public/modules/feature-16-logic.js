(function() {
    'use strict';

    // التحقق من صحة التاريخ قبل استخدامه
    function isValidDate(date) {
        return date instanceof Date && !isNaN(date);
    }

    // دالة لحساب متوسط السعر
    function calculateAveragePrice(posts) {
        if (!Array.isArray(posts) || posts.length === 0) return 0;
        const validPrices = posts
            .map(post => post.price)
            .filter(price => typeof price === 'number' && !isNaN(price));
        if (validPrices.length === 0) return 0;
        const sum = validPrices.reduce((a, b) => a + b, 0);
        return sum / validPrices.length;
    }

    // دالة لحساب تباين السعر
    function calculatePriceVariance(posts) {
        if (!Array.isArray(posts) || posts.length === 0) return 0;
        const average = calculateAveragePrice(posts);
        const validPrices = posts
            .map(post => post.price)
            .filter(price => typeof price === 'number' && !isNaN(price));
        if (validPrices.length === 0) return 0;
        const squaredDiffs = validPrices.map(price => Math.pow(price - average, 2));
        const sumSquaredDiffs = squaredDiffs.reduce((a, b) => a + b, 0);
        return sumSquaredDiffs / validPrices.length;
    }

    // تصدير الوظائف العامة
    window.feature16Logic = {
        isValidDate,
        calculateAveragePrice,
        calculatePriceVariance
    };
})();