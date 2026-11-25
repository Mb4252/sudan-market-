// public/sdm/sdm-module-219.js
(function() {
    'use strict';

    // إعدادات الوحدة
    const MODULE_STORAGE_KEY = 'sdmModule219Data';
    const MODULE_NAME = 'SDM Module #219';

    // دالة تهيئة الوحدة
    function initModule() {
        try {
            // التحقق من وجود عناصر DOM المطلوبة
            const chatElement = document.getElementById('sdm-chat');
            if (!chatElement) {
                console.warn('SDM chat UI not found, module initialization aborted');
                return;
            }

            // إنشاء عنصر جديد للوحدة
            const moduleElement = document.createElement('div');
            moduleElement.id = 'sdm-module-219';
            moduleElement.className = 'sdm-module';
            moduleElement.innerHTML = `
                <h3>${MODULE_NAME}</h3>
                <div class="module-content">
                    <p>This module provides quick access to your recent posts.</p>
                    <div id="recent-posts-container"></div>
                </div>
            `;

            // إدراج الوحدة في واجهة المستخدم
            chatElement.appendChild(moduleElement);

            // تحميل المنشورات الأخيرة
            loadRecentPosts();

        } catch (error) {
            console.error(`Error initializing ${MODULE_NAME}:`, error);
        }
    }

    // دالة تحميل المنشورات الأخيرة
    function loadRecentPosts() {
        try {
            const posts = getRecentPosts();
            const container = document.getElementById('recent-posts-container');

            if (!container) {
                console.warn('Recent posts container not found');
                return;
            }

            if (posts.length === 0) {
                container.innerHTML = '<p>No recent posts found.</p>';
                return;
            }

            // عرض المنشورات الأخيرة
            container.innerHTML = posts.map(post => `
                <div class="recent-post">
                    <h4>${post.title || 'Untitled Post'}</h4>
                    <p>${post.content.substring(0, 100)}${post.content.length > 100 ? '...' : ''}</p>
                    <small>${safeFormatDate(new Date(post.date))}</small>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error loading recent posts:', error);
        }
    }

    // دالة جلب المنشورات الأخيرة
    function getRecentPosts() {
        try {
            const allPosts = window.getAllPosts ? window.getAllPosts() : [];
            return allPosts.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
        } catch (error) {
            console.error('Error getting recent posts:', error);
            return [];
        }
    }

    // تهيئة الوحدة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', initModule);

})();