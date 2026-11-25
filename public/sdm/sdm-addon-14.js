// public/sdm/sdm-addon-14.js
(function() {
    'use strict';

    // إعدادات التوسعة
    const ADDON_STORAGE_KEY = 'sdmAddon14Data';
    const ADDON_NAME = 'SDM Addon #14 - Help Button';

    // دالة تهيئة التوسعة
    function initAddon() {
        // التحقق من وجود عناصر DOM المطلوبة
        const chatContainer = document.getElementById('sdm-chat');
        if (!chatContainer) {
            console.warn('SDM chat UI not found, addon cannot initialize');
            return;
        }

        // إنشاء زر المساعدة
        const helpButton = document.createElement('button');
        helpButton.id = 'sdm-help-button';
        helpButton.textContent = 'مساعدة';
        helpButton.style.position = 'fixed';
        helpButton.style.bottom = '20px';
        helpButton.style.right = '20px';
        helpButton.style.zIndex = '1000';
        helpButton.style.padding = '10px 15px';
        helpButton.style.backgroundColor = '#4CAF50';
        helpButton.style.color = 'white';
        helpButton.style.border = 'none';
        helpButton.style.borderRadius = '5px';
        helpButton.style.cursor = 'pointer';

        // إضافة الزر إلى الصفحة
        document.body.appendChild(helpButton);

        // تفاعل مع الزر
        helpButton.addEventListener('click', function() {
            // تحميل البيانات المحفوظة
            const savedData = JSON.parse(localStorage.getItem(ADDON_STORAGE_KEY)) || {};

            // عرض رسالة المساعدة
            alert(`مرحبًا! هذا زر ${ADDON_NAME}.

البيانات المحفوظة:
${JSON.stringify(savedData, null, 2)}`);

            // حفظ بيانات جديدة
            const newData = {
                lastHelpRequest: new Date().toISOString(),
                userId: 'user_' + Math.random().toString(36).substr(2, 9)
            };
            localStorage.setItem(ADDON_STORAGE_KEY, JSON.stringify(newData));
        });
    }

    // تهيئة التوسعة عند تحميل الصفحة
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initAddon();
    } else {
        document.addEventListener('DOMContentLoaded', initAddon);
    }

    // تحديث التوسعة عند تغيير localStorage
    window.addEventListener('storage', function(e) {
        if (e.key === ADDON_STORAGE_KEY) {
            console.log('Addon data updated in another tab');
        }
    });

    // إضافة التوسعة إلى النافذة العالمية
    window.sdmAddon14 = {
        name: ADDON_NAME,
        storageKey: ADDON_STORAGE_KEY
    };
})();