(function() {
    'use strict';
    
    // مفتاح تخزين في localStorage
    const UNREAD_MESSAGES_KEY = 'sdmUnreadMessagesCount';
    
    // التحقق من وجود العنصر DOM للشريط العلوي
    const statusBarElement = document.getElementById('connection-status');
    
    // دالة لتحديث عدد الرسائل غير المقروءة
    function updateUnreadMessagesCount(count) {
        try {
            if (!statusBarElement) {
                console.error('Element #connection-status not found!');
                return;
            }
            
            // إزالة أي نص سابق عن الرسائل غير المقروءة
            const currentText = statusBarElement.textContent;
            const regex = /(\d+) رسا(?:لة|لات) (?:غير)? مقروء(?:ة|ون)/;
            const newText = currentText.replace(regex, '');
            
            // إضافة عدد الرسائل غير المقروءة
            if (count > 0) {
                statusBarElement.textContent = `${newText}${count} رسالة غير مقروءة`;
            }
        } catch (e) {
            console.error('Error updating unread messages:', e);
        }
    }
    
    // دالة لتخزين عدد الرسائل غير المقروءة
    function saveUnreadMessagesCount(count) {
        try {
            localStorage.setItem(UNREAD_MESSAGES_KEY, count.toString());
        } catch (e) {
            console.error('Error saving unread messages:', e);
        }
    }
    
    // دالة لقراءة عدد الرسائل غير المقروءة
    function getUnreadMessagesCount() {
        try {
            const count = localStorage.getItem(UNREAD_MESSAGES_KEY);
            return count ? parseInt(count) : 0;
        } catch (e) {
            console.error('Error reading unread messages:', e);
            return 0;
        }
    }
    
    // التحقق من وجود العنصر DOM عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            // التحقق من وجود العنصر قبل استخدامه
            if (!statusBarElement) {
                console.error('DOMContentLoaded: Element #connection-status not found!');
                return;
            }
            
            // استرجاع عدد الرسائل غير المقروءة المخزنة
            const initialCount = getUnreadMessagesCount();
            updateUnreadMessagesCount(initialCount);
            
            // استماع إلى حدث الاستماع إلى الرسائل الجديدة
            window.addEventListener('sdm:newMessage', function(e) {
                const newCount = (e.detail && e.detail.count) ? e.detail.count : 1;
                const currentCount = getUnreadMessagesCount();
                const totalCount = currentCount + newCount;
                saveUnreadMessagesCount(totalCount);
                updateUnreadMessagesCount(totalCount);
            });
            
            // استماع إلى حدث قراءة الرسائل
            window.addEventListener('sdm:messageRead', function(e) {
                const readCount = (e.detail && e.detail.count) ? e.detail.count : 1;
                const currentCount = getUnreadMessagesCount();
                const newCount = currentCount - readCount;
                saveUnreadMessagesCount(newCount);
                updateUnreadMessagesCount(newCount);
            });
        } catch (e) {
            console.error('Error in DOMContentLoaded:', e);
        }
    });
    
    // ربط الدالة مع النافذة العالمية
    window.updateUnreadMessagesCount = updateUnreadMessagesCount;
})();