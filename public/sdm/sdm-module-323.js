(function() {
    'use strict';

    // إعدادات التوسعة
    const ADDON_STORAGE_KEY = 'sdmModule323Data';
    const ADDON_NAME = 'SDM Module #323';

    // دالة تهيئة التوسعة
    function initAddon() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleElement = document.getElementById('sdm-module-323');
            if (!moduleElement) {
                console.log('Required DOM elements not found for SDM Module #323');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = loadAddonData();

            // تنفيذ الوظيفة الأساسية للتوسعة
            executeAddonFunction(savedData, moduleElement);

            // حفظ البيانات عند مغادرة الصفحة
            window.addEventListener('beforeunload', () => {
                saveAddonData(savedData);
            });
        } catch (error) {
            console.error(`Error initializing ${ADDON_NAME}:`, error);
        }
    }

    // دالة تنفيذ الوظيفة الأساسية للتوسعة
    function executeAddonFunction(data, element) {
        console.log(`${ADDON_NAME} is executing with data:`, data);

        // مثال: عرض رسالة ترحيبية
        if (element) {
            const messageElement = document.createElement('div');
            messageElement.textContent = `Welcome to ${ADDON_NAME}!`;
            element.appendChild(messageElement);
        }
    }

    // دالة تحميل البيانات المحفوظة
    function loadAddonData() {
        try {
            const data = localStorage.getItem(ADDON_STORAGE_KEY);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error(`Error loading data for ${ADDON_NAME}:`, error);
            return {};
        }
    }

    // دالة حفظ البيانات
    function saveAddonData(data) {
        try {
            localStorage.setItem(ADDON_STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error(`Error saving data for ${ADDON_NAME}:`, error);
        }
    }

    // تهيئة التوسعة عند تحميل الصفحة
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initAddon();
    } else {
        document.addEventListener('DOMContentLoaded', initAddon);
    }
})();