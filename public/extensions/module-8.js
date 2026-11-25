(function() {
    'use strict';

    // دالة مساعدة للتحقق من وجود العنصر قبل الإسناد
    function safeSetTextContent(elementId, text) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = text;
        } else {
            console.warn(`العنصر مع معرف ${elementId} غير موجود`);
        }
    }

    // دالة مساعدة لمعالجة الأخطاء
    function handleError(error) {
        console.error('خطأ:', error);
        safeSetTextContent('status', `خطأ: ${error.message}`);
        // يمكنك إضافة المزيد من منطق معالجة الأخطاء هنا
    }

    // دالة مساعدة للتحقق من وجود العنصر قبل الإضافة
    function safeAppendChild(parentId, childElement) {
        const parent = document.getElementById(parentId);
        if (parent) {
            parent.appendChild(childElement);
        } else {
            console.warn(`العنصر الأب مع معرف ${parentId} غير موجود`);
        }
    }

    // دالة مساعدة للتحقق من وجود العنصر قبل الإزالة
    function safeRemoveChild(parentId, childId) {
        const parent = document.getElementById(parentId);
        const child = document.getElementById(childId);
        if (parent && child) {
            parent.removeChild(child);
        } else {
            console.warn(`العنصر الأب أو العنصر الابن غير موجود`);
        }
    }

    // دالة مساعدة للتحقق من وجود العنصر قبل الإضافة/الإزالة
    function safeToggleElement(elementId, shouldShow) {
        const element = document.getElementById(elementId);
        if (element) {
            element.style.display = shouldShow ? 'block' : 'none';
        } else {
            console.warn(`العنصر مع معرف ${elementId} غير موجود`);
        }
    }

    // تصدير الوظائف
    window.module8 = {
        safeSetTextContent,
        handleError,
        safeAppendChild,
        safeRemoveChild,
        safeToggleElement
    };
})();