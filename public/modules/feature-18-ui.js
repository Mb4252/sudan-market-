(function() {
    'use strict';

    function createFeature18UI() {
        const container = document.createElement('div');
        container.id = 'feature-18-container';
        container.className = 'feature-container';

        const title = document.createElement('h2');
        title.textContent = 'ميزة التوسع #18';

        const content = document.createElement('div');
        content.id = 'feature-18-content';

        container.appendChild(title);
        container.appendChild(content);

        return container;
    }

    window.feature18UI = {
        createFeature18UI
    };
})();