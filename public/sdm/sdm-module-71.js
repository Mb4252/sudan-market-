// public/sdm/sdm-module-71.js
(function() {
    'use strict';

    // مفتاح التخزين في localStorage
    const USER_NAME_KEY = 'sdmUserName';

    // دالة لتخزين اسم المستخدم
    function saveUserName(name) {
        try {
            if (name && typeof name === 'string') {
                localStorage.setItem(USER_NAME_KEY, name);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error saving user name:', error);
            return false;
        }
    }

    // دالة لاسترجاع اسم المستخدم
    function getUserName() {
        try {
            return localStorage.getItem(USER_NAME_KEY) || '';
        } catch (error) {
            console.error('Error getting user name:', error);
            return '';
        }
    }

    // تحديث واجهة المستخدم
    function updateUI() {
        const nameInput = document.getElementById('sdm-name');
        if (nameInput) {
            const savedName = getUserName();
            if (savedName) {
                nameInput.value = savedName;
            }

            // تحديث اسم المستخدم عند تغييره
            nameInput.addEventListener('change', function() {
                saveUserName(this.value);
            });
        }
    }

    // تنفيذ التحديث عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', updateUI);

    // ربط الدوال مع النافذة العالمية
    window.sdmUserStorage = {
        saveUserName,
        getUserName
    };
})();