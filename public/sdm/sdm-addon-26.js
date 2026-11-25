// sdm-addon-26.js
// ميزة جديدة: حفظ وتحميل هوية المستخدم في localStorage

(function() {
    'use strict';

    // مفتاح التخزين
    const USER_IDENTITY_KEY = 'sdmUserIdentity';

    // دالة لحفظ هوية المستخدم
    function saveUserIdentity(identity) {
        try {
            if (!identity || typeof identity !== 'string') {
                console.error('Invalid user identity');
                return false;
            }

            localStorage.setItem(USER_IDENTITY_KEY, identity);
            return true;
        } catch (error) {
            console.error('Error saving user identity:', error);
            return false;
        }
    }

    // دالة لتحميل هوية المستخدم
    function loadUserIdentity() {
        try {
            return localStorage.getItem(USER_IDENTITY_KEY) || '';
        } catch (error) {
            console.error('Error loading user identity:', error);
            return '';
        }
    }

    // دالة لتحديث واجهة المستخدم
    function updateUI() {
        try {
            const identityInput = document.getElementById('user-identity-input');
            const currentIdentity = loadUserIdentity();

            if (identityInput) {
                identityInput.value = currentIdentity;
            }

            // تحديث أي عناصر أخرى في الواجهة
            const identityDisplay = document.getElementById('user-identity-display');
            if (identityDisplay) {
                identityDisplay.textContent = currentIdentity || 'غير محدد';
            }
        } catch (error) {
            console.error('Error updating UI:', error);
        }
    }

    // تهيئة الميزة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        updateUI();

        // إضافة معالج لحفظ الهوية عند تغيير الحقل
        const identityInput = document.getElementById('user-identity-input');
        if (identityInput) {
            identityInput.addEventListener('change', function() {
                saveUserIdentity(this.value);
                updateUI();
            });
        }
    });

    // تصدير الدوال للوصول العام
    window.sdmUserIdentity = {
        save: saveUserIdentity,
        load: loadUserIdentity,
        updateUI: updateUI
    };
})();