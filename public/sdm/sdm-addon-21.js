// sdm-addon-21.js
// ميزة جديدة: حفظ هوية المستخدم في localStorage

(function() {
    'use strict';

    try {
        // التحقق من وجود حقل الهوية
        const identityInput = document.getElementById('user-identity');
        if (!identityInput) return;

        // استرجاع الهوية المحفوظة
        const savedIdentity = localStorage.getItem('sdmUserIdentity');
        if (savedIdentity) {
            identityInput.value = savedIdentity;
        }

        // حفظ الهوية عند تغييرها
        identityInput.addEventListener('change', function() {
            localStorage.setItem('sdmUserIdentity', this.value);
        });
    } catch (e) {
        console.error('SDM Addon 21 Error:', e);
    }
})();
