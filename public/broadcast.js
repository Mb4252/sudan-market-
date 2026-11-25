(function() {
    'use strict';

    const socket = new WebSocket('wss://sudan-market-2.onrender.com');

    socket.onopen = function() {
        console.log('تم الاتصال بالبث');
        window.store.status = 'متصل';
    };

    socket.onmessage = function(event) {
        const data = JSON.parse(event.data);
        if (data.type === 'post') {
            window.store.posts.push(data.post);
            window.store.saveToLocalStorage();
        }
    };

    window.broadcast = function(post) {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'post', post: post }));
        }
    };

    window.onbeforeunload = function() {
        socket.close();
    };
})();