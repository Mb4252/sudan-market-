(function() {
    'use strict';

    const store = new Proxy({
        posts: [],
        status: 'متصل'
    }, {
        set(target, property, value) {
            target[property] = value;
            if (property === 'posts' || property === 'status') {
                const event = new CustomEvent('storeUpdated', {
                    detail: {
                        posts: target.posts,
                        status: target.status
                    }
                });
                window.dispatchEvent(event);
            }
            return true;
        }
    });

    function isValidDate(date) {
        return date instanceof Date && !isNaN(date);
    }

    window.store = store;
    window.store.isValidDate = isValidDate;

    // إضافة طريقة on للاشتراك في الأحداث
    window.store.on = function(eventName, callback) {
        window.addEventListener(eventName, callback);
    };
})();