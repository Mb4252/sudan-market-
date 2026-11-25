(function() {
    'use strict';

    function renderFeature91(data) {
        const container = document.getElementById('feature-91-container');
        if (!container) {
            console.error('Feature 91 container not found');
            return;
        }

        // إنشاء محتوى الميزة
        const content = document.createElement('div');
        content.className = 'feature-91-content';

        // التحقق من وجود البيانات قبل الإسناد
        if (data && data.title) {
            const title = document.createElement('h2');
            title.textContent = data.title;
            content.appendChild(title);
        }

        if (data && data.description) {
            const description = document.createElement('p');
            description.textContent = data.description;
            content.appendChild(description);
        }

        container.innerHTML = '';
        container.appendChild(content);
    }

    window.feature91UI = {
        render: renderFeature91
    };
})();