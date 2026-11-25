(function() {
    'use strict';

    // التحقق من صحة التاريخ
    function isValidDate(date) {
        return date instanceof Date && !isNaN(date);
    }

    // حفظ البيانات في localStorage
    function saveToLocalStorage(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            console.error('خطأ في حفظ البيانات:', error);
        }
    }

    // تحميل البيانات من localStorage
    function loadFromLocalStorage(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('خطأ في تحميل البيانات:', error);
            return null;
        }
    }

    window.isValidDate = isValidDate;
    window.saveToLocalStorage = saveToLocalStorage;
    window.loadFromLocalStorage = loadFromLocalStorage;
})();