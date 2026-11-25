// public/sdm/sdm-module-164.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule164Data';
    const MODULE_NAME = 'SDM Module #164';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const chatElement = document.getElementById('sdm-chat');
            if (!chatElement) {
                console.warn('SDM chat UI not found, module will not initialize');
                return;
            }

            // إنشاء عنصر جديد للوحدة
            const moduleElement = document.createElement('div');
            moduleElement.id = 'sdm-module-164';
            moduleElement.className = 'sdm-module';

            // إضافة محتوى الوحدة
            const content = document.createElement('p');
            content.textContent = 'Module 164: Local Storage Counter';
            moduleElement.appendChild(content);

            // إضافة زر زيادة العداد
            const incrementButton = document.createElement('button');
            incrementButton.textContent = '+';
            incrementButton.addEventListener('click', incrementCounter);
            moduleElement.appendChild(incrementButton);

            // إضافة عرض العداد
            const counterDisplay = document.createElement('span');
            counterDisplay.id = 'sdm-module-164-counter';
            counterDisplay.textContent = getCounterValue();
            moduleElement.appendChild(counterDisplay);

            // إضافة زر إعادة تعيين العداد
            const resetButton = document.createElement('button');
            resetButton.textContent = 'Reset';
            resetButton.addEventListener('click', resetCounter);
            moduleElement.appendChild(resetButton);

            // إضافة الوحدة إلى واجهة المستخدم
            chatElement.appendChild(moduleElement);
        } catch (error) {
            console.error('Error initializing SDM Module #164:', error);
        }
    }

    // دالة لجلب قيمة العداد
    function getCounterValue() {
        try {
            const value = localStorage.getItem(MODULE_STORAGE_KEY);
            return value ? parseInt(value, 10) : 0;
        } catch (error) {
            console.error('Error getting counter value:', error);
            return 0;
        }
    }

    // دالة لزيادة العداد
    function incrementCounter() {
        try {
            const currentValue = getCounterValue();
            const newValue = currentValue + 1;
            localStorage.setItem(MODULE_STORAGE_KEY, newValue.toString());
            const counterDisplay = document.getElementById('sdm-module-164-counter');
            if (counterDisplay) {
                counterDisplay.textContent = newValue;
            }
        } catch (error) {
            console.error('Error incrementing counter:', error);
        }
    }

    // دالة لإعادة تعيين العداد
    function resetCounter() {
        try {
            localStorage.setItem(MODULE_STORAGE_KEY, '0');
            const counterDisplay = document.getElementById('sdm-module-164-counter');
            if (counterDisplay) {
                counterDisplay.textContent = '0';
            }
        } catch (error) {
            console.error('Error resetting counter:', error);
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initModule();
    } else {
        document.addEventListener('DOMContentLoaded', initModule);
    }

    // تصدير الدوال إذا كان مطلوباً
    window.sdmModule164 = {
        init: initModule,
        getCounterValue: getCounterValue,
        incrementCounter: incrementCounter,
        resetCounter: resetCounter
    };

})();