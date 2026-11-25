// public/sdm/sdm-module-171.js
(function() {
    'use strict';

    // إعدادات التوسعة
    const MODULE_NAME = 'SDM Module #171';
    const STORAGE_KEY = 'sdmModule171Data';
    const UI_ELEMENT_ID = 'sdm-module-171-ui';

    // دالة تهيئة الواجهة
    function initUI() {
        const container = document.createElement('div');
        container.id = UI_ELEMENT_ID;
        container.style.margin = '10px 0';
        container.style.padding = '10px';
        container.style.border = '1px solid #ddd';
        container.style.borderRadius = '5px';

        const title = document.createElement('h3');
        title.textContent = MODULE_NAME;
        container.appendChild(title);

        const content = document.createElement('div');
        content.id = `${UI_ELEMENT_ID}-content`;
        container.appendChild(content);

        const chatContainer = document.getElementById('sdm-chat');
        if (chatContainer) {
            chatContainer.appendChild(container);
        } else {
            console.warn('Chat container not found, appending to body');
            document.body.appendChild(container);
        }

        return container;
    }

    // دالة حفظ البيانات في localStorage
    function saveData(data) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('Error saving data:', e);
            return false;
        }
    }

    // دالة تحميل البيانات من localStorage
    function loadData() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('Error loading data:', e);
            return null;
        }
    }

    // دالة تحديث الواجهة
    function updateUI(data) {
        const content = document.getElementById(`${UI_ELEMENT_ID}-content`);
        if (content) {
            content.textContent = data ? `Data loaded: ${JSON.stringify(data)}` : 'No data available';
        }
    }

    // تهيئة التوسعة
    function init() {
        try {
            const ui = initUI();
            const data = loadData();
            updateUI(data);

            // مثال على استخدام البيانات
            if (!data) {
                const sampleData = {
                    timestamp: new Date().toISOString(),
                    message: 'Sample data for SDM Module #171'
                };
                saveData(sampleData);
                updateUI(sampleData);
            }
        } catch (e) {
            console.error('Error initializing SDM Module #171:', e);
        }
    }

    // تشغيل التوسعة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // تصدير الدوال العامة
    window.sdmModule171 = {
        saveData,
        loadData,
        updateUI
    };
})();