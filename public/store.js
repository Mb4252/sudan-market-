(function() {
    'use strict';

    // التحقق من صحة التاريخ
    function isValidDate(date) {
        return date instanceof Date && !isNaN(date);
    }

    // تنسيق التاريخ مع التحقق
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

    // حفظ البيانات في localStorage
    function saveToLocalStorage(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.error('خطأ في حفظ البيانات:', e);
        }
    }

    // تحميل البيانات من localStorage
    function loadFromLocalStorage(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('خطأ في تحميل البيانات:', e);
            return null;
        }
    }

    // إنشاء متجر تفاعلي
    const store = new Proxy({
        posts: [],
        status: 'جاهز',
        radarData: [],
        compareData: []
    }, {
        set(target, key, value) {
            target[key] = value;
            saveToLocalStorage('store', target);
            document.dispatchEvent(new CustomEvent('storeUpdated', { detail: target }));
            return true;
        }
    });

    // تحميل البيانات المحفوظة
    const savedStore = loadFromLocalStorage('store');
    if (savedStore) {
        Object.assign(store, savedStore);
    }

    window.store = store;
    window.isValidDate = isValidDate;
    window.formatDate = formatDate;
})();