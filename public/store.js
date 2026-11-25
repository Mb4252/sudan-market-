(function() {
    'use strict';

    const store = {
        posts: [],
        status: 'غير متصل'
    };

    function updateStore(newData) {
        Object.assign(store, newData);
        saveToLocalStorage(store);
        document.dispatchEvent(new CustomEvent('storeUpdated', { detail: store }));
    }

    function saveToLocalStorage(data) {
        try {
            localStorage.setItem('sudanMarketStore', JSON.stringify(data));
        } catch (e) {
            console.error('فشل حفظ في localStorage:', e);
        }
    }

    function isValidDate(date) {
        return date instanceof Date && !isNaN(date);
    }

    function formatDate(date) {
        if (!isValidDate(date)) {
            date = new Date();
        }
        return date.toLocaleString('ar-EG', { timeZone: 'Africa/Khartoum' });
    }

    window.updateStore = updateStore;
    window.formatDate = formatDate;
    window.isValidDate = isValidDate;
})();