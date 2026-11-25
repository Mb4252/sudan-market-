// public/sdm/sdm-module-201.js
(function() {
    'use strict';

    // دالة لتخزين البيانات في localStorage
    function storeData(key, value) {
        try {
            if (!key || typeof key !== 'string') {
                throw new Error('Invalid key');
            }

            if (value === undefined) {
                throw new Error('Value is undefined');
            }

            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Error storing data:', error);
            return false;
        }
    }

    // دالة لجلب البيانات من localStorage
    function getData(key) {
        try {
            if (!key || typeof key !== 'string') {
                throw new Error('Invalid key');
            }

            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Error getting data:', error);
            return null;
        }
    }

    // دالة لتهيئة الواجهة
    function initUI() {
        const container = document.getElementById('sdm-module-201-container');

        if (!container) {
            console.warn('Container not found for SDM Module 201');
            return;
        }

        const button = document.createElement('button');
        button.textContent = 'Save Data';
        button.addEventListener('click', () => {
            const data = {
                timestamp: new Date().toISOString(),
                module: 'SDM Module 201'
            };
            storeData('sdmModule201Data', data);
            alert('Data saved successfully!');
        });

        container.appendChild(button);
    }

    // تنفيذ التهيئة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', initUI);

    // تصدير الدوال العامة
    window.sdmModule201 = {
        storeData,
        getData
    };
})();