// في feature-83-ui.js

// تأكد من وجود العنصر قبل استخدام .textContent
document.addEventListener('DOMContentLoaded', function() {
    const element = document.getElementById('feature-83-status');
    if (element) {
        element.textContent = 'تم تحميل ميزة 83 بنجاح';
    } else {
        console.warn('عنصر feature-83-status غير موجود في DOM');
    }
});
