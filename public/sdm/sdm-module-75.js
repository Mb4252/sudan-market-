// sdm-module-75.js
(function() {
    'use strict';

    // مفتاح تخزين الاسم الشخصي
    const STORAGE_KEY = 'sdm_user_name';

    // دالة لحفظ الاسم في localStorage
    function saveUserName(name) {
        try {
            localStorage.setItem(STORAGE_KEY, name || '');
            return true;
        } catch (e) {
            console.error('Failed to save name:', e);
            return false;
        }
    }

    // دالة لقراءة الاسم من localStorage
    function getUserName() {
        try {
            return localStorage.getItem(STORAGE_KEY) || '';
        } catch (e) {
            console.error('Failed to read name:', e);
            return '';
        }
    }

    // دالة لتحديث الاسم في الواجهة
    function updateNameDisplay(name) {
        try {
            const nameInput = document.getElementById('sdm-name');
            if (nameInput) {
                nameInput.value = name;
            }
        } catch (e) {
            console.error('Failed to update name display:', e);
        }
    }

    // تحديث الاسم عند تغييره
    function handleNameChange() {
        const nameInput = document.getElementById('sdm-name');
        if (!nameInput) return;

        nameInput.addEventListener('input', (e) => {
            const newName = e.target.value.trim();
            saveUserName(newName);
            updateNameDisplay(newName);
        });
    }

    // تهيئة الواجهة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', () => {
        try {
            const savedName = getUserName();
            updateNameDisplay(savedName);
            handleNameChange();
        } catch (e) {
            console.error('Initialization error:', e);
        }
    });

    // تصدير الوظائف العامة
    window.sdmModule75 = {
        saveUserName,
        getUserName,
        updateNameDisplay
    };
})();