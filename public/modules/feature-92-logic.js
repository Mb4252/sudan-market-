/**
 * Logic Module for Feature 92 - Wired Expansion
 * Handles all business logic for the wired expansion feature
 */
(function() {
    'use strict';

    // Initialize logic components
    function initLogic() {
        // Connect UI events to logic functions
        if (window.feature92UI) {
            window.feature92UI.handlePublish = handlePublish;
            window.feature92UI.handleCompare = handleCompare;
        }
    }

    // Handle publish operation
    async function handlePublish() {
        try {
            const newPost = {
                author: 'مستخدم',
                content: 'منتج جديد',
                price: 100,
                city: 'الخرطوم',
                timestamp: new Date().toISOString()
            };

            if (window.store.isValidDate(new Date(newPost.timestamp))) {
                const createdPost = await window.api.createPost(newPost);
                window.store.addPost(createdPost);
                window.store.updateStatus('تم النشر بنجاح');
            } else {
                throw new Error('تاريخ غير صالح');
            }
        } catch (error) {
            window.store.updateStatus(`خطأ: ${error.message}`);
        }
    }

    // Handle compare operation
    async function handleCompare() {
        try {
            const compareData = await window.api.fetchCompareData();
            window.store.updateCompareData(compareData);
            window.store.updateStatus('تم المقارنة بنجاح');
        } catch (error) {
            window.store.updateStatus(`خطأ: ${error.message}`);
        }
    }

    // Public API
    window.feature92Logic = {
        init: initLogic
    };

    // Initialize logic when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLogic);
    } else {
        initLogic();
    }
})();