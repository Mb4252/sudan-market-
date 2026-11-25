(function() {
    'use strict';

    function createLiveUI() {
        const mainContent = document.getElementById('mainContent');
        if (!mainContent) return;

        const liveContainer = document.createElement('div');
        liveContainer.id = 'liveContainer';
        liveContainer.className = 'live-container';

        const liveHeader = document.createElement('h2');
        liveHeader.textContent = 'البث الحي';
        liveContainer.appendChild(liveHeader);

        const livePosts = document.createElement('div');
        livePosts.id = 'livePosts';
        livePosts.className = 'live-posts';
        liveContainer.appendChild(livePosts);

        mainContent.appendChild(liveContainer);
    }

    window.liveUI = {
        createLiveUI
    };
})();