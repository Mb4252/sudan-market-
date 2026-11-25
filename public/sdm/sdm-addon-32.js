// public/sdm/sdm-addon-32.js
(function() {
    'use strict';

    // دالة لجلب هوية المستخدم من localStorage
    function getUserIdentity() {
        try {
            return localStorage.getItem('userIdentity') || 'مستخدم مجهول';
        } catch (e) {
            console.error('Error getting user identity:', e);
            return 'مستخدم مجهول';
        }
    }

    // دالة لتحديث هوية المستخدم في واجهة الدردشة
    function updateUserIdentityUI() {
        try {
            const identityElement = document.getElementById('user-identity');
            if (identityElement) {
                identityElement.value = getUserIdentity();
            }
        } catch (e) {
            console.error('Error updating user identity UI:', e);
        }
    }

    // دالة لحفظ هوية المستخدم عند تغييرها
    function saveUserIdentity() {
        try {
            const identityElement = document.getElementById('user-identity');
            if (identityElement) {
                localStorage.setItem('userIdentity', identityElement.value);
            }
        } catch (e) {
            console.error('Error saving user identity:', e);
        }
    }

    // تهيئة الميزة عند تحميل الصفحة
    function init() {
        try {
            // تحديث واجهة المستخدم عند التحميل
            updateUserIdentityUI();

            // إضافة مستمع للحدث عند تغيير هوية المستخدم
            const identityElement = document.getElementById('user-identity');
            if (identityElement) {
                identityElement.addEventListener('change', saveUserIdentity);
            }
        } catch (e) {
            console.error('Error initializing user identity feature:', e);
        }
    }

    // تهيئة الميزة عند تحميل الصفحة
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

})();