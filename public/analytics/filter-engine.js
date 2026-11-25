(function() {
    'use strict';

    // دالة للتحقق من وجود عنصر DOM
    function elementExists(selector) {
        return document.querySelector(selector) !== null;
    }

    // دالة للتصفية
    function filterPosts(posts, filters) {
        return posts.filter(post => {
            // تصفية حسب المدينة
            if (filters.city && post.city !== filters.city) return false;
            // تصفية حسب السعر
            if (filters.minPrice && post.price < filters.minPrice) return false;
            if (filters.maxPrice && post.price > filters.maxPrice) return false;
            // تصفية حسب التاريخ
            if (filters.startDate && new Date(post.timestamp) < new Date(filters.startDate)) return false;
            if (filters.endDate && new Date(post.timestamp) > new Date(filters.endDate)) return false;
            return true;
        });
    }

    // دالة للبحث
    function searchPosts(posts, query) {
        if (!query) return posts;
        return posts.filter(post =>
            post.content.includes(query) ||
            post.author.includes(query) ||
            post.city.includes(query)
        );
    }

    // دالة تحديث واجهة البحث
    function updateSearchUI() {
        if (elementExists('#searchInput') && elementExists('#searchBtn')) {
            const searchInput = document.getElementById('searchInput');
            const searchBtn = document.getElementById('searchBtn');

            searchBtn.addEventListener('click', () => {
                const query = searchInput.value.trim();
                const posts = window.store.getState().posts;
                const filteredPosts = searchPosts(posts, query);
                window.store.dispatch({ type: 'UPDATE_FILTERED_POSTS', payload: filteredPosts });
            });
        }
    }

    // دالة تحديث واجهة التصفية
    function updateFilterUI() {
        if (elementExists('#cityFilter') && elementExists('#minPriceFilter') && elementExists('#maxPriceFilter') && elementExists('#startDateFilter') && elementExists('#endDateFilter') && elementExists('#filterBtn')) {
            const cityFilter = document.getElementById('cityFilter');
            const minPriceFilter = document.getElementById('minPriceFilter');
            const maxPriceFilter = document.getElementById('maxPriceFilter');
            const startDateFilter = document.getElementById('startDateFilter');
            const endDateFilter = document.getElementById('endDateFilter');
            const filterBtn = document.getElementById('filterBtn');

            filterBtn.addEventListener('click', () => {
                const filters = {
                    city: cityFilter.value.trim(),
                    minPrice: parseFloat(minPriceFilter.value),
                    maxPrice: parseFloat(maxPriceFilter.value),
                    startDate: startDateFilter.value,
                    endDate: endDateFilter.value
                };
                const posts = window.store.getState().posts;
                const filteredPosts = filterPosts(posts, filters);
                window.store.dispatch({ type: 'UPDATE_FILTERED_POSTS', payload: filteredPosts });
            });
        }
    }

    // تحديث واجهة البحث والتصفية عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', () => {
        updateSearchUI();
        updateFilterUI();
    });

    // تصدير الدوال
    window.filterEngine = {
        filterPosts,
        searchPosts
    };
})();