(function() {
    'use strict';

    // التحقق من وجود العنصر قبل الإسناد
    function safeSetTextContent(selector, text) {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = text;
        } else {
            console.warn(`العنصر ${selector} غير موجود`);
        }
    }

    // مثال على استخدام الدالة
    function updateUI(data) {
        safeSetTextContent('#module14-status', data.status);
        safeSetTextContent('#module14-data', JSON.stringify(data, null, 2));
    }

    // تسجيل الوحدة في registry.js
    if (window.pluginRegistry) {
        window.pluginRegistry.register('module-14', {
            init: function() {
                console.log('تم تهيئة module-14');
            },
            update: function(data) {
                updateUI(data);
            }
        });
    } else {
        console.error('pluginRegistry غير متوفر');
    }

    // تصدير الدوال العامة
    window.module14 = {
        updateUI
    };
})();