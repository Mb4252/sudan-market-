(function() {
    'use strict';

    // دالة مقارنة العروض
    function compareOffers(posts) {
        if (!Array.isArray(posts) || posts.length === 0) return [];

        // تصفية المنشورات التي تحتوي على سعر
        const pricedPosts = posts.filter(post => {
            const price = parseFloat(post.price);
            return !isNaN(price) && price > 0;
        });

        // ترتيب المنشورات حسب السعر (من الأقل إلى الأعلى)
        const sortedPosts = [...pricedPosts].sort((a, b) => parseFloat(a.price) - parseFloat(b.price));

        // إرجاع أفضل 3 عروض
        return sortedPosts.slice(0, 3);
    }

    // دالة مقارنة العروض حسب المدينة
    function compareOffersByCity(posts, city) {
        if (!Array.isArray(posts) || posts.length === 0 || !city) return [];

        // تصفية المنشورات حسب المدينة
        const cityPosts = posts.filter(post => post.city === city);

        // مقارنة العروض في المدينة
        return compareOffers(cityPosts);
    }

    window.compareEngine = {
        compareOffers,
        compareOffersByCity
    };
})();