/**
 * sdm-module-70.js
 * وظيفته: حفظ وتحديث بيانات المستخدم في localStorage مع عرضها في واجهة المستخدم.
 * - تخزين اسم المستخدم في localStorage.
 * - عرض اسم المستخدم في واجهة المستخدم عند تغييره.
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'sdm-user-name';
    const USER_NAME_INPUT = document.getElementById('sdm-name');
    const USER_NAME_DISPLAY = document.querySelector('.header h1');

    // حفظ اسم المستخدم في localStorage
    function saveUserName(name) {
        try {
            if (!name || typeof name !== 'string') return false;
            localStorage.setItem(STORAGE_KEY, name);
            return true;
        } catch (error) {
            console.error('Error saving user name:', error);
            return false;
        }
    }

    // جلب اسم المستخدم من localStorage
    function getUserName() {
        try {
            const name = localStorage.getItem(STORAGE_KEY);
            return name || '';
        } catch (error) {
            console.error('Error getting user name:', error);
            return '';
        }
    }

    // تحديث عرض اسم المستخدم في واجهة المستخدم
    function updateUserNameDisplay() {
        const name = getUserName();
        if (USER_NAME_DISPLAY && USER_NAME_INPUT) {
            USER_NAME_DISPLAY.textContent = `سوق السودان - ${name || 'المستخدم'} | واجهة SDM`;
            USER_NAME_INPUT.value = name;
        }
    }

    // استماع لتغيير اسم المستخدم
    if (USER_NAME_INPUT) {
        USER_NAME_INPUT.addEventListener('input', function() {
            const newName = this.value.trim();
            saveUserName(newName);
            updateUserNameDisplay();
        });
    }

    // تحديث العرض عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', updateUserNameDisplay);

})();