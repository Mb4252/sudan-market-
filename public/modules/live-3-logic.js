(function() {
    'use strict';

    const socket = new WebSocket('wss://sudan-market-2.onrender.com');

    socket.onopen = function() {
        console.log('تم الاتصال بـ WebSocket');
    };

    socket.onmessage = function(event) {
        const data = JSON.parse(event.data);
        if (data.type === 'livePost') {
            const livePosts = JSON.parse(localStorage.getItem('livePosts')) || [];
            livePosts.push(data.post);
            localStorage.setItem('livePosts', JSON.stringify(livePosts));
            window.liveUI.renderLivePosts(livePosts);
        }
    };

    socket.onerror = function(error) {
        console.error('خطأ في WebSocket:', error);
    };

    window.liveLogic = {
        socket
    };
})();