// public/analytics/filter-engine.js
(function() {
    'use strict';

    function initFilterEngine() {
        const searchInput = document.getElementById('searchInput');
        const cityFilter = document.getElementById('cityFilter');
        const priceFilter = document.getElementById('priceFilter');

        if (!searchInput || !cityFilter || !priceFilter) {
            console.error('عناصر التصفية غير موجودة في DOM');
            return;
        }

        let currentFilters = {
            searchTerm: '',
            city: 'all',
            priceRange: 'all'
        };

        function applyFilters() {
            const posts = window.store.getState().posts;

            const filteredPosts = posts.filter(post => {
                // فلترة حسب البحث
                if (currentFilters.searchTerm &&
                    !post.content.toLowerCase().includes(currentFilters.searchTerm.toLowerCase()) &&
                    !post.author.toLowerCase().includes(currentFilters.searchTerm.toLowerCase())) {
                    return false;
                }

                // فلترة حسب المدينة
                if (currentFilters.city !== 'all' && post.city !== currentFilters.city) {
                    return false;
                }

                // فلترة حسب السعر
                if (currentFilters.priceRange !== 'all') {
                    const [min, max] = currentFilters.priceRange.split('-').map(Number);
                    if (post.price < min || (max && post.price > max)) {
                        return false;
                    }
                }

                return true;
            });

            window.store.dispatch({ type: 'FILTER_POSTS', payload: filteredPosts });
        }

        searchInput.addEventListener('input', (e) => {
            currentFilters.searchTerm = e.target.value;
            applyFilters();
        });

        cityFilter.addEventListener('change', (e) => {
            currentFilters.city = e.target.value;
            applyFilters();
        });

        priceFilter.addEventListener('change', (e) => {
            currentFilters.priceRange = e.target.value;
            applyFilters();
        });
    }

    window.initFilterEngine = initFilterEngine;
})();