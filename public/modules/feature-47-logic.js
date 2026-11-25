(function() {
    'use strict';

    async function analyzeCityTrends(city) {
        try {
            const posts = await window.api.fetchPosts();
            const cityPosts = posts.filter(post => post.city === city);

            if (cityPosts.length < 2) {
                throw new Error('لا يوجد بيانات كافية لتحليل الاتجاهات');
            }

            const prices = cityPosts.map(post => post.price);
            const timestamps = cityPosts.map(post => new Date(post.timestamp).getTime());

            const trend = calculateTrend(timestamps, prices);
            const confidence = calculateConfidence(cityPosts.length, prices);

            return {
                city,
                trend,
                confidence,
                chart: generateChart(prices)
            };
        } catch (error) {
            throw new Error(`خطأ في تحليل الاتجاهات: ${error.message}`);
        }
    }

    function calculateTrend(timestamps, prices) {
        const n = timestamps.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

        for (let i = 0; i < n; i++) {
            sumX += timestamps[i];
            sumY += prices[i];
            sumXY += timestamps[i] * prices[i];
            sumX2 += timestamps[i] * timestamps[i];
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        return slope > 0 ? 'ارتفاع' : slope < 0 ? 'هبوط' : 'ثابت';
    }

    function calculateConfidence(dataSize, prices) {
        const variance = calculateVariance(prices);
        return Math.min(100, (dataSize / 10) * (1 - variance / Math.max(...prices)) * 100);
    }

    function calculateVariance(values) {
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        return values.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / values.length;
    }

    function generateChart(prices) {
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const normalizedPrices = prices.map(p => Math.floor((p - minPrice) / (maxPrice - minPrice) * 10));

        let chart = '';
        for (let i = 9; i >= 0; i--) {
            let row = '';
            for (const price of normalizedPrices) {
                row += price >= i ? '■ ' : '  ';
            }
            chart += row + '\n';
        }

        return chart;
    }

    window.feature47Logic = {
        analyzeCityTrends
    };
})();