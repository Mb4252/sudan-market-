// public/sdm/sdm-module-193.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_NAME = 'SDM Module #193';
    const STORAGE_KEY = 'sdmModule193Data';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleElement = document.getElementById('sdm-module-193');
            if (!moduleElement) {
                console.warn(`${MODULE_NAME}: Required DOM element not found`);
                return;
            }

            // تحميل البيانات من localStorage
            const storedData = loadModuleData();

            // عرض البيانات في الواجهة
            displayModuleData(moduleElement, storedData);

            // إعداد مستمعين الأحداث
            setupEventListeners(moduleElement);

            console.log(`${MODULE_NAME}: Initialized successfully`);
        } catch (error) {
            console.error(`${MODULE_NAME}: Initialization failed`, error);
        }
    }

    // دالة تحميل البيانات من localStorage
    function loadModuleData() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : { count: 0, lastUpdated: new Date().toISOString() };
        } catch (error) {
            console.error(`${MODULE_NAME}: Error loading data`, error);
            return { count: 0, lastUpdated: new Date().toISOString() };
        }
    }

    // دالة عرض البيانات في الواجهة
    function displayModuleData(element, data) {
        try {
            if (!element || !data) return;

            // استخدام الدالة الآمنة من dom-date-guard.js
            const formattedDate = safeFormatDate(new Date(data.lastUpdated), 'ar-SD', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            // تحديث محتوى الواجهة
            element.innerHTML = `
                <div class="module-content">
                    <h3>SDM Module #193</h3>
                    <p>Count: <span id="module-count">${data.count}</span></p>
                    <p>Last Updated: <span id="module-date">${formattedDate}</span></p>
                    <button id="module-increment">Increment</button>
                </div>
            `;
        } catch (error) {
            console.error(`${MODULE_NAME}: Error displaying data`, error);
        }
    }

    // دالة إعداد مستمعين الأحداث
    function setupEventListeners(element) {
        try {
            const incrementButton = element.querySelector('#module-increment');
            if (incrementButton) {
                incrementButton.addEventListener('click', () => {
                    const data = loadModuleData();
                    data.count++;
                    data.lastUpdated = new Date().toISOString();
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                    displayModuleData(element, data);
                });
            }
        } catch (error) {
            console.error(`${MODULE_NAME}: Error setting up event listeners`, error);
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }

    // تصدير الدوال العامة
    window.sdmModule193 = {
        init: initModule,
        loadData: loadModuleData
    };
})();