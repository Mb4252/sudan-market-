// public/modules/feature-89-ui.js
(function() {
    'use strict';

    // التحقق من وجود العنصر قبل الإسناد
    const feature89Container = document.getElementById('feature-89-container');
    if (feature89Container) {
        feature89Container.textContent = 'ميزة 89 - واجهة المستخدم';
    } else {
        console.warn('عنصر ميزة 89 غير موجود في DOM');
    }

    // إضافة معالج حدث آمن
    const feature89Button = document.getElementById('feature-89-button');
    if (feature89Button) {
        feature89Button.addEventListener('click', function() {
            if (typeof window.feature89Logic === 'function') {
                window.feature89Logic();
            } else {
                console.error('دالة منطق ميزة 89 غير متاحة');
            }
        });
    }

    // تسجيل الميزة في النظام
    if (window.moduleRegistry) {
        window.moduleRegistry.register('feature-89-ui', {
            version: '1.0.0',
            dependencies: ['feature-89-logic']
        });
    }
})();