// ===== analytics.js ===== 
(function() {
    'use strict';

    // DOM Elements
    const analyticsContainer = document.getElementById('analyticsContainer');
    const cityHeatmapContainer = document.getElementById('cityHeatmap');
    const priceTrendButton = document.getElementById('priceTrendButton');

    // متغيرات حالة
    let cityData = {};
    let priceTrendData = {};

    // تحميل بيانات الإحصائيات
    function loadAnalyticsData() {
        const posts = window.store.getPosts();
        calculateCityData(posts);
        renderCityHeatmap();
        renderAnalyticsSummary();
    }

    // حساب بيانات المدن
    function calculateCityData(posts) {
        cityData = posts.reduce((acc, post) => {
            const city = post.city;
            acc[city] = {
                count: (acc[city]?.count || 0) + 1,
                totalPrice: (acc[city]?.totalPrice || 0) + post.price,
                avgPrice: (acc[city]?.totalPrice || 0) + post.price / (acc[city]?.count || 1)
            };
            return acc;
        }, {});
    }

    // رسم خريطة حرارية المدن
    function renderCityHeatmap() {
        if (!cityHeatmapContainer) return;

        cityHeatmapContainer.innerHTML = '';
        const cities = Object.keys(cityData).sort((a, b) => cityData[b].count - cityData[a].count);

        cities.forEach(city => {
            const div = document.createElement('div');
            div.className = 'city-item';
            div.style.width = `${cityData[city].count * 10}px`;
            div.style.backgroundColor = getColorForCount(cityData[city].count);
            div.textContent = `${city}: ${cityData[city].count} منشورات`;
            cityHeatmapContainer.appendChild(div);
        });
    }

    // الحصول على لون بناءً على عدد المنشورات
    function getColorForCount(count) {
        if (count < 5) return '#FFD700';
        if (count < 10) return '#FFA500';
        if (count < 20) return '#FF8C00';
        return '#FF4500';
    }

    // عرض ملخص الإحصائيات
    function renderAnalyticsSummary() {
        if (!analyticsContainer) return;

        const totalPosts = Object.values(cityData).reduce((sum, cityData) => sum + cityData.count, 0);
        const totalPrice = Object.values(cityData).reduce((sum, cityData) => sum + cityData.totalPrice, 0);
        const avgPrice = totalPrice / totalPosts;

        analyticsContainer.innerHTML = `<div class='analytics-summary'>` +
            `<h3>ملخص الإحصائيات</h3>` +
            `<p>المنشورات الإجمالية: ${totalPosts}</p>` +
            `<p>المدينة الأكثر نشاطاً: ${Object.entries(cityData).sort((a, b) => b[1].count - a[1].count)[0][0]}</p>` +
            `<p>السعر المتوسط: ${avgPrice.toFixed(2)}</p>` +
            `<button id='priceTrendButton'>تحليل اتجاهات المدينة</button>` +
        `</div>`;
    }

    // تحليل اتجاهات المدينة
    function analyzePriceTrend(city) {
        if (!city || !cityHeatmapContainer) return;

        const cityPosts = window.store.getPosts().filter(post => post.city === city).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 5);
        const prices = cityPosts.map(post => post.price);

        // حساب الانحدار الخطي
        const slope = calculateSlope(prices);
        const trend = slope > 0 ? 'تزايد' : slope < 0 ? 'تناقص' : 'ثابت';

        const trendDiv = document.createElement('div');
        trendDiv.className = 'price-trend';
        trendDiv.innerHTML = `<h4>اتجاه السعر في ${city}</h4>` +
            `<p>الانحدار: ${slope.toFixed(2)}</p>` +
            `<p>اتجاه: ${trend}</p>` +
            `<p>الأسعار الأخيرة: ${prices.join(', ')}</p>`;

        cityHeatmapContainer.appendChild(trendDiv);
    }

    // حساب الانحدار الخطي
    function calculateSlope(prices) {
        if (prices.length < 2) return 0;

        const n = prices.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += prices[i];
            sumXY += i * prices[i];
            sumX2 += i * i;
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        return slope;
    }

    // إعداد المستمعين
    document.addEventListener('DOMContentLoaded', loadAnalyticsData);

    if (priceTrendButton) {
        priceTrendButton.addEventListener('click', () => {
            const selectedCity = cityFilter?.value;
            if (selectedCity) {
                analyzePriceTrend(selectedCity);
            }
        });
    }

    // تصدير الوظائف
    window.analytics = {
        loadAnalyticsData,
        renderCityHeatmap,
        analyzePriceTrend
    };

})();