(function() {
    'use strict';

    /**
     * دالة آمنة لتحديث حالة المنشور
     * @param {string} postId - معرف المنشور
     * @param {string} newStatus - الحالة الجديدة
     */
    function updatePostStatus(postId, newStatus) {
        const postElement = document.getElementById(`post-${postId}`);
        if (postElement) {
            window.feature45UI.safeSetTextContent(`status-${postId}`, newStatus);
        } else {
            console.warn(`[Feature-45-Logic] Post with ID "${postId}" not found.`);
        }
    }

    window.feature45Logic = {
        updatePostStatus
    };
})();