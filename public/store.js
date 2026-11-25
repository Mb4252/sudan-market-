(function() {
    'use strict';

    const store = new Proxy({
        posts: [],
        status: 'جاهز',
        radarData: null,
        compareData: null
    }, {
        set(target, key, value) {
            target[key] = value;
            document.dispatchEvent(new CustomEvent('storeUpdated', { detail: target }));
            return true;
        }
    });

    function isValidDate(date) {
        return date instanceof Date && !isNaN(date);
    }

    function formatDate(date) {
        if (!isValidDate(date)) {
            date = new Date();
        }
        return date.toLocaleString('ar-SD', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    window.store = store;
    window.isValidDate = isValidDate;
    window.formatDate = formatDate;
})();