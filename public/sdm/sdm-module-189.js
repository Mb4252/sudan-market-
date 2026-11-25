// public/sdm/sdm-module-189.js
(function() {
    'use strict';

    // دالة لتخزين البيانات في localStorage
    function saveToLocalStorage(key, data) {
        try {
            if (!key || typeof key !== 'string') {
                throw new Error('Invalid key');
            }

            if (typeof data === 'undefined') {
                throw new Error('Data is undefined');
            }

            const serializedData = JSON.stringify(data);
            localStorage.setItem(key, serializedData);
            return true;
        } catch (error) {
            console.error('Error saving to localStorage:', error);
            return false;
        }
    }

    // دالة لقراءة البيانات من localStorage
    function readFromLocalStorage(key) {
        try {
            if (!key || typeof key !== 'string') {
                throw new Error('Invalid key');
            }

            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Error reading from localStorage:', error);
            return null;
        }
    }

    // دالة لتحديث واجهة المستخدم
    function updateUI() {
        const storageStatusElement = document.getElementById('sdm-storage-status');
        if (storageStatusElement) {
            const data = readFromLocalStorage('sdmData');
            storageStatusElement.textContent = data ? 'Data loaded' : 'No data';
        }
    }

    // تنفيذ عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            updateUI();
        } catch (error) {
            console.error('Error in SDM module 189:', error);
        }
    });

    // تصدير الدوال العامة
    window.sdmModule189 = {
        saveToLocalStorage,
        readFromLocalStorage,
        updateUI
    };
})();