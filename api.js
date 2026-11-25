(function() {
    'use strict';

    const API_BASE = 'https://sudan-market-2.onrender.com';

    // دالة لجلب المنشورات
    async function fetchPosts() {
        const response = await fetch(`${API_BASE}/posts`);
        if (!response.ok) throw new Error('خطأ في جلب المنشورات');
        return await response.json();
    }

    // دالة لإنشاء منشور جديد
    async function createPost(post) {
        const response = await fetch(`${API_BASE}/posts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(post)
        });
        if (!response.ok) throw new Error('خطأ في إنشاء المنشور');
        return await response.json();
    }

    // دالة لجلب بيانات الرادار
    async function fetchRadarData() {
        const response = await fetch(`${API_BASE}/radar`);
        if (!response.ok) throw new Error('خطأ في جلب بيانات الرادار');
        return await response.json();
    }

    // دالة لجلب بيانات المقارنة
    async function fetchCompareData() {
        const response = await fetch(`${API_BASE}/compare`);
        if (!response.ok) throw new Error('خطأ في جلب بيانات المقارنة');
        return await response.json();
    }

    // تصدير الدوال العامة
    window.api = {
        fetchPosts,
        createPost,
        fetchRadarData,
        fetchCompareData
    };
})();