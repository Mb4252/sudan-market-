// public/sdm/sdm-module-199.js
(function() {
    'use strict';

    // دالة التهيئة الرئيسية
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            if (!document.getElementById('sdm-chat')) {
                console.warn('SDM chat UI not found, skipping module 199');
                return;
            }

            // تنفيذ الوظيفة الرئيسية
            mainFunction();
        } catch (error) {
            console.error('Error in SDM Module 199:', error);
        }
    }

    // الوظيفة الرئيسية: عرض عدد المنشورات المحفوظة في localStorage
    function mainFunction() {
        // جلب المنشورات من localStorage
        const posts = window.getAllPosts ? window.getAllPosts() : [];

        // إنشاء عنصر لعرض العدد
        const counterElement = document.createElement('div');
        counterElement.id = 'sdm-posts-counter';
        counterElement.style.position = 'fixed';
        counterElement.style.bottom = '10px';
        counterElement.style.right = '10px';
        counterElement.style.padding = '5px 10px';
        counterElement.style.backgroundColor = '#f0f0f0';
        counterElement.style.borderRadius = '5px';
        counterElement.style.zIndex = '1000';

        // تحديث العدد
        function updateCounter() {
            const count = posts.length;
            counterElement.textContent = `Posts: ${count}`;
        }

        // تحديث العداد عند تغيير المنشورات
        if (window.addEventListener) {
            window.addEventListener('storage', updateCounter);
        }

        // إضافة العنصر إلى الواجهة
        document.body.appendChild(counterElement);
        updateCounter();
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }
})();