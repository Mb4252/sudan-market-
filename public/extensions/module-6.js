(function() {
    'use strict';

    // التحقق من وجود العنصر قبل إسناد .textContent
    function safeSetTextContent(selector, text) {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = text;
        } else {
            console.warn(`العنصر ${selector} غير موجود`);
        }
    }

    // إضافة دالة لتحديث واجهة المستخدم بشكل آمن
    function updateUI(data) {
        safeSetTextContent('#status', data.status);
        safeSetTextContent('#latestPrice', data.latestPrice);
        safeSetTextContent('#priceTrend', data.priceTrend);
    }

    // إضافة دالة لمعالجة الأخطاء بشكل آمن
    function handleError(error) {
        console.error('خطأ في التوسيع المتقدم #6:', error);
        safeSetTextContent('#errorDisplay', error.message || 'حدث خطأ غير معروف');
    }

    // تصدير الوظائف المطلوبة
    window.module6 = {
        updateUI,
        handleError
    };
})();