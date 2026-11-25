// sdm-module-243.js
// وظيفة: تحديث قائمة المنشورات المحفوظة في localStorage مع عرض آخر تحديث في DOM.
(function() {
    'use strict';

    // التحقق من وجود العنصر DOM المطلوب
    const container = document.getElementById('sdm-module-243');
    if (!container) return;

    try {
        // استيراد الدوال الآمنة من core
        if (!window.safeSetTextContent || !window.isValidDate) {
            throw new Error('Required core functions missing');
        }

        // جلب المنشورات المحفوظة
        const posts = JSON.parse(localStorage.getItem('sudanMarketPosts') || '[]');

        // حساب آخر تحديث
        const lastUpdated = posts.length > 0
            ? new Date(Math.max(...posts.map(p => new Date(p.updatedAt).getTime())))
            : new Date(0);

        // عرض آخر تحديث في DOM
        if (window.safeSetTextContent(container, `Last updated: ${window.safeFormatDate(lastUpdated)}`)) {
            console.log('SDM Module 243: Updated successfully');
        } else {
            console.error('SDM Module 243: Failed to update DOM');
        }
    } catch (error) {
        console.error('SDM Module 243 Error:', error);
    }
})();