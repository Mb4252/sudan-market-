(function() {
    'use strict';

    const socket = new WebSocket('wss://sudan-market-2.onrender.com');

    socket.onopen = function() {
        console.log('متصل بالبث');
    };

    socket.onmessage = function(event) {
        const data = JSON.parse(event.data);
        if (data.type === 'post') {
            window.store.addPost(data.post);
        }
    };

    function broadcast(post) {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'post',
                post: post
            }));
        } else {
            console.error('غير متصل بالبث');
        }
    }

    window.broadcast = broadcast;
})();