// public/modules/live-4-ui.js
(function() {
    'use strict';

    // دالة للتحقق من وجود العنصر قبل الإسناد
    function safeSetTextContent(selector, text) {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = text;
        } else {
            console.warn(`Element not found: ${selector}`);
        }
    }

    // دالة عرض المنشورات
    function renderPosts(posts) {
        const postsContainer = document.getElementById('postsContainer');
        if (!postsContainer) return;

        postsContainer.innerHTML = '';
        posts.forEach(post => {
            const postElement = document.createElement('div');
            postElement.className = 'post';

            // إنشاء عناصر المنشور مع التحقق من وجودها
            const authorElement = document.createElement('div');
            authorElement.className = 'post-author';
            safeSetTextContent('.post-author', post.author);

            const contentElement = document.createElement('div');
            contentElement.className = 'post-content';
            safeSetTextContent('.post-content', post.content);

            const priceElement = document.createElement('div');
            priceElement.className = 'post-price';
            safeSetTextContent('.post-price', post.price);

            const cityElement = document.createElement('div');
            cityElement.className = 'post-city';
            safeSetTextContent('.post-city', post.city);

            postElement.appendChild(authorElement);
            postElement.appendChild(contentElement);
            postElement.appendChild(priceElement);
            postElement.appendChild(cityElement);

            postsContainer.appendChild(postElement);
        });
    }

    // دالة عرض المقارنات
    function renderComparisons(comparisons) {
        const comparisonsContainer = document.getElementById('comparisonsContainer');
        if (!comparisonsContainer) return;

        comparisonsContainer.innerHTML = '';
        comparisons.forEach(comparison => {
            const comparisonElement = document.createElement('div');
            comparisonElement.className = 'comparison';

            // إنشاء عناصر المقارنة مع التحقق من وجودها
            const productElement = document.createElement('div');
            productElement.className = 'comparison-product';
            safeSetTextContent('.comparison-product', comparison.product);

            const priceElement = document.createElement('div');
            priceElement.className = 'comparison-price';
            safeSetTextContent('.comparison-price', comparison.price);

            const cityElement = document.createElement('div');
            cityElement.className = 'comparison-city';
            safeSetTextContent('.comparison-city', comparison.city);

            comparisonElement.appendChild(productElement);
            comparisonElement.appendChild(priceElement);
            comparisonElement.appendChild(cityElement);

            comparisonsContainer.appendChild(comparisonElement);
        });
    }

    // دالة عرض البيانات المحسّنة
    function renderEnhancedData(data) {
        const enhancedDataContainer = document.getElementById('enhancedDataContainer');
        if (!enhancedDataContainer) return;

        enhancedDataContainer.innerHTML = '';
        data.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.className = 'enhanced-item';

            // إنشاء عناصر البيانات المحسّنة مع التحقق من وجودها
            const nameElement = document.createElement('div');
            nameElement.className = 'enhanced-name';
            safeSetTextContent('.enhanced-name', item.name);

            const valueElement = document.createElement('div');
            valueElement.className = 'enhanced-value';
            safeSetTextContent('.enhanced-value', item.value);

            itemElement.appendChild(nameElement);
            itemElement.appendChild(valueElement);

            enhancedDataContainer.appendChild(itemElement);
        });
    }

    // تصدير الواجهات العامة
    window.ui = {
        renderPosts,
        renderComparisons,
        renderEnhancedData
    };
})();