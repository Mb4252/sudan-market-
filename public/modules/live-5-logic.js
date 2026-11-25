// public/modules/live-5-logic.js
(function() {
    'use strict';

    // دالة لتحميل البيانات من localStorage
    function loadFromLocalStorage() {
        const data = localStorage.getItem('live5Data');
        return data ? JSON.parse(data) : null;
    }

    // دالة لحفظ البيانات في localStorage
    function saveToLocalStorage(data) {
        localStorage.setItem('live5Data', JSON.stringify(data));
    }

    // دالة لتحديث البيانات من البث الحي
    async function updateFromLiveFeed() {
        try {
            const response = await fetch('https://sudan-market-2.onrender.com/live-feed');
            if (!response.ok) throw new Error('خطأ في جلب البث الحي');
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('[Live-5-Logic] Error updating from live feed:', error);
            return null;
        }
    }

    // دالة لتحديث البيانات
    async function updateData() {
        let data = loadFromLocalStorage();
        const liveData = await updateFromLiveFeed();

        if (liveData) {
            data = {
                ...data,
                ...liveData,
                lastSync: new Date().toISOString()
            };
            saveToLocalStorage(data);
        }

        return data;
    }

    // دالة لبدء البث الحي
    async function startLiveFeed() {
        const data = await updateData();
        if (data) {
            window.live5UI.updateUI(data);
        }

        // تحديث البيانات كل 30 ثانية
        setInterval(async () => {
            const updatedData = await updateData();
            if (updatedData) {
                window.live5UI.updateUI(updatedData);
            }
        }, 30000);
    }

    // تصدير الدوال العامة
    window.live5Logic = {
        loadFromLocalStorage,
        saveToLocalStorage,
        updateFromLiveFeed,
        updateData,
        startLiveFeed
    };

    // بدء البث الحي عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', startLiveFeed);
})();