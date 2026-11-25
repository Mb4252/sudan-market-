(function() {
    'use strict';

    const store = {
        posts: [],
        status: 'غير متزامن',
        radarData: null,
        compareData: null
    };

    const eventTarget = new EventTarget();

    const reactiveStore = new Proxy(store, {
        set(target, property, value) {
            target[property] = value;
            eventTarget.dispatchEvent(new CustomEvent('storeUpdated', { detail: store }));
            return true;
        }
    });

    function isValidDate(date) {
        return date instanceof Date && !isNaN(date);
    }

    function formatDate(date) {
        if (!isValidDate(date)) {
            return 'الآن';
        }
        return date.toLocaleString('ar-SD', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    window.store = reactiveStore;
    window.isValidDate = isValidDate;
    window.formatDate = formatDate;
})();