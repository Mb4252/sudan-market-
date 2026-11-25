(function() {
    'use strict';

    const store = new Proxy({
        posts: [],
        status: 'جاهز'
    }, {
        set(target, key, value) {
            target[key] = value;
            document.dispatchEvent(new CustomEvent('storeUpdated', { detail: target }));
            return true;
        }
    });

    window.store = store;

    function isValidDate(date) {
        return date instanceof Date && !isNaN(date);
    }

    window.isValidDate = isValidDate;
})();