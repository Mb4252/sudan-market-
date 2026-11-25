// public/sdm/sdm-module-204.js
(function() {
    'use strict';

    // دالة لتخزين البيانات في localStorage
    function storeData(key, value) {
        try {
            if (!key || typeof key !== 'string') {
                throw new Error('Invalid key');
            }

            if (value === undefined || value === null) {
                throw new Error('Invalid value');
            }

            const data = JSON.stringify(value);
            localStorage.setItem(key, data);
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

    // دالة لتحديث واجهة المستخدم
    function updateUI() {
        try {
            const data = getData('sdmModule204Data');
            const element = document.getElementById('sdm-module-204-data');

            if (element && data) {
                element.textContent = JSON.stringify(data);
            }
        } catch (error) {
            console.error('Error updating UI:', error);
        }
    }

    // تهيئة التوسعة
    function init() {
        try {
            // تخزين بيانات افتراضية
            storeData('sdmModule204Data', {
                name: 'SDM Module 204',
                version: '1.0',
                status: 'active'
            });

            // تحديث واجهة المستخدم
            updateUI();
        } catch (error) {
            console.error('Error initializing SDM Module 204:', error);
        }
    }

    // تشغيل التهيئة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // إظهار رسالة في وحدة التحكم عند التحميل
    console.log('SDM Module 204 loaded successfully');

    // تصدير الدوال للوحدة العالمية
    window.sdmModule204 = {
        storeData,
        getData,
        updateUI
    };
})();