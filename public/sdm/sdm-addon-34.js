// sdm-addon-34.js

// ميزة جديدة: عرض عدد الرسائل غير المقروءة
(function() {
    'use strict';

    // دالة تحديث عداد الرسائل غير المقروءة
    function updateUnreadCount() {
        try {
            const unreadCount = document.getElementById('sdm-unread-count');
            if (unreadCount) {
                // هنا يمكنك إضافة منطق حساب الرسائل غير المقروءة
                // مثال بسيط:
                const messages = document.querySelectorAll('#sdm-chat .message.unread');
                unreadCount.textContent = messages.length;
            }
        } catch (e) {
            console.error('Error updating unread count:', e);
        }
    }

    // تحديث العداد عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', updateUnreadCount);

    // تحديث العداد عند تلقي رسالة جديدة
    if (window.sdmEngine) {
        window.sdmEngine.on('message', updateUnreadCount);
    }

    // تحديث العداد كل 30 ثانية
    setInterval(updateUnreadCount, 30000);

    // ربط الدالة مع النافذة العالمية
    window.updateUnreadCount = updateUnreadCount;
})();