(function() {
    'use strict';

    // دالة لجلب البيانات من API
    async function fetchData(endpoint) {
        try {
            const response = await fetch(`${window.api.API_BASE}/${endpoint}`);
            if (!response.ok) throw new Error(`خطأ في جلب بيانات ${endpoint}`);
            return await response.json();
        } catch (error) {
            window.handleError(error);
            return null;
        }
    }

    // دالة لجلب بيانات الرادار
    async function fetchRadarData() {
        return await fetchData('radar');
    }

    // دالة لجلب بيانات المقارنة
    async function fetchCompareData() {
        return await fetchData('compare');
    }

    // دالة لجلب المنشورات
    async function fetchPosts() {
        return await fetchData('posts');
    }

    // دالة لإنشاء منشور جديد
    async function createPost(post) {
        try {
            const response = await fetch(`${window.api.API_BASE}/posts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(post)
            });
            if (!response.ok) throw new Error('خطأ في إنشاء المنشور');
            return await response.json();
        } catch (error) {
            window.handleError(error);
            return null;
        }
    }

    // دالة لتحديث واجهة المستخدم
    function updateUI(data, containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn(`العنصر ${containerId} غير موجود`);
            return;
        }
        container.textContent = JSON.stringify(data);
    }

    // تصدير الوظائف
    window.module4 = {
        fetchRadarData,
        fetchCompareData,
        fetchPosts,
        createPost,
        updateUI
    };
})();