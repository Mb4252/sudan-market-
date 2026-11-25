(function() {
    'use strict';

    function analyzeTrends() {
        const posts = window.store.getState().posts;
        const cityTrends = {};

        // تحليل الاتجاهات لكل مدينة
        posts.forEach(post => {
            if (!cityTrends[post.city]) {
                cityTrends[post.city] = {
                    prices: [],
                    timestamps: []
                };
            }

            cityTrends[post.city].prices.push(post.price);
            cityTrends[post.city].timestamps.push(new Date(post.timestamp).getTime());
        });

        // حساب الانحدار الخطي لكل مدينة
        const trendResults = {};
        for (const city in cityTrends) {
            const { prices, timestamps } = cityTrends[city];
            if (prices.length < 2) {
                trendResults[city] = 'غير كافٍ'; // لا يمكن حساب الانحدار مع أقل من نقطتين
                continue;
            }

            const n = prices.length;
            const sumX = timestamps.reduce((a, b) => a + b, 0);
            const sumY = prices.reduce((a, b) => a + b, 0);
            const sumXY = timestamps.reduce((sum, timestamp, i) => sum + timestamp * prices[i], 0);
            const sumX2 = timestamps.reduce((sum, timestamp) => sum + timestamp * timestamp, 0);

            const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
            trendResults[city] = slope > 0 ? 'ارتفاع' : slope < 0 ? 'هبوط' : 'ثابت';
        }

        // عرض النتائج في واجهة المستخدم
        const resultsContainer = document.getElementById('feature-69-results');
        if (resultsContainer) {
            resultsContainer.innerHTML = '<h3>نتائج تحليل الاتجاهات:</h3>' +
                Object.entries(trendResults).map(([city, trend]) =>
                    `<p>${city}: ${trend}</p>`
                ).join('');
        }
    }

    window.feature69Logic = {
        analyzeTrends
    };
})();