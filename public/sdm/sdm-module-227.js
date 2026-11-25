// public/sdm/sdm-module-227.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_NAME = 'SDM Module #227';
    const STORAGE_KEY = 'sdmModule227Data';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const chatElement = document.getElementById('sdm-chat');
            if (!chatElement) {
                console.warn('SDM chat UI not found, module will not initialize');
                return;
            }

            // إنشاء عنصر جديد لعرض بيانات الوحدة
            const moduleElement = document.createElement('div');
            moduleElement.id = 'sdm-module-227';
            moduleElement.className = 'sdm-module';
            moduleElement.innerHTML = `
                <h3>${MODULE_NAME}</h3>
                <p>Last activity: <span id="sdm-module-227-last-activity">Never</span></p>
                <button id="sdm-module-227-update">Update Activity</button>
            `;

            // إضافة الوحدة إلى واجهة المستخدم
            chatElement.appendChild(moduleElement);

            // تحديث البيانات عند النقر على الزر
            document.getElementById('sdm-module-227-update').addEventListener('click', updateActivity);

            // تحميل البيانات المحفوظة
            loadSavedData();

            console.log(`${MODULE_NAME} initialized successfully`);
        } catch (error) {
            console.error(`${MODULE_NAME} initialization failed:`, error);
        }
    }

    // دالة تحديث النشاط
    function updateActivity() {
        try {
            const now = new Date();
            const formattedDate = safeFormatDate(now);

            // تحديث واجهة المستخدم
            const activityElement = document.getElementById('sdm-module-227-last-activity');
            if (activityElement) {
                activityElement.textContent = formattedDate;
            }

            // حفظ البيانات
            localStorage.setItem(STORAGE_KEY, formattedDate);

            console.log(`${MODULE_NAME} activity updated`);
        } catch (error) {
            console.error(`${MODULE_NAME} activity update failed:`, error);
        }
    }

    // دالة تحميل البيانات المحفوظة
    function loadSavedData() {
        try {
            const savedData = localStorage.getItem(STORAGE_KEY);
            if (savedData) {
                const activityElement = document.getElementById('sdm-module-227-last-activity');
                if (activityElement) {
                    activityElement.textContent = savedData;
                }
            }
        } catch (error) {
            console.error(`${MODULE_NAME} failed to load saved data:`, error);
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }

})();