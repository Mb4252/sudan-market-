// public/modules/live-4-logic.js
(function() {
    'use strict';

    // دالة معالجة المنشورات
    function processPosts(posts) {
        return posts.map(post => ({
            ...post,
            price: parseFloat(post.price),
            timestamp: new Date(post.timestamp)
        })).filter(post => window.store.isValidDate(post.timestamp));
    }

    // دالة معالجة المقارنات
    function processComparisons(comparisons) {
        return comparisons.map(comparison => ({
            ...comparison,
            price: parseFloat(comparison.price)
        }));
    }

    // دالة معالجة البيانات المحسّنة
    function processEnhancedData(data) {
        return data.map(item => ({
            ...item,
            value: parseFloat(item.value)
        }));
    }

    // دالة تحديث الواجهة
    function updateUI(posts, comparisons, enhancedData) {
        window.ui.renderPosts(posts);
        window.ui.renderComparisons(comparisons);
        window.ui.renderEnhancedData(enhancedData);
    }

    // دالة تحديث البيانات
    async function updateData() {
        try {
            const posts = await window.api.fetchPosts();
            const comparisons = await window.api.fetchCompareData();
            const enhancedData = await window.api.fetchRadarData();

            const processedPosts = processPosts(posts);
            const processedComparisons = processComparisons(comparisons);
            const processedEnhancedData = processEnhancedData(enhancedData);

            updateUI(processedPosts, processedComparisons, processedEnhancedData);
        } catch (error) {
            console.error('خطأ في تحديث البيانات:', error);
        }
    }

    // تصدير الواجهات العامة
    window.logic = {
        updateData
    };
})();