// ===== filters.js ===== 
(function() {
    'use strict';

    // DOM Elements (مع التحقق من وجود العنصر)
    const searchInput = document.getElementById('searchInput');
    const priceRangeSlider = document.getElementById('priceRangeSlider');
    const cityFilter = document.getElementById('cityFilter');
    const postsContainer = document.getElementById('postsContainer');

    // متغيرات حالة
    let activeFilters = {
        searchTerm: '',
        minPrice: 0,
        maxPrice: Infinity,
        selectedCity: null
    };

    // تحميل تصفية فورية
    function applyFilters() {
        const { searchTerm, minPrice, maxPrice, selectedCity } = activeFilters;
        const posts = window.store.getPosts();

        const filteredPosts = posts.filter(post => {
            const matchesSearch = !searchTerm || 
                post.content.toLowerCase().includes(searchTerm.toLowerCase()) || 
                post.city.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesPrice = !minPrice || !maxPrice || 
                (post.price >= minPrice && post.price <= maxPrice);

            const matchesCity = !selectedCity || post.city === selectedCity;
            return matchesSearch && matchesPrice && matchesCity;
        });

        renderPosts(filteredPosts);
    }

    // تحديث حالة التصفية
    function updateFilters() {
        activeFilters = {
            searchTerm: searchInput?.value || '',
            minPrice: parseInt(priceRangeSlider?.min || 0),
            maxPrice: parseInt(priceRangeSlider?.max || Infinity),
            selectedCity: cityFilter?.value || null
        };
        applyFilters();
    }

    // إعداد المستمعين
    if (searchInput) {
        searchInput.addEventListener('input', updateFilters);
    }

    if (priceRangeSlider) {
        priceRangeSlider.addEventListener('input', updateFilters);
    }

    if (cityFilter) {
        cityFilter.addEventListener('change', updateFilters);
    }

    // تحميل تصفية عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', applyFilters);

    // تصدير الوظائف
    window.filters = {
        applyFilters,
        updateFilters
    };

})();