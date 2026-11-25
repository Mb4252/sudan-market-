/**
 * sdm-addon-22.js
 * ميزة: تذكير بالرسائل غير المقروءة في شريط الحالة.
 * تعتمد على SDM وlocalStorage.
 */

(function() {
    'use strict';

    // استيراد الدوال الأساسية من ملفات مقفلة
    const { safeSetTextContent } = window;

    // مفتاح تخزين عدد الرسائل غير المقروءة
    const UNREAD_MESSAGES_KEY = 'sdmUnreadMessages';

    // دالة لتحديث عدد الرسائل غير المقروءة في شريط الحالة
    function updateUnreadMessagesCount() {
        try {
            // جلب عدد الرسائل غير المقروءة من localStorage
            const unreadCount = JSON.parse(localStorage.getItem(UNREAD_MESSAGES_KEY) || '0');

            // الحصول على عنصر شريط الحالة
            const statusBar = document.querySelector('.status-bar');
            if (!statusBar) return;

            // تحديث نص شريط الحالة
            if (unreadCount > 0) {
                safeSetTextContent(
                    statusBar,
                    `🔔 ${unreadCount} رسالة غير مقروءة`
                );
            } else {
                safeSetTextContent(statusBar, '');
            }
        } catch (e) {
            console.error('Error updating unread messages count:', e);
        }
    }

    // تحديث عدد الرسائل غير المقروءة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', updateUnreadMessagesCount);

    // تصدير الدالة للتواصل مع SDM
    window.updateUnreadMessagesCount = updateUnreadMessagesCount;
})();