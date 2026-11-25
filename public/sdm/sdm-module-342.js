// public/sdm/sdm-module-342.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule342Data';
    const MODULE_NAME = 'SDM Module #342';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const moduleElement = document.getElementById('sdm-module-342');
            if (!moduleElement) {
                console.error('Required DOM element not found for SDM Module #342');
                return;
            }

            // تحميل البيانات المحفوظة
            const savedData = loadModuleData();

            // إنشاء واجهة المستخدم
            createModuleUI(moduleElement, savedData);
        } catch (error) {
            console.error('Error initializing SDM Module #342:', error);
        }
    }

    // دالة تحميل البيانات المحفوظة
    function loadModuleData() {
        try {
            const data = localStorage.getItem(MODULE_STORAGE_KEY);
            return data ? JSON.parse(data) : { count: 0, lastUsed: new Date().toISOString() };
        } catch (error) {
            console.error('Error loading module data:', error);
            return { count: 0, lastUsed: new Date().toISOString() };
        }
    }

    // دالة إنشاء واجهة المستخدم
    function createModuleUI(container, data) {
        container.innerHTML = `
            <div class="module-header">${MODULE_NAME}</div>
            <div class="module-content">
                <p>Count: <span id="module-count">${data.count}</span></p>
                <p>Last used: <span id="module-last-used">${safeFormatDate(new Date(data.lastUsed))}</span></p>
                <button id="module-increment">Increment</button>
            </div>
        `;

        // إعداد المستمعين للأحداث
        const incrementButton = document.getElementById('module-increment');
        if (incrementButton) {
            incrementButton.addEventListener('click', handleIncrement);
        }
    }

    // دالة معالج الحدث للزر
    function handleIncrement() {
        try {
            const countElement = document.getElementById('module-count');
            const lastUsedElement = document.getElementById('module-last-used');

            if (countElement && lastUsedElement) {
                const currentCount = parseInt(countElement.textContent) || 0;
                const newCount = currentCount + 1;
                const now = new Date();

                countElement.textContent = newCount;
                lastUsedElement.textContent = safeFormatDate(now);

                // حفظ البيانات
                const data = {
                    count: newCount,
                    lastUsed: now.toISOString()
                };
                localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify(data));
            }
        } catch (error) {
            console.error('Error handling increment:', error);
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }
})();