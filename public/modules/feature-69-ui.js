(function() {
    'use strict';

    function initFeature69UI() {
        const feature69Container = document.createElement('div');
        feature69Container.id = 'feature-69-container';
        feature69Container.innerHTML = `
            <div class="feature-69-controls">
                <button id="feature-69-trigger">تحليل الاتجاهات</button>
                <div id="feature-69-results"></div>
            </div>
        `;

        // تأكد من وجود العنصر قبل محاولة الإضافة
        const mainContainer = document.getElementById('main-container');
        if (mainContainer) {
            mainContainer.appendChild(feature69Container);
        } else {
            console.error('لم يتم العثور على عنصر main-container');
        }

        document.getElementById('feature-69-trigger')?.addEventListener('click', () => {
            window.feature69Logic.analyzeTrends();
        });
    }

    window.feature69UI = {
        init: initFeature69UI
    };
})();