// sdm-addon-17.js
// ميزة جديدة: حفظ وتحميل هوية المستخدم تلقائياً

(function() {
    'use strict';

    // مفتاح تخزين الهوية في localStorage
    const USER_ID_KEY = 'sdmUserIdentity';

    // دالة لحفظ الهوية
    function saveUserIdentity(identity) {
        try {
            if (identity && typeof identity === 'string' && identity.trim() !== '') {
                localStorage.setItem(USER_ID_KEY, identity.trim());
                return true;
            }
            return false;
        } catch (e) {
            console.error('Error saving user identity:', e);
            return false;
        }
    }

    // دالة تحميل الهوية
    function loadUserIdentity() {
        try {
            const identity = localStorage.getItem(USER_ID_KEY);
            return identity || '';
        } catch (e) {
            console.error('Error loading user identity:', e);
            return '';
        }
    }

    // دالة تهيئة الميزة
    function init() {
        try {
            const identityInput = document.getElementById('user-identity');
            if (!identityInput) return;

            // تحميل الهوية المحفوظة
            const savedIdentity = loadUserIdentity();
            if (savedIdentity) {
                identityInput.value = savedIdentity;
            }

            // حفظ الهوية عند التغيير
            identityInput.addEventListener('change', function() {
                saveUserIdentity(this.value);
            });

        } catch (e) {
            console.error('Error initializing user identity feature:', e);
        }
    }

    // تهيئة الميزة عند تحميل الصفحة
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('DOMContentLoaded', init);
    }

})();