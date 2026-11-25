(function() {
    'use strict';

    // دالة لمعالجة الأخطاء
    function handleError(error) {
        console.error('خطأ في وحدة التوسعة 12:', error);
        // يمكنك إضافة منطق تسجيل الأخطاء هنا
    }

    // دالة للتحقق من وجود العنصر قبل الإسناد
    function safeSetTextContent(elementId, text) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = text;
        } else {
            console.warn(`العنصر مع المعرف ${elementId} غير موجود`);
        }
    }

    // دالة للتحقق من وجود العنصر قبل الإضافة
    function safeAppendChild(parentId, childElement) {
        const parent = document.getElementById(parentId);
        if (parent) {
            parent.appendChild(childElement);
        } else {
            console.warn(`العنصر الأب مع المعرف ${parentId} غير موجود`);
        }
    }

    // تصدير الدوال
    window.module12 = {
        handleError,
        safeSetTextContent,
        safeAppendChild
    };
})();