document.addEventListener('DOMContentLoaded', function() {
    const statusBtn = document.getElementById('statusBtn');
    const publishBtn = document.getElementById('publishBtn');
    const compareBtn = document.getElementById('compareBtn');

    if (statusBtn && publishBtn && compareBtn) {
        statusBtn.addEventListener('click', function() {
            // منطق عرض الحالة
        });

        publishBtn.addEventListener('click', function() {
            // منطق النشر
        });

        compareBtn.addEventListener('click', function() {
            // منطق المقارنة
        });
    }
});