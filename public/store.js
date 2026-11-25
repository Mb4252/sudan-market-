(function() {
    'use strict';

    const store = {
        posts: [],
        status: 'متصل',
        totalPosts: 0,
        avgPrice: 0,
        activeCities: 0
    };

    function updateStore(newData) {
        Object.assign(store, newData);
        document.dispatchEvent(new CustomEvent('storeUpdated', { detail: store }));
    }

    window.store = {
        get: () => ({...store}),
        update: updateStore
    };
})();