(function() {
    'use strict';

    const store = {
        posts: [],
        status: 'جاهز'
    };

    const eventTarget = new EventTarget();

    function updateStore(newData) {
        Object.assign(store, newData);
        eventTarget.dispatchEvent(new CustomEvent('storeUpdated', { detail: store }));
    }

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

    window.store = {
        get: () => store,
        update: updateStore,
        isValidDate,
        formatDate,
        on: (event, callback) => eventTarget.addEventListener(event, callback)
    };
})();