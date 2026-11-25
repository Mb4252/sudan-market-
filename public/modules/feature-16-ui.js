(function() {
    'use strict';

    // التحقق من وجود العنصر قبل التحديث
    function safeUpdateElement(selector, content) {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = content;
        } else {
            console.warn(`Element not found: ${selector}`);
        }
    }

    // تحديث جميع العناصر التي قد تكون قد تم إنشاؤها ديناميكيًا
    function updateUI() {
        safeUpdateElement('#status', window.store.getState().status);
        safeUpdateElement('#postCount', `عدد المنشورات: ${window.store.getState().posts.length}`);
    }

    // تحديث واجهة المستخدم عند تحديث المخزن
    window.store.on('storeUpdated', updateUI);

    // تحديث واجهة المستخدم عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', updateUI);

    // تصدير الوظائف العامة
    window.feature16UI = {
        updateUI
    };
})();