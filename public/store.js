(function() {
    'use strict';

    function isValidDate(date) {
        return date instanceof Date && !isNaN(date.getTime());
    }

    function formatDate(date) {
        if (!isValidDate(date)) {
            date = new Date();
        }
        return date.toLocaleString('ar-EG');
    }

    const store = new Proxy({
        posts: [],
        status: 'جاهز'
    }, {
        set(target, prop, value) {
            target[prop] = value;
            document.dispatchEvent(new CustomEvent('storeUpdated', {
                detail: target
            }));
            return true;
        }
    });

    window.store = store;
    window.formatDate = formatDate;
    window.isValidDate = isValidDate;
})();