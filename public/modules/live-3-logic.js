// public/modules/live-3-logic.js
(function() {
    'use strict';

    // دالة معالجة المنشورات
    function processPosts(posts) {
        return posts.map(post => ({
            ...post,
            timestamp: new Date(post.timestamp)
        })).filter(post => window.store.isValidDate(post.timestamp));
    }

    // دالة معالجة بيانات المقارنة
    function processCompareData(compareData) {
        return compareData.map(item => ({
            ...item,
            averagePrice: parseFloat(item.averagePrice).toFixed(2)
        }));
    }

    // دالة معالجة بيانات الرادار
    function processRadarData(radarData) {
        return {
            ...radarData,
            averagePrice: parseFloat(radarData.averagePrice).toFixed(2)
        };
    }

    // دالة معالجة إحصائيات السوق
    function processMarketStats(stats) {
        return {
            ...stats,
            averagePrice: parseFloat(stats.averagePrice).toFixed(2),
            maxPrice: parseFloat(stats.maxPrice).toFixed(2),
            minPrice: parseFloat(stats.minPrice).toFixed(2)
        };
    }

    // دالة معالجة التنبؤات
    function processForecast(forecast) {
        return {
            ...forecast,
            predictedPrice: parseFloat(forecast.predictedPrice).toFixed(2),
            confidenceLevel: parseFloat(forecast.confidenceLevel).toFixed(2)
        };
    }

    // تصدير المنطق
    window.logic = {
        processPosts,
        processCompareData,
        processRadarData,
        processMarketStats,
        processForecast
    };
})();